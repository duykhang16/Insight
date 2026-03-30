"""CRUD operations for the tenants collection.

Schema:
  - _id: ObjectId
  - name: str                  — company/tenant display name
  - admin_email: str           — email of the assigned brand_admin (unique, nullable)
  - primary_contact_email: str — main customer transparency contact
  - notification_emails: list  — extra customer notification recipients
  - note: str                  — optional notes
  - created_at: datetime
  - updated_at: datetime
"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.database.connection import get_database


async def create_tenant(
    name: str,
    note: str = "",
    admin_email: str = "",
    primary_contact_email: str = "",
    notification_emails: Optional[List[str]] = None,
) -> str:
    """Create a new tenant record. Returns the new tenant's string ID."""
    db = get_database()
    doc = {
        "name": name.strip(),
        "admin_email": admin_email.strip() if admin_email else "",
        "primary_contact_email": primary_contact_email.strip().lower() if primary_contact_email else "",
        "notification_emails": [email.strip().lower() for email in (notification_emails or []) if email.strip()],
        "note": note.strip(),
        "subscription_status": "active",
        "suspended_at": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.tenants.insert_one(doc)
    return str(result.inserted_id)


async def get_all_tenants() -> list:
    """Return all tenant records."""
    db = get_database()
    docs = await db.tenants.find().sort("name", 1).to_list(500)
    return [_serialize(_apply_defaults(d)) for d in docs]


async def get_tenant_by_id(tenant_id: str) -> Optional[dict]:
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return None
    doc = await db.tenants.find_one({"_id": obj_id})
    return _serialize(_apply_defaults(doc)) if doc else None


async def get_tenant_by_admin_email(admin_email: str) -> Optional[dict]:
    """Find tenant whose admin_email matches."""
    db = get_database()
    doc = await db.tenants.find_one({"admin_email": admin_email})
    return _serialize(_apply_defaults(doc)) if doc else None


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


def _apply_defaults(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return doc
    if "primary_contact_email" not in doc:
        doc["primary_contact_email"] = ""
    if "notification_emails" not in doc:
        doc["notification_emails"] = []
    if "subscription_status" not in doc:
        doc["subscription_status"] = "active"
    if "suspended_at" not in doc:
        doc["suspended_at"] = None
    return doc
