import os
import uuid
import mimetypes
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_admin
from ..config import settings
from .. import models

router = APIRouter(prefix="/api/media", tags=["media"])

ALLOWED = {
    "image": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "audio": {"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/flac"},
    "video": {"video/mp4", "video/webm", "video/ogg"},
}

def _detect_category(mime: str) -> str:
    for cat, mimes in ALLOWED.items():
        if mime in mimes:
            return cat
    return None


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    mime = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
    category = _detect_category(mime)
    if not category:
        raise HTTPException(400, f"File type not allowed: {mime}")

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(400, f"File exceeds {settings.max_upload_mb} MB limit")

    ext = Path(file.filename).suffix.lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_dir = Path(settings.uploads_dir) / category
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename

    with open(dest, "wb") as f:
        f.write(content)

    record = models.MediaFile(
        filename=filename,
        original_name=file.filename,
        mime_type=mime,
        size_bytes=len(content),
        category=category,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "url": f"/uploads/{category}/{filename}",
        "filename": filename,
        "original_name": file.filename,
        "category": category,
        "size_bytes": len(content),
    }


@router.get("/files")
def list_files(
    category: str = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    q = db.query(models.MediaFile)
    if category:
        q = q.filter(models.MediaFile.category == category)
    files = q.order_by(models.MediaFile.uploaded_at.desc()).all()
    return [
        {
            "id": f.id,
            "url": f"/uploads/{f.category}/{f.filename}",
            "filename": f.filename,
            "original_name": f.original_name,
            "category": f.category,
            "size_bytes": f.size_bytes,
            "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
        }
        for f in files
    ]


@router.delete("/files/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    record = db.query(models.MediaFile).filter(models.MediaFile.id == file_id).first()
    if not record:
        raise HTTPException(404, "File not found")
    path = Path(settings.uploads_dir) / record.category / record.filename
    if path.exists():
        path.unlink()
    db.delete(record)
    db.commit()
    return {"ok": True}
