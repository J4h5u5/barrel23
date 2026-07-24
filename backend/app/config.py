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

    # The default mailbox is configured on the server, never in the browser.
    mail_default_display_name: str = "BARREL 23"
    mail_default_email: str = ""
    mail_default_password: str = ""
    mail_default_imap_host: str = "imap.purelymail.com"
    mail_default_imap_port: int = 993
    mail_default_imap_security: str = "ssl_tls"
    mail_default_smtp_host: str = "smtp.purelymail.com"
    mail_default_smtp_port: int = 465
    mail_default_smtp_security: str = "ssl_tls"
    # A Fernet key used only for credentials of additional mailboxes.
    mail_credentials_key: str = ""
    mail_max_attachment_mb: int = 20

    model_config = {"env_file": ".env", "extra": "ignore"}

settings = Settings()
