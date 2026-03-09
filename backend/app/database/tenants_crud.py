"""CRUD operations for the tenants collection.

Schema:
  - _id: ObjectId
  - name: str          — company/tenant display name
  - admin_email: str   — email of the assigned tenant_admin (unique, nullable)
  - note: str          — optional notes
  - created_at: datetime
  - updated_at: datetime
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

from app.database.connection import get_database


async def create_tenant(name: str, note: str = "", admin_email: str = "") -> str:
    """Create a new tenant record. Returns the new tenant's string ID."""
    db = get_database()
    doc = {
        "name": name.strip(),
        "admin_email": admin_email.strip() if admin_email else "",
        "note": note.strip(),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.tenants.insert_one(doc)
    return str(result.inserted_id)


async def get_all_tenants() -> list:
    """Return all tenant records."""
    db = get_database()
    docs = await db.tenants.find().sort("name", 1).to_list(500)
    return [_serialize(d) for d in docs]


async def get_tenant_by_id(tenant_id: str) -> Optional[dict]:
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return None
    doc = await db.tenants.find_one({"_id": obj_id})
    return _serialize(doc) if doc else None


async def get_tenant_by_admin_email(admin_email: str) -> Optional[dict]:
    """Find tenant whose admin_email matches."""
    db = get_database()
    doc = await db.tenants.find_one({"admin_email": admin_email})
    return _serialize(doc) if doc else None


async def update_tenant(tenant_id: str, updates: dict) -> bool:
    """Partial update of a tenant. Returns True if matched."""
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return False
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.tenants.update_one({"_id": obj_id}, {"$set": updates})
    return result.matched_count > 0


async def assign_tenant_admin(tenant_id: str, admin_email: str) -> bool:
    """Assign an admin_email to a tenant. Returns True if matched."""
    return await update_tenant(tenant_id, {"admin_email": admin_email.strip()})


async def delete_tenant(tenant_id: str) -> bool:
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return False
    result = await db.tenants.delete_one({"_id": obj_id})
    return result.deleted_count > 0


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc
