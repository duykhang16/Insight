from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Dict, Any
from app.shared.auth_deps import get_current_insight_user, require_master_token
from app.features.overview.service import overview_service
from app.shared.aruba import aruba_service
from app.database.member_permissions_crud import get_effective_site_ids_for_user
from app.shared.rbac import ROLE_BRAND_ADMIN, ROLE_SUPER_ADMIN, normalize_legacy_role

router = APIRouter(prefix="/api/v1/overview", tags=["Overview"])


async def _assert_site_access(site_id: str, user: Dict[str, Any]) -> None:
    role = normalize_legacy_role(user.get("role"))
    if role in {ROLE_SUPER_ADMIN, ROLE_BRAND_ADMIN}:
        return

    allowed_site_ids = await get_effective_site_ids_for_user(user.get("email", ""))
    if str(site_id) not in {str(item) for item in allowed_site_ids}:
        raise HTTPException(status_code=403, detail="Bạn không còn quyền truy cập site này.")


@router.get("/sites")
async def get_live_sites(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    sites = await overview_service.get_live_sites(master_token, user["email"])
    return {"status": "success", "sites": sites}


@router.get("/sites/{site_id}")
async def get_site_detail(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Site detail — BE map, trả schema chuẩn."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_detail(site_id, master_token)


@router.get("/sites/{site_id}/dashboard")
async def get_site_dashboard(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Dashboard metrics — BE map, trả schema flatten."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_dashboard(site_id, master_token)


@router.get("/sites/{site_id}/health")
async def get_site_health(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Health data — BE map, trả currentScore + history."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_health(site_id, master_token)


@router.get("/sites/{site_id}/alerts")
async def get_site_alerts(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Alerts — BE map, trả list chuẩn."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_alerts(site_id, master_token)


@router.get("/sites/{site_id}/clients")
async def get_site_clients(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Clients — BE map, trả flat schema."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_clients(site_id, master_token)


@router.get("/sites/{site_id}/wiredNetworks")
async def get_site_networks(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Networks — BE map, trả wired + wireless rows."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_networks(site_id, master_token)


@router.get("/sites/{site_id}/inventory")
async def get_site_inventory(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Inventory — BE map, trả flat devices."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_site_inventory(site_id, master_token)


@router.get("/sites/{site_id}/alert-notification")
async def get_alert_notification(
    site_id: str,
    hours: int = 24,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Get unread alert notification count for this user + site."""
    await _assert_site_access(site_id, user)
    return await overview_service.get_alert_notification(
        site_id, user["email"], master_token, hours
    )


@router.post("/sites/{site_id}/alert-notification/read")
async def mark_alerts_read(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
):
    """Mark alerts as read for this user + site."""
    await _assert_site_access(site_id, user)
    return await overview_service.mark_alerts_read(site_id, user["email"])


@router.get("/sites/{site_id}/{sub_path:path}")
async def proxy_site_endpoint(
    site_id: str,
    sub_path: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Catch-all proxy cho các sub-endpoint chưa migrate."""
    await _assert_site_access(site_id, user)
    response = await aruba_service.call_api(
        method="GET",
        endpoint=f"/api/sites/{site_id}/{sub_path}",
        aruba_token=master_token,
    )
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail="Aruba API error.")

    return response.json()

