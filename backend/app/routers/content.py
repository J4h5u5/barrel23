from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_admin
from .. import models
from ..default_content import DEFAULT_CONTENT
import copy

router = APIRouter(prefix="/api/content", tags=["content"])


def _get_or_create(db: Session) -> models.SiteContent:
    row = db.query(models.SiteContent).filter(models.SiteContent.id == 1).first()
    if not row:
        row = models.SiteContent(id=1, data=copy.deepcopy(DEFAULT_CONTENT))
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("")
def get_content(db: Session = Depends(get_db)):
    return _get_or_create(db).data


@router.put("")
def update_content(payload: dict, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    row = _get_or_create(db)
    # Merge top-level keys so partial updates work
    merged = {**row.data, **payload}
    row.data = merged
    db.commit()
    return merged
