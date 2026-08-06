"""Server-side IMAP/SMTP access for the admin mailbox.

Passwords stay in server configuration or encrypted database fields; the
frontend only receives mailbox metadata and message content.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timezone
from email import policy
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import formataddr, getaddresses, parsedate_to_datetime, parseaddr
from html import unescape
from html.parser import HTMLParser
import imaplib
import re
import smtplib
import ssl
from typing import Iterable

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


class MailClientError(Exception):
    """A safe error message that may be shown to an admin."""


@dataclass(frozen=True)
class MailboxConfig:
    display_name: str
    email: str
    password: str
    imap_host: str
    imap_port: int
    imap_security: str
    smtp_host: str
    smtp_port: int
    smtp_security: str


@dataclass(frozen=True)
class MailAttachment:
    filename: str
    content: bytes
    content_type: str


def default_mailbox() -> MailboxConfig | None:
    if not settings.mail_default_email or not settings.mail_default_password:
        return None
    return MailboxConfig(
        display_name=settings.mail_default_display_name,
        email=settings.mail_default_email,
        password=settings.mail_default_password,
        imap_host=settings.mail_default_imap_host,
        imap_port=settings.mail_default_imap_port,
        imap_security=settings.mail_default_imap_security,
        smtp_host=settings.mail_default_smtp_host,
        smtp_port=settings.mail_default_smtp_port,
        smtp_security=settings.mail_default_smtp_security,
    )


def encrypt_password(password: str) -> str:
    if not settings.mail_credentials_key:
        raise MailClientError("MAIL_CREDENTIALS_KEY is not configured on the server")
    try:
        return Fernet(settings.mail_credentials_key.encode()).encrypt(password.encode()).decode()
    except ValueError as exc:
        raise MailClientError("MAIL_CREDENTIALS_KEY is invalid on the server") from exc


def decrypt_password(password_ciphertext: str) -> str:
    if not settings.mail_credentials_key:
        raise MailClientError("MAIL_CREDENTIALS_KEY is not configured on the server")
    try:
        return Fernet(settings.mail_credentials_key.encode()).decrypt(password_ciphertext.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise MailClientError("Saved mailbox credentials cannot be decrypted") from exc


def _normalise_security(value: str) -> str:
    value = (value or "").strip().lower().replace("/", "_").replace("-", "_")
    aliases = {"ssl_tls": "ssl_tls", "ssl": "ssl_tls", "tls": "ssl_tls", "starttls": "starttls"}
    if value not in aliases:
        raise MailClientError("Only SSL/TLS and STARTTLS mail connections are supported")
    return aliases[value]


def _connect_imap(config: MailboxConfig):
    try:
        security = _normalise_security(config.imap_security)
        context = ssl.create_default_context()
        if security == "ssl_tls":
            client = imaplib.IMAP4_SSL(config.imap_host, config.imap_port, ssl_context=context, timeout=20)
        else:
            client = imaplib.IMAP4(config.imap_host, config.imap_port, timeout=20)
            client.starttls(ssl_context=context)
        client.login(config.email, config.password)
        return client
    except Exception as exc:
        raise MailClientError("Could not connect to IMAP. Check the address, password, host and port.") from exc


def _connect_smtp(config: MailboxConfig):
    try:
        security = _normalise_security(config.smtp_security)
        context = ssl.create_default_context()
        if security == "ssl_tls":
            client = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, context=context, timeout=20)
        else:
            client = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=20)
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
        client.login(config.email, config.password)
        return client
    except Exception as exc:
        raise MailClientError("Could not connect to SMTP. Check the address, password, host and port.") from exc


def _logout(client) -> None:
    try:
        client.logout()
    except Exception:
        pass


def _decode_header(value: str | None) -> str:
    try:
        return str(make_header(decode_header(value or ""))).strip()
    except Exception:
        return value or ""


def _message_date(value: str | None) -> str | None:
    try:
        date = parsedate_to_datetime(value or "")
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return date.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError, IndexError):
        return None


def _extract_message_bytes(data) -> bytes:
    for item in data:
        if isinstance(item, tuple) and isinstance(item[1], bytes):
            return item[1]
    raise MailClientError("Mail server returned an unreadable message")


def _has_seen_flag(data) -> bool:
    for item in data:
        raw = item[0] if isinstance(item, tuple) else item
        if isinstance(raw, bytes) and b"\\Seen" in raw:
            return True
    return False


def _message_summary(uid: bytes, data) -> dict:
    message = BytesParser(policy=policy.default).parsebytes(_extract_message_bytes(data))
    from_raw = message.get("From", "")
    display_name, email = parseaddr(from_raw)
    return {
        "id": uid.decode(),
        "from": {"name": _decode_header(display_name) or email or "Unknown sender", "email": email},
        "to": _decode_header(message.get("To")),
        "subject": _decode_header(message.get("Subject")) or "(no subject)",
        "date": _message_date(message.get("Date")),
        "unread": not _has_seen_flag(data),
    }


def _message_summaries(data, requested_uids: list[bytes]) -> list[dict]:
    """Build summaries from one multi-UID FETCH response."""
    grouped: dict[bytes, list] = {}
    current_uid: bytes | None = None
    for item in data or []:
        if isinstance(item, tuple) and isinstance(item[0], bytes) and isinstance(item[1], bytes):
            match = re.search(rb"\bUID (\d+)\b", item[0])
            if not match:
                continue
            current_uid = match.group(1)
            grouped[current_uid] = [item]
        elif current_uid is not None:
            grouped[current_uid].append(item)
    summaries = {uid: _message_summary(uid, parts) for uid, parts in grouped.items()}
    return [summaries[uid] for uid in reversed(requested_uids) if uid in summaries]


def _mailbox_name(raw: bytes) -> str | None:
    text = raw.decode(errors="replace")
    matches = re.findall(r'"((?:[^"\\]|\\.)*)"', text)
    if matches:
        return matches[-1].replace('\\"', '"')
    parts = text.rsplit(" ", 1)
    return parts[-1].strip('"') if parts else None


def _folders_from_client(client) -> list[dict]:
    status, data = client.list()
    if status != "OK":
        raise MailClientError("Could not read mailbox folders")
    folders = []
    for item in data or []:
        if not isinstance(item, bytes):
            continue
        name = _mailbox_name(item)
        if not name:
            continue
        normalized = name.lower()
        label = "Inbox" if normalized == "inbox" else name
        folders.append({"id": name, "label": label})
    if not any(folder["id"].lower() == "inbox" for folder in folders):
        folders.insert(0, {"id": "INBOX", "label": "Inbox"})
    return folders


def list_folders(config: MailboxConfig) -> list[dict]:
    client = _connect_imap(config)
    try:
        return _folders_from_client(client)
    finally:
        _logout(client)


def _list_messages_from_client(client, folder: str, limit: int) -> list[dict]:
    status, _ = client.select(folder, readonly=True)
    if status != "OK":
        raise MailClientError("Could not open this mailbox folder")
    status, data = client.uid("search", None, "ALL")
    if status != "OK" or not data:
        return []
    uids = data[0].split()[-limit:]
    if not uids:
        return []
    status, message_data = client.uid(
        "fetch", b",".join(uids), "(UID BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)] FLAGS)"
    )
    if status != "OK":
        raise MailClientError("Could not read message headers")
    return _message_summaries(message_data, uids)


def list_messages(config: MailboxConfig, folder: str, limit: int = 40) -> list[dict]:
    client = _connect_imap(config)
    try:
        return _list_messages_from_client(client, folder, limit)
    finally:
        _logout(client)


def load_mailbox(config: MailboxConfig, folder: str, limit: int = 40, include_folders: bool = True) -> dict:
    """Load the folder navigation and message headers through one IMAP login."""
    client = _connect_imap(config)
    try:
        folders = _folders_from_client(client) if include_folders else []
        selected_folder = folder
        if folders and not any(item["id"] == selected_folder for item in folders):
            selected_folder = folders[0]["id"]
        return {
            "folders": folders,
            "folder": selected_folder,
            "messages": _list_messages_from_client(client, selected_folder, limit),
        }
    finally:
        _logout(client)


class _HTMLToText(HTMLParser):
    _block_tags = {"address", "article", "div", "li", "p", "section", "table", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self._block_tags or tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._block_tags:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in "".join(self.parts).splitlines()]
        return "\n".join(line for line in lines if line)


def _extract_text(message) -> str:
    candidates: Iterable = message.walk() if message.is_multipart() else [message]
    html_fallback = ""
    for part in candidates:
        if part.get_content_disposition() == "attachment":
            continue
        content_type = part.get_content_type()
        if content_type not in {"text/plain", "text/html"}:
            continue
        try:
            payload = part.get_content()
        except Exception:
            payload = part.get_payload(decode=True) or b""
            payload = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        text = str(payload)
        if content_type == "text/plain":
            # Some senders put HTML entities into their text alternative.
            return unescape(text).replace("\xa0", " ").strip()
        parser = _HTMLToText()
        try:
            parser.feed(text)
            parser.close()
            html_fallback = parser.text()
        except Exception:
            html_fallback = unescape(re.sub(r"<[^>]+>", " ", text))
    return html_fallback.replace("\xa0", " ").strip()


def _unquote_line(line: str) -> str:
    """Remove plain-text quote markers while retaining the original text."""
    return re.sub(r"^\s*(?:>\s*)+", "", line).rstrip()


def _quoted_author(line: str) -> dict | None:
    """Parse the common `On ..., Name <email> wrote:` reply separator."""
    line = _unquote_line(line).strip()
    match = re.match(r"^(?:[-–—]{2,}\s*)?On\s+(.+?)\s+wrote:\s*$", line, flags=re.IGNORECASE)
    if not match:
        return None
    details = match.group(1)
    if ", " in details:
        date_label, sender_text = details.rsplit(", ", 1)
    else:
        date_label, sender_text = "", details
    name, email = parseaddr(sender_text)
    return {
        "name": _decode_header(name) or sender_text.strip() or "Previous sender",
        "email": email,
        "date": _message_date(date_label),
        "date_label": date_label,
    }


def _outlook_quote(lines: list[str], start: int) -> tuple[dict, int] | None:
    """Parse an Outlook-style quoted header block before its message text."""
    first = _unquote_line(lines[start]).strip()
    if not first.lower().startswith("from:"):
        return None
    fields: dict[str, str] = {}
    end = start
    for index in range(start, min(len(lines), start + 8)):
        line = _unquote_line(lines[index]).strip()
        if not line:
            end = index + 1
            break
        key, separator, value = line.partition(":")
        if not separator or key.lower() not in {"from", "sent", "date", "to", "subject"}:
            break
        fields[key.lower()] = value.strip()
        end = index + 1
    if "from" not in fields or not ({"sent", "date"} & fields.keys()):
        return None
    name, email = parseaddr(fields["from"])
    date_label = fields.get("sent") or fields.get("date") or ""
    return (
        {
            "name": _decode_header(name) or fields["from"] or "Previous sender",
            "email": email,
            "date": _message_date(date_label),
            "date_label": date_label,
        },
        end,
    )


def _thread_blocks(body: str, sender: dict, date: str | None) -> list[dict]:
    """Turn quoted reply text into newest-first conversation blocks for the UI."""
    current = {
        "name": sender.get("name") or sender.get("email") or "Unknown sender",
        "email": sender.get("email") or "",
        "date": date,
        "date_label": "",
    }
    blocks = []
    lines = body.splitlines()
    collected: list[str] = []

    def append_block(metadata: dict, content: list[str]) -> None:
        text = "\n".join(_unquote_line(line) for line in content).strip()
        if text:
            blocks.append({**metadata, "body": text})

    index = 0
    while index < len(lines):
        quoted = _quoted_author(lines[index])
        outlook = _outlook_quote(lines, index)
        if quoted or outlook:
            append_block(current, collected)
            collected = []
            if quoted:
                current = quoted
                index += 1
            else:
                current, index = outlook
            continue
        collected.append(lines[index])
        index += 1
    append_block(current, collected)
    return blocks or [{**current, "body": body.strip() or "(No text content)"}]


def get_message(config: MailboxConfig, folder: str, message_id: str) -> dict:
    client = _connect_imap(config)
    try:
        status, _ = client.select(folder, readonly=True)
        if status != "OK":
            raise MailClientError("Could not open this mailbox folder")
        status, data = client.uid("fetch", message_id, "(BODY.PEEK[] FLAGS)")
        if status != "OK":
            raise MailClientError("Could not read this message")
        result = _message_summary(message_id.encode(), data)
        message = BytesParser(policy=policy.default).parsebytes(_extract_message_bytes(data))
        result["body"] = _extract_text(message)
        result["thread"] = _thread_blocks(result["body"], result["from"], result["date"])
        return result
    finally:
        _logout(client)


def _sent_folder(config: MailboxConfig, client) -> str | None:
    status, data = client.list()
    if status != "OK":
        return None
    for item in data or []:
        if isinstance(item, bytes):
            name = _mailbox_name(item)
            if name and "sent" in name.lower():
                return name
    return None


def _valid_recipients(value: str) -> list[str]:
    if "\r" in value or "\n" in value:
        raise MailClientError("Recipient address is invalid")
    addresses = [address for _, address in getaddresses([value])]
    if not addresses or any("@" not in address for address in addresses):
        raise MailClientError("Enter at least one valid recipient address")
    return addresses


def send_message(
    config: MailboxConfig,
    to: str,
    subject: str,
    body_text: str,
    body_html: str = "",
    attachments: Iterable[MailAttachment] = (),
) -> dict:
    if "\r" in subject or "\n" in subject:
        raise MailClientError("Subject is invalid")
    recipients = _valid_recipients(to)
    message = EmailMessage()
    message["From"] = formataddr((config.display_name, config.email))
    message["To"] = to
    message["Subject"] = subject or "(no subject)"
    message.set_content(body_text or "")
    if body_html:
        message.add_alternative(body_html, subtype="html")
    for attachment in attachments:
        maintype, _, subtype = attachment.content_type.partition("/")
        message.add_attachment(
            attachment.content,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=attachment.filename,
        )

    smtp = _connect_smtp(config)
    try:
        smtp.send_message(message, from_addr=config.email, to_addrs=recipients)
    except Exception as exc:
        raise MailClientError("The message could not be sent") from exc
    finally:
        try:
            smtp.quit()
        except Exception:
            pass

    saved_to_sent = False
    imap = None
    try:
        imap = _connect_imap(config)
        sent_folder = _sent_folder(config, imap)
        if sent_folder:
            status, _ = imap.append(sent_folder, "\\Seen", None, message.as_bytes())
            saved_to_sent = status == "OK"
    except Exception:
        # Sending succeeded; saving a copy in Sent is best-effort.
        pass
    finally:
        if imap:
            _logout(imap)
    return {"sent": True, "saved_to_sent": saved_to_sent}


def test_connection(config: MailboxConfig) -> None:
    imap = _connect_imap(config)
    _logout(imap)
    smtp = _connect_smtp(config)
    try:
        smtp.noop()
    finally:
        try:
            smtp.quit()
        except Exception:
            pass
