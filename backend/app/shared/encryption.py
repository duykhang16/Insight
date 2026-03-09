"""
AES-256 encryption/decryption service for credentials.
"""
import os
import hashlib
import base64
from fastapi import HTTPException
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import INTERNAL_APP_AUTH

# Derive a 32-byte (256-bit) key from MASTER_KEY or fallback to INTERNAL_APP_AUTH
MASTER_KEY_ENV = os.getenv("MASTER_KEY", INTERNAL_APP_AUTH)
_RAW_KEY = hashlib.sha256(MASTER_KEY_ENV.encode()).digest()
_AESGCM = AESGCM(_RAW_KEY)

def encrypt_password(password: str) -> str:
    """Encrypt a password using AES-256 GCM."""
    nonce = os.urandom(12)
    ciphertext = _AESGCM.encrypt(nonce, password.encode('utf-8'), None)
    payload = nonce + ciphertext
    return base64.urlsafe_b64encode(payload).decode('utf-8')

def decrypt_password(token: str) -> str:
    """Decrypt an AES-256 GCM encrypted password."""
    try:
        payload = base64.urlsafe_b64decode(token.encode('utf-8'))
        nonce = payload[:12]
        ciphertext = payload[12:]
        decrypted = _AESGCM.decrypt(nonce, ciphertext, None)
        return decrypted.decode('utf-8')
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Mật khẩu không thể giải mã hoặc đã bị thay đổi."
        )
