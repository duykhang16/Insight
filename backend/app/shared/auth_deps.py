"""Auth dependencies — Insight JWT-based auth + Zone-aware deps.

All routes authenticate via Insight JWT (HS256, 8 h expiry).
<<<<<<< HEAD
Aruba operations additionally require a linked Master Account (per-tenant).
=======
Aruba operations additionally require a linked Master Account.
>>>>>>> parent of 0c80cd2 (Delete backend directory)

Tier hierarchy:
  super_admin   → DEV-level, full control, creates tenant_admin accounts
  tenant_admin  → Tenant master, links 1 Aruba account, manages all sites in tenant, creates manager/viewer
  manager       → Sub-account, assigned sites by tenant_admin, Full Clone + Smart Sync only
  viewer        → Sub-account, assigned sites by tenant_admin, read-only

get_current_insight_user   → any authenticated + approved user
require_super_admin        → super_admin only
require_internal_admin     → super_admin OR tenant_admin
is_admin_role(user)        → helper: True if super_admin or tenant_admin
<<<<<<< HEAD
resolve_admin_email(user)  → resolve the tenant admin email for Aruba operations
require_master_token       → returns master Aruba token for caller's tenant, 503 if not linked
=======
require_master_token       → returns master Aruba token, 503 if not linked
>>>>>>> parent of 0c80cd2 (Delete backend directory)

Zone deps:
  require_zone_access      → zone member or admin-tier user
  require_zone_admin       → zone-admin or admin-tier user
"""
from fastapi import Depends, HTTPException, Request
from typing import Dict, Any, List, Optional
<<<<<<< HEAD
from app.shared.jwt_utils import verify_insight_session_token
from app.database.auth_crud import get_user_by_email
from app.database.zones_crud import get_zone_by_id
from app.database.member_permissions_crud import get_zone_role_for_user
=======
from app.shared.jwt_utils import verify_insight_token
from app.database.auth_crud import get_user_by_email
from app.database.zones_crud import get_zone_by_id, get_zone_role_for_user
>>>>>>> parent of 0c80cd2 (Delete backend directory)


# ---------------------------------------------------------------------------
# Core: resolve user from Insight JWT
# ---------------------------------------------------------------------------

async def get_current_insight_user(request: Request) -> Dict[str, Any]:
    """Verify Insight JWT → resolve user from DB → confirm approved."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Thiếu hoặc sai định dạng Authorization header.")
    token = auth.split(" ", 1)[1]

<<<<<<< HEAD
    payload = verify_insight_session_token(token)  # raises 401 on invalid/expired
=======
    payload = verify_insight_token(token)  # raises 401 on invalid/expired
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token không hợp lệ.")

    user = await get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=403, detail="Tài khoản không tồn tại trong hệ thống.")
    if not user.get("isApproved", False):
        raise HTTPException(status_code=403, detail="Tài khoản chưa được phê duyệt.")

    # Attach JWT role to user doc for downstream checks
    user["_jwt_role"] = payload.get("role", user.get("role", "viewer"))
    return user


# ---------------------------------------------------------------------------
# Role tier helpers
# ---------------------------------------------------------------------------

def is_admin_role(user: Dict[str, Any]) -> bool:
    """Return True if user is super_admin or tenant_admin (admin-tier)."""
    return user.get("role") in ("super_admin", "tenant_admin")


<<<<<<< HEAD
def resolve_admin_email(user: Dict[str, Any]) -> str:
    """Resolve the tenant admin email that owns the Aruba master config.
    
    - tenant_admin → own email
    - manager/viewer → parent_admin_id (the tenant_admin who created them)
    - super_admin → cannot access Aruba directly (403)
    """
    role = user.get("role", "viewer")
    
    if role == "tenant_admin":
        return user["email"]
    
    if role in ("manager", "viewer"):
        admin_email = user.get("parent_admin_id")
        if not admin_email:
            raise HTTPException(
                status_code=403,
                detail="Tài khoản chưa được gán cho Tenant Admin nào. Liên hệ Admin."
            )
        return admin_email
    
    if role == "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Super Admin không trực tiếp quản lý site Aruba. Đăng nhập bằng Tenant Admin."
        )
    
    raise HTTPException(status_code=403, detail="Role không hợp lệ.")


=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
# ---------------------------------------------------------------------------
# Admin-tier deps
# ---------------------------------------------------------------------------

async def require_super_admin(request: Request) -> Dict[str, Any]:
    """Super-admin-only gate. DEV-level access."""
    user = await get_current_insight_user(request)
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Super Admin.")
    return user


async def require_internal_admin(request: Request) -> Dict[str, Any]:
    """Admin-tier gate (super_admin OR tenant_admin). Used by /admin/* routes."""
    user = await get_current_insight_user(request)
    if not is_admin_role(user):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin.")
    return user


# ---------------------------------------------------------------------------
<<<<<<< HEAD
# Master token gate — per-tenant, 503 if not linked
# ---------------------------------------------------------------------------

async def require_master_token(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_insight_user),
) -> str:
    """Return the active master Aruba Bearer token for the caller's tenant.

    Resolves admin_email from user context:
      - tenant_admin → own email
      - manager/viewer → parent_admin_id
      - super_admin → 403 (cannot access Aruba directly)

    Raises HTTP 503 if master account is not linked or refresh fails.
    """
    admin_email = resolve_admin_email(user)
    from app.features.master.service import get_master_token_auto
    token = await get_master_token_auto(admin_email)
=======
# Master token gate — 503 if master not linked
# ---------------------------------------------------------------------------

async def require_master_token() -> str:
    """Return the active master Aruba Bearer token with auto-refresh.

    Raises HTTP 503 if master account is not linked or refresh fails.
    """
    from app.features.master.service import get_master_token_auto
    token = await get_master_token_auto()
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    if not token:
        raise HTTPException(
            status_code=503,
            detail="Master Account chưa được cấu hình hoặc token hết hạn. Liên hệ Admin để liên kết lại."
        )
    return token


# ---------------------------------------------------------------------------
# Role-checked convenience deps (built on get_current_insight_user)
# ---------------------------------------------------------------------------

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    async def __call__(self, user: Dict[str, Any] = Depends(get_current_insight_user)) -> Dict[str, Any]:
        if user.get("role") not in self.allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Thao tác không được phép. Yêu cầu một trong các quyền: {self.allowed_roles}"
            )
        return user


require_operator = RoleChecker(["super_admin", "tenant_admin"])
require_admin    = RoleChecker(["super_admin", "tenant_admin"])


# ---------------------------------------------------------------------------
# Zone-aware dependencies
# ---------------------------------------------------------------------------

async def require_zone_access(zone_id: str, request: Request) -> Dict[str, Any]:
<<<<<<< HEAD
    """Require caller to be a member of the zone (or admin-tier user)."""
    user = await get_current_insight_user(request)
    if is_admin_role(user):
        return user
=======
    """Require caller to be a member of the zone (or super_admin).

    Used for: GET zone detail, GET zone logs, GET zone members.
    tenant_admin must be zone creator or member.
    """
    user = await get_current_insight_user(request)
    role = user.get("role", "")
    if role == "super_admin":
        return user
    if role == "tenant_admin":
        # tenant_admin must be creator or member
        zone = await get_zone_by_id(zone_id)
        if not zone:
            raise HTTPException(status_code=404, detail="Zone không tồn tại.")
        if zone.get("created_by") == user["email"]:
            return user
        zone_role = await get_zone_role_for_user(zone_id, user["email"])
        if zone_role:
            user["_zone_role"] = zone_role
            return user
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập vào Zone này.")
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    zone_role = await get_zone_role_for_user(zone_id, user["email"])
    if not zone_role:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập vào Zone này.")
    user["_zone_role"] = zone_role
    return user


async def require_zone_admin(zone_id: str, request: Request) -> Dict[str, Any]:
<<<<<<< HEAD
    """Require caller to be a zone-level admin (or admin-tier user)."""
    user = await get_current_insight_user(request)
    if is_admin_role(user):
=======
    """Require caller to be a zone-level admin (or super_admin).

    Used for: PUT zone, POST/PUT/DELETE zone members.
    tenant_admin must be creator of this zone.
    """
    user = await get_current_insight_user(request)
    role = user.get("role", "")
    if role == "super_admin":
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        return user
    zone = await get_zone_by_id(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
<<<<<<< HEAD
=======
    if role == "tenant_admin":
        # tenant_admin can manage zones they created
        if zone.get("created_by") == user["email"]:
            return user
        # or if they are a member with manager role
        zone_role = await get_zone_role_for_user(zone_id, user["email"])
        if zone_role == "manager":
            user["_zone_role"] = zone_role
            return user
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý Zone này.")
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    zone_role = await get_zone_role_for_user(zone_id, user["email"])
    if zone_role != "manager":
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Zone Manager.")
    user["_zone_role"] = zone_role
    return user


async def get_zone_role(email: str, zone_id: str) -> Optional[str]:
    """Return the zone_role for an email in a zone, or None if not a member."""
    return await get_zone_role_for_user(zone_id, email)
