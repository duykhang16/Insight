"""Business logic for master Aruba account management."""
from datetime import datetime, timezone
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


def _fmt_dt(dt) -> str:
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _is_admin_role(role: str) -> bool:
    return (role or "").strip().lower() in ("administrator", "admin")


async def get_status() -> MasterStatusResponse:
    config = await get_master_config()
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

    Returns a dict with:
      - access_token: str (to reuse in confirm step)
      - expires_in: int
      - admin_sites: list of {site_id, site_name, role}
      - restricted_sites: list of {site_id, site_name, role}
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
    Step 2 of the link flow: store credentials and token.

    If access_token is provided (from scan step), skips re-login.
    If admin_site_ids is provided, only those sites are tracked.
    """
    if not access_token:
        # Re-login if token not carried from scan step
        login_result = await replay_login(username, password)
        if login_result.get("status") != "success":
            raise ValueError(f"Đăng nhập Aruba thất bại: {login_result.get('message', 'Lỗi không xác định')}")
        access_token = login_result["data"].get("access_token", "")
        expires_in = login_result.get("expires_in", 1799)

        # Full validation — all sites must be admin
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


async def unlink_account() -> dict:
    ok = await deactivate_master_config()
    if not ok:
        raise ValueError("Không tìm thấy Master Account đang hoạt động.")
    return {"message": "Đã ngắt kết nối Master Account thành công."}


async def force_refresh() -> dict:
    """Manually trigger a token refresh."""
    config = await get_master_config()
    if not config or not config.get("is_active"):
        raise ValueError("Không có Master Account nào đang được liên kết.")

    from app.shared.encryption import decrypt_password
    plain_pass = decrypt_password(config["encrypted_password"])
    username = config["username"]
    login_result = await replay_login(username, plain_pass)
    if login_result.get("status") != "success":
        raise ValueError(f"Refresh thất bại: {login_result.get('message')}")

    new_token = login_result["data"].get("access_token", "")
    expires_in = login_result.get("expires_in", 1799)
    await update_master_token(new_token, expires_in)

    config_updated = await get_master_config()
    return {
        "message": "Token đã được refresh thành công.",
        "new_expires_at": _fmt_dt(config_updated.get("expires_at")),
    }
