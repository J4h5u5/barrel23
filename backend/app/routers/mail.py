from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_admin
from ..config import settings
from ..database import get_db
from ..mail_client import (
    MailClientError,
    MailAttachment,
    MailboxConfig,
    decrypt_password,
    default_mailbox,
    encrypt_password,
    get_message_attachment,
    get_message,
    list_folders,
    list_messages,
    load_mailbox,
    send_message,
    test_connection,
)

router = APIRouter(prefix="/api/mail", tags=["mail"])

SecurityMode = Literal["ssl_tls", "starttls"]


class MailAccountCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=1024)
    imap_host: str = Field(min_length=1, max_length=255)
    imap_port: int = Field(ge=1, le=65535)
    imap_security: SecurityMode = "ssl_tls"
    smtp_host: str = Field(min_length=1, max_length=255)
    smtp_port: int = Field(ge=1, le=65535)
    smtp_security: SecurityMode = "ssl_tls"

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Enter a valid mailbox address")
        return value

    @field_validator("imap_host", "smtp_host")
    @classmethod
    def validate_host(cls, value: str) -> str:
        value = value.strip().lower()
        if not value or any(char.isspace() for char in value):
            raise ValueError("Enter a valid mail server hostname")
        return value


def _metadata(account_id: str, config: MailboxConfig, is_default: bool) -> dict:
    return {
        "id": account_id,
        "display_name": config.display_name,
        "email": config.email,
        "imap_host": config.imap_host,
        "imap_port": config.imap_port,
        "imap_security": config.imap_security,
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_security": config.smtp_security,
        "is_default": is_default,
    }


def _config_from_row(account: models.MailAccount) -> MailboxConfig:
    return MailboxConfig(
        display_name=account.display_name,
        email=account.email,
        password=decrypt_password(account.password_ciphertext),
        imap_host=account.imap_host,
        imap_port=account.imap_port,
        imap_security=account.imap_security,
        smtp_host=account.smtp_host,
        smtp_port=account.smtp_port,
        smtp_security=account.smtp_security,
    )


def _get_mailbox(db: Session, account_id: str) -> tuple[MailboxConfig, bool]:
    if account_id == "default":
        mailbox = default_mailbox()
        if not mailbox:
            raise HTTPException(409, "The default mailbox is not configured on the server")
        return mailbox, True
    if not account_id.startswith("custom-"):
        raise HTTPException(404, "Mailbox not found")
    try:
        row_id = int(account_id.removeprefix("custom-"))
    except ValueError as exc:
        raise HTTPException(404, "Mailbox not found") from exc
    account = db.query(models.MailAccount).filter(models.MailAccount.id == row_id).first()
    if not account:
        raise HTTPException(404, "Mailbox not found")
    try:
        return _config_from_row(account), False
    except MailClientError as exc:
        raise HTTPException(409, str(exc)) from exc


def _mail_failure(exc: MailClientError) -> HTTPException:
    return HTTPException(502, str(exc))


@router.get("/accounts")
def get_accounts(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    accounts = []
    mailbox = default_mailbox()
    if mailbox:
        accounts.append(_metadata("default", mailbox, True))
    for row in db.query(models.MailAccount).order_by(models.MailAccount.created_at.asc()).all():
        try:
            accounts.append(_metadata(f"custom-{row.id}", _config_from_row(row), False))
        except MailClientError:
            # Keep the rest of the mail client available if an old encrypted entry is invalid.
            accounts.append({"id": f"custom-{row.id}", "display_name": row.display_name, "email": row.email, "broken": True})
    return {"accounts": accounts}


@router.post("/accounts")
def create_account(payload: MailAccountCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    if db.query(models.MailAccount).filter(models.MailAccount.email == payload.email).first():
        raise HTTPException(409, "This mailbox has already been added")
    config = MailboxConfig(**payload.model_dump())
    try:
        test_connection(config)
        password_ciphertext = encrypt_password(payload.password)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc
    account = models.MailAccount(password_ciphertext=password_ciphertext, **payload.model_dump(exclude={"password"}))
    db.add(account)
    db.commit()
    db.refresh(account)
    return _metadata(f"custom-{account.id}", config, False)


@router.post("/accounts/{account_id}/test")
def test_account(account_id: str, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    config, _ = _get_mailbox(db, account_id)
    try:
        test_connection(config)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc
    return {"ok": True}


@router.get("/accounts/{account_id}/folders")
def get_folders(account_id: str, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    config, _ = _get_mailbox(db, account_id)
    try:
        return {"folders": list_folders(config)}
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/messages")
def get_messages(
    account_id: str,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    try:
        return {"messages": list_messages(config, folder, limit, offset)}
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/mailbox")
def get_mailbox(
    account_id: str,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    include_folders: bool = Query(True),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    try:
        return load_mailbox(config, folder, limit, include_folders, offset)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/messages/{message_id}")
def read_message(
    account_id: str,
    message_id: str,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    try:
        return get_message(config, folder, message_id)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/messages/{message_id}/attachments/{attachment_id}")
def read_attachment(
    account_id: str,
    message_id: str,
    attachment_id: int,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    try:
        attachment = get_message_attachment(config, folder, message_id, attachment_id)
    except MailClientError as exc:
        if str(exc) == "Attachment was not found":
            raise HTTPException(404, str(exc)) from exc
        raise _mail_failure(exc) from exc
    return Response(
        content=attachment.content,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": "inline; filename*=UTF-8''" + quote(attachment.filename, safe=""),
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/accounts/{account_id}/send")
async def send_from_mailbox(
    account_id: str,
    to: str = Form(..., min_length=3, max_length=4000),
    subject: str = Form("", max_length=998),
    body_text: str = Form("", max_length=100000),
    body_html: str = Form("", max_length=200000),
    attachments: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    if len(attachments) > 10:
        raise HTTPException(413, "Attach up to 10 files per message")
    max_bytes = settings.mail_max_attachment_mb * 1024 * 1024
    total_bytes = 0
    mail_attachments = []
    for upload in attachments:
        content = await upload.read()
        total_bytes += len(content)
        if total_bytes > max_bytes:
            raise HTTPException(413, f"Attachments exceed {settings.mail_max_attachment_mb} MB")
        filename = Path(upload.filename or "attachment").name or "attachment"
        mail_attachments.append(
            MailAttachment(
                filename=filename,
                content=content,
                content_type=upload.content_type or "application/octet-stream",
            )
        )
    try:
        return send_message(config, to, subject, body_text, body_html, mail_attachments)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc
