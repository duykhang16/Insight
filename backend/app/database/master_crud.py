"""MongoDB CRUD operations for the master_config collection (singleton pattern).

Only one document exists at any time. All functions operate on that singleton.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from .connection import get_database


async def get_master_config() -> Optional[Dict[str, Any]]:
    """Return the active master config document, or None if not linked."""
    db = get_database()
    doc = await db.master_config.find_one({"is_active": True})
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def save_master_config(
    linked_by: str,
    username: str,
    encrypted_password: str,
    access_token: str,
    expires_in_seconds: int,
    refresh_interval_minutes: int = 25,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert or replace the master config (singleton upsert)."""
    db = get_database()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expires_in_seconds)

    doc = {
        "linked_by": linked_by,
        "linked_at": now,
        "username": username,
        "encrypted_password": encrypted_password,
        "access_token": access_token,
        "refresh_token": None,
        "expires_at": expires_at,
        "is_active": True,
        "refresh_interval_minutes": refresh_interval_minutes,
    }
    if extra:
        doc.update(extra)

    # Deactivate any existing config first
    await db.master_config.update_many({}, {"$set": {"is_active": False}})
    result = await db.master_config.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def update_master_token(access_token: str, expires_in_seconds: int, refresh_token: Optional[str] = None) -> bool:
    """Update the cached token after a successful refresh."""
    db = get_database()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expires_in_seconds)
    
    update_fields = {
        "access_token": access_token,
        "expires_at": expires_at,
    }
    if refresh_token:
        update_fields["refresh_token"] = refresh_token

    result = await db.master_config.update_one(
        {"is_active": True},
        {
            "$set": update_fields
        }
    )
    return result.modified_count > 0


async def deactivate_master_config() -> bool:
    """Soft-delete: mark master config as inactive (unlink)."""
    db = get_database()
    result = await db.master_config.update_many(
        {"is_active": True},
        {"$set": {"is_active": False}}
    )
    return result.modified_count > 0


async def get_master_token() -> Optional[str]:
    """Return the current master access token if linked and not expired.

    Returns None if not linked or token has expired.
    """
    config = await get_master_config()
    if not config:
        return None
    
    access_token = config.get("access_token")
    if not access_token:
        return None
        
    expires_at = config.get("expires_at")
    if not expires_at:
        return None
        
    # Handle both datetime objects and strings
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    elif expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    now = datetime.now(timezone.utc)
    if expires_at <= now:
        return None
        
    return access_token
