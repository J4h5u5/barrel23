from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, Boolean
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
