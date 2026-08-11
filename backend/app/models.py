from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from .database import Base


class SiteContent(Base):
    """Single-row table — stores the full content JSON (matches content.js shape)."""
    __tablename__ = "site_content"

    id = Column(Integer, primary_key=True, default=1)
    data = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MediaFile(Base):
    """Tracks every uploaded file (images, audio, video)."""
    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=False, unique=True)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False)  # image | audio | video
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)


class MailAccount(Base):
    """Connection metadata for an extra mailbox managed through the admin."""

    __tablename__ = "mail_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    display_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    imap_host = Column(String(255), nullable=False)
    imap_port = Column(Integer, nullable=False)
    imap_security = Column(String(32), nullable=False, default="ssl_tls")
    smtp_host = Column(String(255), nullable=False)
    smtp_port = Column(Integer, nullable=False)
    smtp_security = Column(String(32), nullable=False, default="ssl_tls")
    password_ciphertext = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MailStar(Base):
    """Application-level starred messages, independent from IMAP folders."""

    __tablename__ = "mail_stars"
    __table_args__ = (UniqueConstraint("account_key", "source_folder", "message_id", name="uq_mail_star_account_folder_message"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_key = Column(String(255), nullable=False, index=True)
    message_id = Column(String(255), nullable=False)
    source_folder = Column(String(255), nullable=False)
    message_data = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
