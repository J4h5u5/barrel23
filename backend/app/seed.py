from .database import SessionLocal
from . import models
from .auth import hash_password
from .config import settings


def seed_admin():
    """Create default admin if none exists."""
    db = SessionLocal()
    try:
        if db.query(models.Admin).count() == 0:
            username = settings.admin_username
            password = settings.admin_password
            db.add(models.Admin(username=username, password_hash=hash_password(password)))
            db.commit()
            print(f"[seed] Admin created: {username}")
    finally:
        db.close()
