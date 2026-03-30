"""Auth dependencies — Insight JWT-based auth + Zone-aware deps.

All routes authenticate via Insight JWT (HS256, 8 h expiry).
Aruba operations additionally require a linked Master Account (per-tenant).

Tier hierarchy:
  super_admin   → AITC platform admin, creates brand admins, controls subscription state
  brand_admin   → Brand owner, links 1 Aruba account, manages brand users/zones/sites
  admin         → Zone-scoped operator under a brand_admin
  viewer        → Low-authority user under an admin
  delegator     → Low-authority user under an admin

get_current_insight_user   → any authenticated + approved user
require_super_admin        → super_admin only
require_internal_admin     → super_admin OR brand_admin OR admin
is_admin_role(user)        → helper: True if super_admin or brand_admin
resolve_admin_email(request, user) → resolve the brand admin email for Aruba operations
require_master_token       → returns master Aruba token for caller's tenant, 503 if not linked

Zone deps:
  require_zone_access      → zone member or admin-tier user
  require_zone_admin       → zone-admin or admin-tier user
"""
from fastapi import Depends, HTTPException, Request
from typing import Dict, Any, List, Optional
from app.shared.jwt_utils import verify_insight_session_token
from app.database.auth_crud import get_user_by_email
from app.database.zones_crud import get_zone_by_id
from app.database.member_permissions_crud import get_zone_role_for_user
from app.shared.rbac import (
    ROLE_BRAND_ADMIN,
    ROLE_DELEGATOR,
    ROLE_SUB_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_VIEWER,
    is_brand_admin_role,
    normalize_legacy_role,
)


# ---------------------------------------------------------------------------
# Core: resolve user from Insight JWT
# ---------------------------------------------------------------------------

async def get_current_insight_user(request: Request) -> Dict[str, Any]:
    """Verify Insight JWT → resolve user from DB → confirm approved."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Thiếu hoặc sai định dạng Authorization header.")
    token = auth.split(" ", 1)[1]

    payload = verify_insight_session_token(token)  # raises 401 on invalid/expired
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token không hợp lệ.")

    user = await get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=403, detail="Tài khoản không tồn tại trong hệ thống.")
    if not user.get("isApproved", False):
        raise HTTPException(status_code=403, detail="Tài khoản chưa được phê duyệt.")

    user["role"] = normalize_legacy_role(user.get("role"))
    # Attach JWT role to user doc for downstream checks
    user["_jwt_role"] = normalize_legacy_role(payload.get("role", user.get("role", "viewer")))
    return user


# ---------------------------------------------------------------------------
# Role tier helpers
# ---------------------------------------------------------------------------

def is_admin_role(user: Dict[str, Any]) -> bool:
    """Return True if user is super_admin or brand_admin (admin-tier)."""
    return user.get("role") in (ROLE_SUPER_ADMIN, ROLE_BRAND_ADMIN)


async def resolve_admin_email(request: Request, user: Dict[str, Any], required_scope: str = "") -> str:
    """Resolve the brand admin email that owns the Aruba master config.
    
    - brand_admin → own email
    - admin/viewer/delegator → brand_admin_email
    - super_admin → blocked from brand data access
    """
    role = user.get("role", ROLE_VIEWER)
    
    if role == ROLE_BRAND_ADMIN:
        return user["email"]
    
    if role in (ROLE_SUB_ADMIN, ROLE_VIEWER, ROLE_DELEGATOR):
        admin_email = user.get("brand_admin_email")
        if not admin_email:
            raise HTTPException(
                status_code=403,
                detail="Tài khoản chưa được gán cho Brand Admin nào. Liên hệ Admin."
            )
        return admin_email
    
    if role == ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Super Admin không truy cập trực tiếp dữ liệu brand ở thời điểm hiện tại.",
        )
    
    raise HTTPException(status_code=403, detail="Role không hợp lệ.")


# ---------------------------------------------------------------------------
# Admin-tier deps
# ---------------------------------------------------------------------------

async def require_super_admin(request: Request) -> Dict[str, Any]:
    """Super-admin-only gate. DEV-level access."""
    user = await get_current_insight_user(request)
    if user.get("role") != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Super Admin.")
    return user


async def require_internal_admin(request: Request) -> Dict[str, Any]:
    """User-management gate (super_admin OR brand_admin OR admin)."""
    user = await get_current_insight_user(request)
    if user.get("role") not in (ROLE_SUPER_ADMIN, ROLE_BRAND_ADMIN, ROLE_SUB_ADMIN):
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Admin.")
    return user


# ---------------------------------------------------------------------------
# Master token gate — per-tenant, 503 if not linked
# ---------------------------------------------------------------------------

async def require_master_token(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_insight_user),
) -> str:
    """Return the active master Aruba Bearer token for the caller's tenant.

    Resolves admin_email from user context:
      - brand_admin → own email
      - admin/viewer/delegator → brand_admin_email
      - super_admin → blocked

    Raises HTTP 503 if master account is not linked or refresh fails.
    """
    admin_email = await resolve_admin_email(request, user)
    from app.features.master.service import get_master_token_auto
    token = await get_master_token_auto(admin_email)
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


require_operator = RoleChecker([ROLE_SUPER_ADMIN, ROLE_BRAND_ADMIN, ROLE_SUB_ADMIN])
require_admin = RoleChecker([ROLE_SUPER_ADMIN, ROLE_BRAND_ADMIN])


# ---------------------------------------------------------------------------
# Zone-aware dependencies
# ---------------------------------------------------------------------------

async def require_zone_access(zone_id: str, request: Request) -> Dict[str, Any]:
    """Require caller to be a member of the zone (or admin-tier user)."""
    user = await get_current_insight_user(request)
    if user.get("role") == ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin không truy cập trực tiếp zone của brand.")
    if is_brand_admin_role(user.get("role")):
        return user
    zone_role = await get_zone_role_for_user(zone_id, user["email"])
    if not zone_role:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập vào Zone này.")
    user["_zone_role"] = zone_role
    return user


async def require_zone_admin(zone_id: str, request: Request) -> Dict[str, Any]:
    """Require caller to be a zone-level admin (or admin-tier user)."""
    user = await get_current_insight_user(request)
    if user.get("role") == ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin không quản lý trực tiếp zone của brand.")
    if is_brand_admin_role(user.get("role")):
        return user
    zone = await get_zone_by_id(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    zone_role = await get_zone_role_for_user(zone_id, user["email"])
    if zone_role != ROLE_SUB_ADMIN:
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Zone Admin.")
    user["_zone_role"] = zone_role
    return user


async def get_zone_role(email: str, zone_id: str) -> Optional[str]:
    """Return the zone_role for an email in a zone, or None if not a member."""
    return await get_zone_role_for_user(zone_id, email)
