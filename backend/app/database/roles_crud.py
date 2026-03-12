from typing import Dict, Any, List
from app.database.connection import get_database

DEFAULT_PERMISSIONS = {
    "super_admin": {
        "full_clone": True,
        "smart_sync": True,
        "batch_provision": True,
        "batch_access": True,
        "delete_ssid": True,
        "batch_delete": True,
    },
    "tenant_admin": {
        "full_clone": True,
        "smart_sync": True,
        "batch_provision": True,
        "batch_access": True,
        "delete_ssid": True,
        "batch_delete": True,
    },
    "manager": {
        "full_clone": True,
        "smart_sync": True,
        "batch_provision": False,
        "batch_access": False,
        "delete_ssid": False,
        "batch_delete": False,
    },
    "viewer": {
        "full_clone": False,
        "smart_sync": False,
        "batch_provision": False,
        "batch_access": False,
        "delete_ssid": False,
        "batch_delete": False,
    }
}

async def initialize_default_roles():
    """Seed default role permissions if collection is empty."""
    db = get_database()
    count = await db.role_permissions.count_documents({})
    if count == 0:
        docs = []
        for role, perms in DEFAULT_PERMISSIONS.items():
            docs.append({
                "role": role,
                "permissions": perms
            })
        if docs:
            await db.role_permissions.insert_many(docs)
            print("[RBAC] Initalized default role permissions.")

async def get_all_roles_permissions() -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.role_permissions.find({})
    roles = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        roles.append(doc)
    return roles

async def get_role_permissions(role: str) -> Dict[str, bool]:
    db = get_database()
    defaults = DEFAULT_PERMISSIONS.get(role, {})
    doc = await db.role_permissions.find_one({"role": role})
    if doc and "permissions" in doc:
        # Merge: defaults first, then stored values override
        merged = {**defaults, **doc["permissions"]}
        return merged
    return defaults

async def update_role_permissions(role: str, permissions: Dict[str, bool]) -> bool:
    db = get_database()
    result = await db.role_permissions.update_one(
        {"role": role},
        {"$set": {"permissions": permissions}},
        upsert=True
    )
    return result.modified_count > 0 or result.upserted_id is not None
