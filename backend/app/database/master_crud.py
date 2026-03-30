<<<<<<< HEAD
"""MongoDB CRUD operations for the master_config collection (per-tenant pattern).

Each tenant_admin has their own master_config document, identified by linked_by (admin email).
=======
"""MongoDB CRUD operations for the master_config collection (singleton pattern).

Only one document exists at any time. All functions operate on that singleton.
>>>>>>> parent of 0c80cd2 (Delete backend directory)
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from .connection import get_database


<<<<<<< HEAD
async def get_master_config(admin_email: str) -> Optional[Dict[str, Any]]:
    """Return the active master config for a specific tenant admin, or None."""
    db = get_database()
    doc = await db.master_config.find_one({"is_active": True, "linked_by": admin_email})
=======
async def get_master_config() -> Optional[Dict[str, Any]]:
    """Return the active master config document, or None if not linked."""
    db = get_database()
    doc = await db.master_config.find_one({"is_active": True})
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
    """Insert or replace the master config for a specific tenant admin."""
=======
    """Insert or replace the master config (singleton upsert)."""
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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

<<<<<<< HEAD
    # Deactivate only THIS admin's existing config (not other tenants!)
    await db.master_config.update_many(
        {"linked_by": linked_by},
        {"$set": {"is_active": False}}
    )
=======
    # Deactivate any existing config first
    await db.master_config.update_many({}, {"$set": {"is_active": False}})
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    result = await db.master_config.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


<<<<<<< HEAD
async def update_master_token(admin_email: str, access_token: str, expires_in_seconds: int, refresh_token: Optional[str] = None) -> bool:
    """Update the cached token after a successful refresh for a specific tenant."""
=======
async def update_master_token(access_token: str, expires_in_seconds: int, refresh_token: Optional[str] = None) -> bool:
    """Update the cached token after a successful refresh."""
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
        {"is_active": True, "linked_by": admin_email},
=======
        {"is_active": True},
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        {
            "$set": update_fields,
            "$unset": {"last_refresh_failed_at": "", "last_refresh_error": ""}
        }
    )
    return result.modified_count > 0


<<<<<<< HEAD
async def mark_refresh_failure(admin_email: str, error_msg: str) -> bool:
    """Record a failed refresh attempt for a specific tenant."""
    db = get_database()
    result = await db.master_config.update_one(
        {"is_active": True, "linked_by": admin_email},
=======
async def mark_refresh_failure(error_msg: str) -> bool:
    """Record a failed refresh attempt for back-off logic."""
    db = get_database()
    result = await db.master_config.update_one(
        {"is_active": True},
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        {
            "$set": {
                "last_refresh_failed_at": datetime.now(timezone.utc),
                "last_refresh_error": error_msg
            }
        }
    )
    return result.modified_count > 0


<<<<<<< HEAD
async def deactivate_master_config(admin_email: str) -> bool:
    """Soft-delete: mark THIS tenant's master config as inactive (unlink)."""
    db = get_database()
    result = await db.master_config.update_many(
        {"is_active": True, "linked_by": admin_email},
=======
async def deactivate_master_config() -> bool:
    """Soft-delete: mark master config as inactive (unlink)."""
    db = get_database()
    result = await db.master_config.update_many(
        {"is_active": True},
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        {"$set": {"is_active": False}}
    )
    return result.modified_count > 0


<<<<<<< HEAD
async def get_master_token(admin_email: str) -> Optional[str]:
    """Return the current master access token for a specific tenant if linked and not expired."""
    config = await get_master_config(admin_email)
=======
async def get_master_token() -> Optional[str]:
    """Return the current master access token if linked and not expired.

    Returns None if not linked or token has expired.
    """
    config = await get_master_config()
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
