from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://barrel23:barrel23@localhost:5432/barrel23"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    admin_username: str = "admin"
    admin_password: str = "barrel23admin"
    uploads_dir: str = "/uploads"
    max_upload_mb: int = 200

    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
