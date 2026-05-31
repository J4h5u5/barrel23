from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pathlib import Path
from .config import settings
from .database import engine
from . import models
from .routers import auth, content, media
from .seed import seed_admin

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="BARREL 23 API", docs_url="/api/docs", redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://barrel23.com", "https://www.barrel23.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    seed_admin()

app.include_router(auth.router)
app.include_router(content.router)
app.include_router(media.router)

@app.get("/admin")
def admin_redirect():
    return RedirectResponse(url="/admin.html")

# Uploads volume (nginx also serves this directly for performance)
uploads_path = Path(settings.uploads_dir)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

# Frontend: look relative to backend dir (works in Docker: /app/frontend)
frontend_path = Path(__file__).parent.parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
