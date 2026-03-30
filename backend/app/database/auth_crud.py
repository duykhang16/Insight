from datetime import datetime, timezone
from typing import Optional, Dict, Any
from .connection import get_database
import bcrypt
import re
from app.shared.rbac import (
    ROLE_BRAND_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_VIEWER,
    normalize_legacy_role,
)

_TWO_FACTOR_DEFAULTS = {
    "two_factor_enabled": False,
    "two_factor_secret": None,
    "two_factor_label_email": None,
    "two_factor_pending_secret": None,
    "two_factor_pending_label_email": None,
}
_USER_DEFAULTS = {
    "parent_admin_id": None,
    "brand_admin_email": None,
    "is_locked": False,
}


# ===== Password helpers =====

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ===== User CRUD =====

def _normalize_email(email: Optional[str]) -> str:
    return str(email or "").strip().lower()

async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    normalized_email = _normalize_email(email)
    if not normalized_email:
        return None

    user = await db.users.find_one({"email": normalized_email})
    if not user:
        user = await db.users.find_one({
            "email": {
                "$regex": f"^{re.escape(normalized_email)}$",
                "$options": "i",
            }
        })
    if not user:
        user = await db.users.find_one({
            "$expr": {
                "$eq": [
                    {"$toLower": {"$trim": {"input": {"$ifNull": ["$email", ""]}}}},
                    normalized_email,
                ]
            }
        })
    if not user:
        return None

    normalized_role = normalize_legacy_role(user.get("role"))
    missing_defaults = {}
    if user.get("email") != normalized_email:
        missing_defaults["email"] = normalized_email
    if user.get("role") != normalized_role:
        missing_defaults["role"] = normalized_role

    for key, value in {**_USER_DEFAULTS, **_TWO_FACTOR_DEFAULTS}.items():
        if key not in user:
            missing_defaults[key] = value

    if normalized_role == ROLE_BRAND_ADMIN and not user.get("brand_admin_email"):
        missing_defaults["brand_admin_email"] = user.get("email")
    if normalized_role == ROLE_SUPER_ADMIN:
        missing_defaults["brand_admin_email"] = None
        missing_defaults["parent_admin_id"] = None

    if missing_defaults:
        await db.users.update_one({"_id": user["_id"]}, {"$set": missing_defaults})
        user = {**user, **missing_defaults}
    else:
        user = {**_USER_DEFAULTS, **_TWO_FACTOR_DEFAULTS, **user}

    return user


async def create_user(user_data: Dict[str, Any]) -> str:
    db = get_database()
    if "email" in user_data:
        user_data = {**user_data, "email": _normalize_email(user_data.get("email"))}
    result = await db.users.insert_one(user_data)
    return str(result.inserted_id)


async def create_user_with_password(
    email: str,
    password: str,
    role: str = "viewer",
    is_approved: bool = False,
    parent_admin_id: Optional[str] = None,
    brand_admin_email: Optional[str] = None,
) -> str:
    db = get_database()
    email = _normalize_email(email)
    parent_admin_id = _normalize_email(parent_admin_id)
    brand_admin_email = _normalize_email(brand_admin_email)
    if await get_user_by_email(email):
        raise ValueError("Email đã tồn tại trong hệ thống.")
    normalized_role = normalize_legacy_role(role)
    doc = {
        "email": email,
        "password_hash": hash_password(password),
        "role": normalized_role,
        "isApproved": is_approved,
        "created_at": datetime.now(timezone.utc),
        **_USER_DEFAULTS,
        **_TWO_FACTOR_DEFAULTS,
    }
    if parent_admin_id:
        doc["parent_admin_id"] = parent_admin_id
    if normalized_role == ROLE_BRAND_ADMIN:
        doc["brand_admin_email"] = email
    elif normalized_role != ROLE_SUPER_ADMIN:
        doc["brand_admin_email"] = brand_admin_email
    result = await db.users.insert_one(doc)
    return str(result.inserted_id)


async def create_user_no_password(
    email: str,
    role: str = "viewer",
    is_approved: bool = True,
    parent_admin_id: Optional[str] = None,
    brand_admin_email: Optional[str] = None,
) -> str:
    """Create user without password — must_set_password=True forces setup on first login."""
    db = get_database()
    email = _normalize_email(email)
    parent_admin_id = _normalize_email(parent_admin_id)
    brand_admin_email = _normalize_email(brand_admin_email)
    if await get_user_by_email(email):
        raise ValueError("Email đã tồn tại trong hệ thống.")
    normalized_role = normalize_legacy_role(role)
    doc = {
        "email": email,
        "role": normalized_role,
        "isApproved": is_approved,
        "must_set_password": True,
        "created_at": datetime.now(timezone.utc),
        **_USER_DEFAULTS,
        **_TWO_FACTOR_DEFAULTS,
    }
    if parent_admin_id:
        doc["parent_admin_id"] = parent_admin_id
    if normalized_role == ROLE_BRAND_ADMIN:
        doc["brand_admin_email"] = email
    elif normalized_role != ROLE_SUPER_ADMIN:
        doc["brand_admin_email"] = brand_admin_email
    result = await db.users.insert_one(doc)
    return str(result.inserted_id)


class AuthResult:
    """Structured result from authenticate_user to allow granular error handling."""
    def __init__(self, user=None, error: str = None, must_set_password: bool = False):
        self.user = user
        self.error = error  # "bad_credentials" | "not_approved"
        self.must_set_password = must_set_password

    @property
    def ok(self) -> bool:
        return self.user is not None


async def authenticate_user(email: str, password: str) -> "AuthResult":
    """Authenticate and return an AuthResult.

    Possible errors:
      "bad_credentials" — user not found, no password_hash, or wrong password
      "not_approved"    — password correct but isApproved is False
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
