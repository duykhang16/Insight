"""Insight JWT utilities — create and verify internal session tokens.

Tokens are signed with INTERNAL_APP_AUTH (sha256 → hex digest as secret).
Expiry: 8 hours. No Aruba dependency.
"""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict

import jwt
from fastapi import HTTPException

from app.config import INTERNAL_APP_AUTH

_SECRET = hashlib.sha256(INTERNAL_APP_AUTH.encode()).hexdigest()
_ALGORITHM = "HS256"
_TOKEN_EXPIRY_HOURS = 8


def create_insight_token(email: str, role: str, extra: dict = None, expiry_hours: int = None) -> str:
    """Create a signed JWT for an Insight internal user."""
    now = datetime.now(timezone.utc)
    hours = expiry_hours if expiry_hours is not None else _TOKEN_EXPIRY_HOURS
    payload = {
        "sub": email,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=hours),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def verify_insight_token(token: str) -> Dict:
    """Verify and decode an Insight JWT. Raises HTTPException on failure."""
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ.")
