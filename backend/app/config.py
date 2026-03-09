"""Application configuration loaded from environment variables."""
import os
from dotenv import load_dotenv, find_dotenv

# find_dotenv() walks up directory tree to find .env — works from any subdirectory
load_dotenv(find_dotenv(usecwd=False))

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "insight")

# Security — Fernet key source (MUST be set via env var in production)
_DEFAULT_KEY = "secret-internal-key-change-me"
INTERNAL_APP_AUTH = os.getenv("INTERNAL_APP_AUTH", _DEFAULT_KEY)
if INTERNAL_APP_AUTH == _DEFAULT_KEY:
    import warnings
    warnings.warn(
        "[SECURITY] INTERNAL_APP_AUTH đang dùng giá trị mặc định. "
        "Hãy set biến môi trường này trước khi deploy lên production.",
        stacklevel=2,
    )

# Super Admins (comma-separated list of emails)
SUPER_ADMIN_EMAILS = [
    email.strip()
    for email in os.getenv("SUPER_ADMIN_EMAILS", "").split(",")
    if email.strip()
]

# Bootstrap password for super admins (used on first seed only)
SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "")
