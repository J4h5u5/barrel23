import io
import uuid
import mimetypes
from pathlib import Path
from PIL import Image
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Form
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_admin
from ..config import settings
from .. import models

router = APIRouter(prefix="/api/media", tags=["media"])

ALLOWED = {
    "images": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "audio":  {"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/flac"},
    "video":  {"video/mp4", "video/webm", "video/ogg"},
}

# Max dimensions per use-case preset
IMAGE_PRESETS = {
    "gallery":   (1400, 1400),  # event / carousel photos
    "portrait":  (800,  800),   # DJ portraits (square crop area)
    "thumbnail": (600,  600),   # small previews
    "original":  (9999, 9999),  # no resize (logos etc.)
}
WEBP_QUALITY = 85


def _detect_category(mime: str) -> str:
    for cat, mimes in ALLOWED.items():
        if mime in mimes:
            return cat
    return None


def _optimize_image(data: bytes, preset: str) -> tuple[bytes, str]:
    """Convert image to WebP and resize to fit within preset dimensions.
    Returns (optimized_bytes, 'webp')."""
    max_w, max_h = IMAGE_PRESETS.get(preset, IMAGE_PRESETS["gallery"])
    img = Image.open(io.BytesIO(data))

    # Strip EXIF / convert color mode
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if img.mode == "P" and "transparency" in img.info else "RGB")

    # Resize only if larger than preset (preserve aspect ratio)
    if img.width > max_w or img.height > max_h:
        img.thumbnail((max_w, max_h), Image.LANCZOS)

    # Convert RGBA → RGB for WebP (WebP supports alpha but keeps file smaller as RGB for photos)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (0, 0, 0))
        bg.paste(img, mask=img.split()[3])
        img = bg

    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue(), "webp"


def _save_file(content: bytes, category: str, ext: str) -> str:
    filename = f"{uuid.uuid4().hex}.{ext}"
    dest_dir = Path(settings.uploads_dir) / category
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / filename).write_bytes(content)
    return filename


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    preset: str = Form("gallery"),  # gallery | portrait | thumbnail | original
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    category = _detect_category(mime)
    if not category:
        raise HTTPException(400, f"File type not allowed: {mime}")

    content = await file.read()
    original_size = len(content)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if original_size > max_bytes:
        raise HTTPException(400, f"File exceeds {settings.max_upload_mb} MB limit")

    # Optimize images → WebP
    if category == "image" and preset != "original":
        try:
            content, ext = _optimize_image(content, preset)
            mime = "image/webp"
        except Exception as e:
            raise HTTPException(422, f"Image processing failed: {e}")
    else:
        ext = Path(file.filename or "file").suffix.lstrip(".").lower() or "bin"

    filename = _save_file(content, category, ext)

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
        "original_size_bytes": original_size,
        "saved_bytes": original_size - len(content),
        "preset": preset,
    }


@router.post("/resize")
async def resize_existing(
    file_id: int = Form(...),
    preset: str = Form("gallery"),
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    """Re-optimize an already-uploaded image with a different preset."""
    record = db.query(models.MediaFile).filter(models.MediaFile.id == file_id).first()
    if not record:
        raise HTTPException(404, "File not found")
    if record.category != "images":
        raise HTTPException(400, "Only images can be resized")

    path = Path(settings.uploads_dir) / record.category / record.filename
    if not path.exists():
        raise HTTPException(404, "File missing on disk")

    original_size = record.size_bytes
    content = path.read_bytes()

    try:
        optimized, ext = _optimize_image(content, preset)
    except Exception as e:
        raise HTTPException(422, f"Image processing failed: {e}")

    # Save as new file, keep old one for rollback safety
    new_filename = _save_file(optimized, record.category, ext)
    new_path = Path(settings.uploads_dir) / record.category / new_filename

    # Remove old file and update record
    path.unlink(missing_ok=True)
    record.filename = new_filename
    record.mime_type = "image/webp"
    record.size_bytes = len(optimized)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "url": f"/uploads/{record.category}/{new_filename}",
        "filename": new_filename,
        "original_name": record.original_name,
        "category": record.category,
        "size_bytes": len(optimized),
        "original_size_bytes": original_size,
        "saved_bytes": original_size - len(optimized),
        "preset": preset,
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
    path.unlink(missing_ok=True)
    db.delete(record)
    db.commit()
    return {"ok": True}
