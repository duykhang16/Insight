"""Business logic for master Aruba account management (per-tenant)."""
from datetime import datetime, timezone
import asyncio
from typing import Optional, List, Dict, Any
from app.database.master_crud import (
    get_master_config,
    save_master_config,
    deactivate_master_config,
    update_master_token,
)
from app.shared.encryption import encrypt_password
from app.features.replay.service import replay_login
from app.features.cloner.service import get_live_account_sites
from .schemas import (
    MasterStatusResponse,
    MasterLinkResponse,
    MasterScanResponse,
    SiteScanResult,
)


# Per-tenant locks to prevent concurrent refresh attempts
_refresh_locks: Dict[str, asyncio.Lock] = {}


def _get_refresh_lock(admin_email: str) -> asyncio.Lock:
    """Get or create a lock for a specific tenant's refresh."""
    if admin_email not in _refresh_locks:
        _refresh_locks[admin_email] = asyncio.Lock()
    return _refresh_locks[admin_email]


def _fmt_dt(dt) -> str:
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _is_admin_role(role: str) -> bool:
    return (role or "").strip().lower() in ("administrator", "admin")


async def get_status(admin_email: str) -> MasterStatusResponse:
    """Get master config status for a specific brand admin."""
    config = await get_master_config(admin_email)
    if not config or not config.get("is_active"):
        return MasterStatusResponse(is_linked=False)

    token_cache = config.get("token_cache") or {}
    expires_at = token_cache.get("expires_at")
    last_refreshed = token_cache.get("last_refreshed_at")

    token_age_seconds = None
    if last_refreshed:
        if isinstance(last_refreshed, str):
            last_refreshed = datetime.fromisoformat(last_refreshed.replace("Z", "+00:00"))
        elif last_refreshed.tzinfo is None:
            last_refreshed = last_refreshed.replace(tzinfo=timezone.utc)
        token_age_seconds = int((datetime.now(timezone.utc) - last_refreshed).total_seconds())

    return MasterStatusResponse(
        is_linked=True,
        linked_by=config.get("linked_by"),
        linked_at=_fmt_dt(config.get("linked_at")),
        token_expires_at=_fmt_dt(expires_at),
        token_age_seconds=token_age_seconds,
        refresh_interval_minutes=config.get("refresh_interval_minutes", 25),
        admin_site_count=config.get("admin_site_count"),
        restricted_site_count=config.get("restricted_site_count"),
    )


async def scan_sites(username: str, password: str) -> Dict[str, Any]:
    """
    Step 1 of the link flow: login and classify sites by admin role.
    Does NOT write anything to the database.
    """
    login_result = await replay_login(username, password)
    if login_result.get("status") != "success":
        raise ValueError(f"Đăng nhập Aruba thất bại: {login_result.get('message', 'Lỗi không xác định')}")

    access_token = login_result["data"].get("access_token", "")
    expires_in = login_result.get("expires_in", 1799)

    sites = await get_live_account_sites(access_token)
    if not sites:
        raise PermissionError("Tài khoản Aruba này không có site nào.")

    admin_sites = []
    restricted_sites = []

    for s in sites:
        site_id = s.get("siteId") or s.get("id", "")
        site_name = s.get("siteName") or s.get("name", site_id)
        role = (s.get("role") or s.get("userRoleOnSite") or "").strip()

        entry = {"site_id": site_id, "site_name": site_name, "role": role}
        if _is_admin_role(role):
            admin_sites.append(entry)
        else:
            restricted_sites.append(entry)

    return {
        "access_token": access_token,
        "expires_in": expires_in,
        "admin_sites": admin_sites,
        "restricted_sites": restricted_sites,
    }


async def link_account(
    username: str,
    password: str,
    linked_by: str,
    access_token: Optional[str] = None,
    expires_in: int = 1799,
    admin_site_ids: Optional[List[str]] = None,
    restricted_site_count: int = 0,
) -> MasterLinkResponse:
    """
    Step 2 of the link flow: store credentials and token for THIS brand admin.
    """
    if not access_token:
        login_result = await replay_login(username, password)
        if login_result.get("status") != "success":
            raise ValueError(f"Đăng nhập Aruba thất bại: {login_result.get('message', 'Lỗi không xác định')}")
        access_token = login_result["data"].get("access_token", "")
        expires_in = login_result.get("expires_in", 1799)

        sites = await get_live_account_sites(access_token)
        if not sites:
            raise PermissionError("Tài khoản Aruba này không có site nào.")
        non_admin = [s for s in sites if not _is_admin_role(s.get("role") or s.get("userRoleOnSite") or "")]
        if non_admin:
            site_names = ", ".join(s.get("siteName", s.get("siteId", "?")) for s in non_admin[:5])
            raise PermissionError(
                f"Tài khoản không phải Administrator trên tất cả site. "
                f"Site thiếu quyền: {site_names}."
            )
        admin_site_count = len(sites)
    else:
        admin_site_count = len(admin_site_ids) if admin_site_ids else 0

    enc_password = encrypt_password(password)
    extra = {
        "admin_site_count": admin_site_count,
        "restricted_site_count": restricted_site_count,
    }
    if admin_site_ids is not None:
        extra["admin_site_ids"] = admin_site_ids

    config = await save_master_config(
        linked_by=linked_by,
        username=username,
        encrypted_password=enc_password,
        access_token=access_token,
        expires_in_seconds=expires_in,
        extra=extra,
    )

    expires_at = config.get("expires_at", "")
    skipped_msg = f" ({restricted_site_count} site Viewer đã bị bỏ qua)" if restricted_site_count > 0 else ""

    return MasterLinkResponse(
        message=f"Đã liên kết thành công {admin_site_count} site với quyền Admin.{skipped_msg}",
        linked_at=_fmt_dt(config.get("linked_at")),
        token_expires_at=_fmt_dt(expires_at),
        admin_site_count=admin_site_count,
        restricted_site_count=restricted_site_count,
    )


async def unlink_account(admin_email: str) -> dict:
    """Unlink THIS tenant's master account."""
    ok = await deactivate_master_config(admin_email)
    if not ok:
        raise ValueError("Không tìm thấy Master Account đang hoạt động.")
    return {"message": "Đã ngắt kết nối Master Account thành công."}


async def force_refresh(admin_email: str) -> dict:
    """Manually trigger a token refresh for THIS tenant."""
    ok, expires_at = await _refresh_token_silent(admin_email)
    if not ok:
        raise ValueError(f"Refresh thất bại logic.")

    return {
        "message": "Token đã được refresh thành công.",
        "new_expires_at": _fmt_dt(expires_at),
    }


async def refresh_token_locked(admin_email: str) -> bool:
    """
    Public method to refresh the master token for a specific tenant with locking and cool-down.
    Returns True if refreshed successfully.
    """
    config = await get_master_config(admin_email)
    if not config or not config.get("is_active"):
        return False

    # Check cool-down
    failed_at = config.get("last_refresh_failed_at")
    if failed_at:
        if isinstance(failed_at, str):
            failed_at = datetime.fromisoformat(failed_at.replace("Z", "+00:00"))
        elif failed_at.tzinfo is None:
            failed_at = failed_at.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - failed_at).total_seconds() < 120:
            return False

    lock = _get_refresh_lock(admin_email)
    async with lock:
        # Re-check expiry inside lock to avoid double refresh
        config = await get_master_config(admin_email)
        if not config: return False
        
        exp = config.get("expires_at")
        if exp:
            if isinstance(exp, str): exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            elif exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
            if (exp - datetime.now(timezone.utc)).total_seconds() >= 300:
                return True

        ok, _ = await _refresh_token_silent(admin_email)
        return ok


async def _refresh_token_silent(admin_email: str) -> (bool, Optional[datetime]):
    """Internal helper to refresh token based on stored credentials for a specific tenant."""
    config = await get_master_config(admin_email)
    if not config or not config.get("is_active"):
        return False, None

    from app.shared.encryption import decrypt_password
    try:
        plain_pass = decrypt_password(config["encrypted_password"])
        username = config["username"]
        login_result = await replay_login(username, plain_pass)

        if login_result.get("status") == "success":
            new_token = login_result["data"].get("access_token", "")
            expires_in = login_result.get("expires_in", 1799)
            updated_config = await update_master_token(admin_email, new_token, expires_in)
            return True, updated_config.get("expires_at") if isinstance(updated_config, dict) else None
        else:
            print(f"[MASTER SERVICE] Refresh failed for {admin_email}: {login_result.get('message')}")
            from app.database.master_crud import mark_refresh_failure
            await mark_refresh_failure(admin_email, login_result.get("message", "Unknown error"))
    except Exception as e:
        print(f"[MASTER SERVICE] Silent refresh error for {admin_email}: {e}")
        from app.database.master_crud import mark_refresh_failure
        await mark_refresh_failure(admin_email, str(e))

    return False, None


async def get_master_token_auto(admin_email: str) -> Optional[str]:
    """
    Returns a valid master token for a specific tenant.
    If the current token is expired or missing, it silently refreshes using stored credentials.
    Uses a per-tenant lock to prevent concurrent refresh attempts.
    """
    # 1. Quick check
    config = await get_master_config(admin_email)
    if not config or not config.get("is_active"):
        return None

    # Check for recent failures (Cool-down period: 2 minutes)
    failed_at = config.get("last_refresh_failed_at")
    if failed_at:
        if isinstance(failed_at, str):
            failed_at = datetime.fromisoformat(failed_at.replace("Z", "+00:00"))
        elif failed_at.tzinfo is None:
            failed_at = failed_at.replace(tzinfo=timezone.utc)
        
        if (datetime.now(timezone.utc) - failed_at).total_seconds() < 120:
            return config.get("access_token")

    token = config.get("access_token")
    expires_at = config.get("expires_at")

    def _needs_refresh(exp):
        if not token or not exp:
            return True
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        elif exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return (exp - datetime.now(timezone.utc)).total_seconds() < 300

    if not _needs_refresh(expires_at):
        return token

    # 2. Refresh if needed
    await refresh_token_locked(admin_email)
    new_config = await get_master_config(admin_email)
    return new_config.get("access_token") if new_config else None
