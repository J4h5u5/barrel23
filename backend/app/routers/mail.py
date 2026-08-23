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
    restore_message,
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


class MailStarCreate(BaseModel):
    source_folder: str = Field(min_length=1, max_length=255)
    message: dict = Field(default_factory=dict)


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


def _star_account_key(account_id: str) -> str:
    return account_id


FOLDER_ORDER = {
    "inbox": 0,
    "starred": 1,
    "ongoing": 2,
    "sent": 3,
    "drafts": 4,
    "junk": 5,
    "trash": 6,
    "archive": 7,
}

VIRTUAL_FOLDERS = {
    "starred": {"id": "STARRED", "label": "Starred", "model": models.MailStar, "flag": "starred"},
    "ongoing": {"id": "ONGOING", "label": "Ongoing", "model": models.MailOngoing, "flag": "ongoing"},
}


def _virtual_folder(folder: str) -> dict | None:
    return VIRTUAL_FOLDERS.get(folder.lower())


def _folder_kind(folder: dict) -> str | None:
    """Map provider-specific system folder names to the mailbox navigation order."""
    value = f"{folder.get('id', '')} {folder.get('label', '')}".lower()
    if folder.get("id", "").lower() == "inbox":
        return "inbox"
    if folder.get("id", "").lower() == "starred":
        return "starred"
    if folder.get("id", "").lower() == "ongoing":
        return "ongoing"
    if any(name in value for name in ("sent", "outbox")):
        return "sent"
    if "draft" in value:
        return "drafts"
    if any(name in value for name in ("junk", "spam", "bulk")):
        return "junk"
    if any(name in value for name in ("trash", "deleted", "bin")):
        return "trash"
    if any(name in value for name in ("archive", "all mail")):
        return "archive"
    return None


def _ordered_folders(folders: list[dict]) -> list[dict]:
    result = list(folders)
    for key, virtual in VIRTUAL_FOLDERS.items():
        if not any(item.get("id", "").lower() == key for item in result):
            result.append({"id": virtual["id"], "label": virtual["label"]})

    def order_key(item: dict) -> tuple:
        kind = _folder_kind(item)
        return (FOLDER_ORDER.get(kind, len(FOLDER_ORDER)), (item.get("label") or item.get("id") or "").lower())

    return sorted(result, key=order_key)


def _virtual_mailbox(db: Session, account_key: str, folder: str, search: str, limit: int, offset: int) -> dict:
    virtual = _virtual_folder(folder)
    if not virtual:
        raise ValueError("Unknown virtual mailbox")
    rows = db.query(virtual["model"]).filter(virtual["model"].account_key == account_key).order_by(virtual["model"].created_at.desc()).all()
    query = search.strip().lower()
    if query:
        rows = [
            row for row in rows
            if query in " ".join(
                str((row.message_data or {}).get(key, ""))
                for key in ("subject", "to", "date", "from", "counterparty")
            ).lower()
        ]
    selected = rows[offset:offset + limit]
    messages = []
    for row in selected:
        message = dict(row.message_data or {})
        message["id"] = row.message_id
        message[virtual["flag"]] = True
        message["source_folder"] = row.source_folder
        messages.append(message)
    return {"folders": [], "folder": virtual["id"], "messages": messages, "message_total": len(rows)}


def _apply_virtual_flags(db: Session, account_key: str, folder: str, messages: list[dict]) -> None:
    if not messages:
        return
    label_ids = {}
    for virtual in VIRTUAL_FOLDERS.values():
        model = virtual["model"]
        label_ids[virtual["flag"]] = {
            row.message_id
            for row in db.query(model.message_id).filter(
                model.account_key == account_key,
                model.source_folder == folder,
            ).all()
        }
    for message in messages:
        for flag, message_ids in label_ids.items():
            message[flag] = str(message.get("id", "")) in message_ids


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
        return {"folders": _ordered_folders(list_folders(config))}
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/messages")
def get_messages(
    account_id: str,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str = Query("", max_length=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    if _virtual_folder(folder):
        mailbox = _virtual_mailbox(db, _star_account_key(account_id), folder, search, limit, offset)
        return {"messages": mailbox["messages"]}
    try:
        messages = list_messages(config, folder, limit, offset, search)
        _apply_virtual_flags(db, _star_account_key(account_id), folder, messages)
        return {"messages": messages}
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/mailbox")
def get_mailbox(
    account_id: str,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    limit: int = Query(40, ge=1, le=100),
    offset: int = Query(0, ge=0),
    include_folders: bool = Query(True),
    search: str = Query("", max_length=200),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    if _virtual_folder(folder):
        return _virtual_mailbox(db, _star_account_key(account_id), folder, search, limit, offset)
    try:
        mailbox = load_mailbox(config, folder, limit, include_folders, offset, search)
        _apply_virtual_flags(db, _star_account_key(account_id), folder, mailbox.get("messages", []))
        if mailbox.get("folders"):
            mailbox["folders"] = _ordered_folders(mailbox["folders"])
        return mailbox
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


@router.get("/accounts/{account_id}/messages/{message_id}")
def read_message(
    account_id: str,
    message_id: str,
    folder: str = Query("INBOX", min_length=1, max_length=255),
    source_folder_query: str = Query("", alias="source_folder", max_length=255),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    config, _ = _get_mailbox(db, account_id)
    message_folder = folder
    virtual = _virtual_folder(folder)
    label = None
    if virtual:
        model = virtual["model"]
        label_query = db.query(model).filter(
            model.account_key == _star_account_key(account_id),
            model.message_id == message_id,
        )
        if source_folder_query:
            label_query = label_query.filter(model.source_folder == source_folder_query)
        label = label_query.first()
        if not label:
            raise HTTPException(404, f"{virtual['label']} message not found")
        message_folder = label.source_folder
    try:
        message = get_message(config, message_folder, message_id)
        _apply_virtual_flags(db, _star_account_key(account_id), message_folder, [message])
        if label:
            message["source_folder"] = message_folder
        return message
    except MailClientError as exc:
        raise _mail_failure(exc) from exc


def _add_virtual_label(
    account_id: str,
    message_id: str,
    payload: MailStarCreate,
    db: Session,
    label_name: str = "",
) -> dict:
    virtual = _virtual_folder(label_name)
    if not virtual:
        raise ValueError("Unknown mail label")
    if _virtual_folder(payload.source_folder):
        raise HTTPException(400, f"An {label_name} message needs an IMAP source folder")
    config, _ = _get_mailbox(db, account_id)
    # Verify the UID and keep only the summary data needed for the virtual folder.
    try:
        message = get_message(config, payload.source_folder, message_id)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc
    summary = {
        key: message.get(key)
        for key in ("id", "from", "counterparty", "to", "subject", "date", "unread", "has_attachments")
        if key in message
    }
    model = virtual["model"]
    row = db.query(model).filter(
        model.account_key == _star_account_key(account_id),
        model.source_folder == payload.source_folder,
        model.message_id == message_id,
    ).first()
    if row:
        row.source_folder = payload.source_folder
        row.message_data = summary
    else:
        db.add(model(
            account_key=_star_account_key(account_id),
            message_id=message_id,
            source_folder=payload.source_folder,
            message_data=summary,
        ))
    db.commit()
    return {"ok": True, virtual["flag"]: True}


def _remove_virtual_label(account_id: str, message_id: str, source_folder: str, db: Session, label_name: str) -> dict:
    virtual = _virtual_folder(label_name)
    if not virtual:
        raise ValueError("Unknown mail label")
    model = virtual["model"]
    label_query = db.query(model).filter(
        model.account_key == _star_account_key(account_id),
        model.message_id == message_id,
    )
    if source_folder:
        label_query = label_query.filter(model.source_folder == source_folder)
    row = label_query.first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True, virtual["flag"]: False}


@router.post("/accounts/{account_id}/messages/{message_id}/star")
def star_message(
    account_id: str,
    message_id: str,
    payload: MailStarCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    return _add_virtual_label(account_id, message_id, payload, db, "starred")


@router.delete("/accounts/{account_id}/messages/{message_id}/star")
def unstar_message(
    account_id: str,
    message_id: str,
    source_folder: str = Query("", max_length=255),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    return _remove_virtual_label(account_id, message_id, source_folder, db, "starred")


@router.post("/accounts/{account_id}/messages/{message_id}/ongoing")
def mark_message_ongoing(
    account_id: str,
    message_id: str,
    payload: MailStarCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    return _add_virtual_label(account_id, message_id, payload, db, "ongoing")


@router.delete("/accounts/{account_id}/messages/{message_id}/ongoing")
def unmark_message_ongoing(
    account_id: str,
    message_id: str,
    source_folder: str = Query("", max_length=255),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    return _remove_virtual_label(account_id, message_id, source_folder, db, "ongoing")


@router.post("/accounts/{account_id}/messages/{message_id}/restore")
def restore_from_trash(
    account_id: str,
    message_id: str,
    folder: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    if folder.lower() != "trash":
        raise HTTPException(400, "Only messages in Trash can be restored")
    config, _ = _get_mailbox(db, account_id)
    try:
        restore_message(config, folder, message_id)
    except MailClientError as exc:
        raise _mail_failure(exc) from exc
    return {"ok": True, "folder": "INBOX"}


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
