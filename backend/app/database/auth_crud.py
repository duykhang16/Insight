from datetime import datetime, timezone
from typing import Optional, Dict, Any
from .connection import get_database
import bcrypt


# ===== Password helpers =====

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ===== User CRUD =====

async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    return await db.users.find_one({"email": email})


async def create_user(user_data: Dict[str, Any]) -> str:
    db = get_database()
    result = await db.users.insert_one(user_data)
    return str(result.inserted_id)


async def create_user_with_password(
    email: str,
    password: str,
    role: str = "viewer",
    is_approved: bool = False,
    parent_admin_id: Optional[str] = None,
) -> str:
    db = get_database()
    doc = {
        "email": email,
        "password_hash": hash_password(password),
        "role": role,
        "isApproved": is_approved,
        "created_at": datetime.now(timezone.utc),
    }
    if parent_admin_id:
        doc["parent_admin_id"] = parent_admin_id
    result = await db.users.insert_one(doc)
    return str(result.inserted_id)


async def create_user_no_password(
    email: str,
    role: str = "viewer",
    is_approved: bool = True,
    parent_admin_id: Optional[str] = None,
) -> str:
    """Create user without password — must_set_password=True forces setup on first login."""
    db = get_database()
    doc = {
        "email": email,
        "role": role,
        "isApproved": is_approved,
        "must_set_password": True,
        "created_at": datetime.now(timezone.utc),
    }
    if parent_admin_id:
        doc["parent_admin_id"] = parent_admin_id
    result = await db.users.insert_one(doc)
    return str(result.inserted_id)


class AuthResult:
    """Structured result from authenticate_user to allow granular error handling."""
    def __init__(self, user=None, error: str = None, must_set_password: bool = False):
        self.user = user
        self.error = error  # "bad_credentials" | "not_approved" | "no_zones"
        self.must_set_password = must_set_password

    @property
    def ok(self) -> bool:
        return self.user is not None


async def authenticate_user(email: str, password: str) -> "AuthResult":
    """Authenticate and return an AuthResult.

    Possible errors:
      "bad_credentials" — user not found, no password_hash, or wrong password
      "not_approved"    — password correct but isApproved is False
      "no_zones"        — approved but not admin and has no zone assignments
    """
    user = await get_user_by_email(email)
    if not user:
        return AuthResult(error="bad_credentials")

    password_hash = user.get("password_hash")

    # Account created without password — first login: accept any attempt,
    # but signal caller to force password setup.
    if not password_hash and user.get("must_set_password"):
        if not user.get("isApproved", False):
            return AuthResult(error="not_approved")
        return AuthResult(user=user, must_set_password=True)

    if not password_hash or not verify_password(password, password_hash):
        return AuthResult(error="bad_credentials")

    if not user.get("isApproved", False):
        return AuthResult(error="not_approved")

    # Zone check: non-admins must belong to at least one zone
    _ADMIN_ROLES = {"super_admin", "tenant_admin"}
    if user.get("role") not in _ADMIN_ROLES:
        from app.database.zones_crud import get_zones_for_member
        zones = await get_zones_for_member(user["email"])
        if not zones:
            return AuthResult(error="no_zones")

    return AuthResult(user=user)


async def reset_user_password(email: str, new_password: str) -> bool:
    db = get_database()
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    return result.matched_count > 0


async def update_user_role_approval(email: str, role: str, is_approved: bool):
    db = get_database()
    await db.users.update_one(
        {"email": email},
        {"$set": {"role": role, "isApproved": is_approved}}
    )


async def delete_user(email: str) -> bool:
    db = get_database()
    result = await db.users.delete_one({"email": email})
    return result.deleted_count > 0


# ===== Audit log =====

async def insert_audit_log(log_data: Dict[str, Any]):
    db = get_database()
    await db.audit_logs.insert_one(log_data)
