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


def _list_messages_from_client(client, folder: str, limit: int, offset: int = 0) -> tuple[list[dict], int]:
    status, _ = client.select(folder, readonly=True)
    if status != "OK":
        raise MailClientError("Could not open this mailbox folder")
    status, data = client.uid("search", None, "ALL")
    if status != "OK" or not data:
        return [], 0
    all_uids = data[0].split()
    total = len(all_uids)
    end = max(0, total - max(offset, 0))
    uids = all_uids[max(0, end - limit):end]
    if not uids:
        return [], total
    status, message_data = client.uid(
        "fetch", b",".join(uids), "(UID BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)] FLAGS)"
    )
    if status != "OK":
        raise MailClientError("Could not read message headers")
    return _message_summaries(message_data, uids), total


def list_messages(config: MailboxConfig, folder: str, limit: int = 40, offset: int = 0) -> list[dict]:
    client = _connect_imap(config)
    try:
        messages, _ = _list_messages_from_client(client, folder, limit, offset)
        return messages
    finally:
        _logout(client)


def load_mailbox(
    config: MailboxConfig, folder: str, limit: int = 40, include_folders: bool = True, offset: int = 0
) -> dict:
    """Load the folder navigation and message headers through one IMAP login."""
    client = _connect_imap(config)
    try:
        folders = _folders_from_client(client) if include_folders else []
        selected_folder = folder
        if folders and not any(item["id"] == selected_folder for item in folders):
            selected_folder = folders[0]["id"]
        messages, message_total = _list_messages_from_client(client, selected_folder, limit, offset)
        return {
            "folders": folders,
            "folder": selected_folder,
            "messages": messages,
            "message_total": message_total,
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
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in _clean_message_text("".join(self.parts)).splitlines()]
        return "\n".join(line for line in lines if line)


def _clean_message_text(text: str) -> str:
    """Drop invisible copy/paste markers frequently embedded in HTML newsletters."""
    return unescape(text).replace("\xa0", " ").translate({codepoint: None for codepoint in range(0x200B, 0x2010)} | {0xFEFF: None})


def _html_to_text(text: str) -> str:
    parser = _HTMLToText()
    try:
        parser.feed(text)
        parser.close()
        return parser.text()
    except Exception:
        return _clean_message_text(re.sub(r"<[^>]+>", " ", text))


def _looks_like_html(text: str) -> bool:
    return bool(re.search(r"<\s*(?:!doctype|html|body|p|div|br|table|tr|td|a)\b", text, flags=re.IGNORECASE))


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
            plain_text = _clean_message_text(text).strip()
            if not _looks_like_html(plain_text):
                return plain_text
            # Invalid senders occasionally label HTML as text/plain. Prefer a proper
            # HTML alternative if supplied, but never render its markup directly.
            html_fallback = _html_to_text(plain_text)
            continue
        html_fallback = _html_to_text(text)
    return _clean_message_text(html_fallback).strip()


def _message_attachments(message) -> list[MailAttachment]:
    """Extract only actual message files, including inline photo/audio/video parts."""
    attachments = []
    for part in message.walk() if message.is_multipart() else [message]:
        if part.is_multipart():
            continue
        disposition = (part.get_content_disposition() or "").lower()
        filename = _decode_header(part.get_filename())
        content_type = part.get_content_type()
        is_media = content_type.startswith(("image/", "audio/", "video/"))
        if disposition not in {"attachment", "inline"} and not filename:
            continue
        if not filename and not (disposition == "inline" and is_media):
            continue
        try:
            content = part.get_payload(decode=True) or b""
        except Exception:
            content = b""
        if not content:
            continue
        # Never return a path supplied by a mail sender as a filename.
        filename = re.split(r"[\\\\/]", filename or "attachment")[-1].strip() or "attachment"
        attachments.append(MailAttachment(filename=filename, content=content, content_type=content_type))
    return attachments


def _attachment_metadata(attachments: list[MailAttachment]) -> list[dict]:
    return [
        {
            "id": index,
            "filename": attachment.filename,
            "content_type": attachment.content_type,
            "size": len(attachment.content),
        }
        for index, attachment in enumerate(attachments)
    ]


def _unquote_line(line: str) -> str:
    """Remove plain-text quote markers while retaining the original text."""
    return re.sub(r"^\s*(?:>\s*)+", "", line).rstrip()


def _quote_metadata(date_label: str, sender_text: str) -> dict:
    name, email = parseaddr(sender_text.strip().rstrip(":"))
    if "@" not in email:
        email = ""
    return {
        "name": _decode_header(name) or email or sender_text.strip().rstrip(":") or "Previous sender",
        "email": email,
        "date": _message_date(date_label),
        "date_label": date_label.strip(" ,"),
    }


def _split_date_and_sender(details: str) -> tuple[str, str]:
    """Separate a quoted date from the author, including `13:55 CEST Name`."""
    email_match = re.search(r"<[^<>\s]+@[^<>\s]+>\s*$", details)
    before_email = details[:email_match.start()].strip() if email_match else details.strip()
    email_suffix = details[email_match.start():].strip() if email_match else ""
    times = list(
        re.finditer(
            r"(?:\b(?:at|om|в)\s*)?\d{1,2}:\d{2}(?:\s?(?:AM|PM))?(?:\s+[A-Z]{2,5})?",
            before_email,
            flags=re.IGNORECASE,
        )
    )
    if times:
        boundary = times[-1].end()
        sender = before_email[boundary:].strip(" ,")
        if sender:
            return before_email[:boundary].strip(" ,"), (sender + " " + email_suffix).strip()
    if ", " in before_email:
        date_label, sender = before_email.rsplit(", ", 1)
        return date_label, (sender + " " + email_suffix).strip()
    return "", details


def _quoted_author(line: str) -> dict | None:
    """Parse common Gmail reply separators across common locale variants."""
    line = _unquote_line(line).strip()
    line = re.sub(r"^(?:[-–—]{2,}\s*)", "", line)
    english = re.match(r"^On\s+(.+?)\s+wrote:\s*$", line, flags=re.IGNORECASE)
    if english:
        date_label, sender_text = _split_date_and_sender(english.group(1))
        return _quote_metadata(date_label, sender_text)

    spanish = re.match(
        r"^El\s+(?P<date>.+?),\s+a las\s+(?P<time>\d{1,2}:\d{2}),\s*(?P<sender>.+?)\s+escribió:\s*$",
        line,
        flags=re.IGNORECASE,
    )
    if spanish:
        return _quote_metadata(
            spanish.group("date") + ", a las " + spanish.group("time"),
            spanish.group("sender"),
        )
    spanish_author_only = re.match(
        r"^(?P<sender>.*<[^<>\s]+@[^<>\s]+>)\s+escribió:\s*$", line, flags=re.IGNORECASE
    )
    if spanish_author_only:
        return _quote_metadata("", spanish_author_only.group("sender"))

    french = re.match(
        r"^Le\s+(?P<date>.+?)\s+à\s+(?P<time>\d{1,2}:\d{2}),\s*(?P<sender>.+?)\s+a écrit\s*:\s*$",
        line,
        flags=re.IGNORECASE,
    )
    if french:
        return _quote_metadata(french.group("date") + " à " + french.group("time"), french.group("sender"))

    # Dutch, German, Swedish and Russian Gmail formats put the author after a verb.
    localized = [
        r"^Op\s+(?P<date>.+?)\s+schreef\s+(?P<sender>.+?):\s*$",
        r"^Am\s+(?P<date>.+?)\s+schrieb\s+(?P<sender>.+?):\s*$",
        r"^Den\s+(?P<date>.+?)\s+skrev\s+(?P<sender>.+?):\s*$",
        r"^В\s+(?P<date>.+?)\s+писал(?:а)?\s+(?P<sender>.+?):\s*$",
    ]
    for pattern in localized:
        match = re.match(pattern, line, flags=re.IGNORECASE)
        if match:
            return _quote_metadata(match.group("date"), match.group("sender"))

    # Russian Gmail and some mobile clients use only `date, sender <email>:`.
    generic = re.match(
        r"^(?P<date>.+?\d{1,2}:\d{2}[^,]*),\s*(?P<sender>.+<[^<>\s]+@[^<>\s]+>)\s*:\s*$",
        line,
        flags=re.IGNORECASE,
    )
    if generic:
        return _quote_metadata(generic.group("date"), generic.group("sender"))
    return None


def _quoted_author_at(lines: list[str], index: int) -> tuple[dict | None, int]:
    """Handle quote separators split across a name line and an email line."""
    parsed = _quoted_author(lines[index])
    if parsed:
        return parsed, 1
    if index + 1 >= len(lines):
        return None, 0
    next_line = _unquote_line(lines[index + 1]).strip()
    if not re.fullmatch(r"<[^<>\s]+@[^<>\s]+>(?:\s+(?:wrote|escribió))?:", next_line, flags=re.IGNORECASE):
        return None, 0
    parsed = _quoted_author(_unquote_line(lines[index]).strip() + " " + next_line)
    return (parsed, 2) if parsed else (None, 0)


def _outlook_quote(lines: list[str], start: int) -> tuple[dict, int] | None:
    """Parse an Outlook-style quoted header block before its message text."""
    first = _unquote_line(lines[start]).strip()
    if not re.match(r"^(from|от)\s*:", first, flags=re.IGNORECASE):
        return None
    fields: dict[str, str] = {}
    aliases = {
        "from": "from", "от": "from", "sent": "sent", "отправлено": "sent",
        "date": "date", "дата": "date", "to": "to", "кому": "to", "subject": "subject", "тема": "subject",
    }
    end = start
    for index in range(start, min(len(lines), start + 8)):
        line = _unquote_line(lines[index]).strip()
        if not line:
            end = index + 1
            break
        key, separator, value = line.partition(":")
        normalized_key = aliases.get(key.strip().lower())
        if not separator or not normalized_key:
            break
        fields[normalized_key] = value.strip()
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
        quoted, quoted_lines = _quoted_author_at(lines, index)
        outlook = _outlook_quote(lines, index)
        if quoted or outlook:
            append_block(current, collected)
            collected = []
            if quoted:
                current = quoted
                index += quoted_lines
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
        result["attachments"] = _attachment_metadata(_message_attachments(message))
        return result
    finally:
        _logout(client)


def get_message_attachment(config: MailboxConfig, folder: str, message_id: str, attachment_id: int) -> MailAttachment:
    """Load one attachment by index after verifying it belongs to the selected message."""
    client = _connect_imap(config)
    try:
        status, _ = client.select(folder, readonly=True)
        if status != "OK":
            raise MailClientError("Could not open this mailbox folder")
        status, data = client.uid("fetch", message_id, "(BODY.PEEK[])")
        if status != "OK":
            raise MailClientError("Could not read this message")
        message = BytesParser(policy=policy.default).parsebytes(_extract_message_bytes(data))
        attachments = _message_attachments(message)
        if attachment_id < 0 or attachment_id >= len(attachments):
            raise MailClientError("Attachment was not found")
        return attachments[attachment_id]
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
