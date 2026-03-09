"""Master Aruba account management API routes."""
from fastapi import APIRouter, HTTPException, Request, Depends
from typing import Dict, Any
from app.shared.auth_deps import require_internal_admin
from . import service
from .schemas import (
    MasterLinkRequest,
    MasterLinkConfirmRequest,
    MasterStatusResponse,
    MasterLinkResponse,
)

router = APIRouter(prefix="/master", tags=["master"])


@router.get("/status", response_model=MasterStatusResponse)
async def get_master_status(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Return current master account link status."""
    return await service.get_status()


@router.post("/scan")
async def scan_master_sites(
    payload: MasterLinkRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """
    Step 1: Login with Aruba credentials and classify sites by role.
    Returns admin_sites + restricted_sites WITHOUT writing to DB.
    Frontend uses this to show the confirmation modal.
    """
    try:
        result = await service.scan_sites(
            username=payload.aruba_username,
            password=payload.aruba_password,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    return {
        "total": len(result["admin_sites"]) + len(result["restricted_sites"]),
        "admin_sites": result["admin_sites"],
        "restricted_sites": result["restricted_sites"],
        # Pass token back so confirm step can skip re-login
        "_access_token": result["access_token"],
        "_expires_in": result["expires_in"],
    }


@router.post("/link", response_model=MasterLinkResponse, status_code=200)
async def link_master_account(
    payload: MasterLinkRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """
    Direct link (all-admin path): validates ALL sites are admin, then links.
    Used when scan shows 0 restricted sites.
    """
    try:
        result = await service.link_account(
            username=payload.aruba_username,
            password=payload.aruba_password,
            linked_by=user["email"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return result


@router.post("/link-confirm", response_model=MasterLinkResponse, status_code=200)
async def link_confirm_partial(
    payload: MasterLinkConfirmRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """
    Step 2: User confirmed to link admin-only sites, skipping restricted ones.
    Frontend sends the _access_token from scan + confirmed_admin_site_ids.
    """
    if not payload.confirmed_admin_site_ids:
        raise HTTPException(status_code=400, detail="Danh sách site Admin không được rỗng.")

    # We re-login here because we cannot safely pass raw tokens in request bodies
    # (tokens are ephemeral; the small latency of re-login is acceptable)
    try:
        scan = await service.scan_sites(
            username=payload.aruba_username,
            password=payload.aruba_password,
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    confirmed_set = set(payload.confirmed_admin_site_ids)
    # Only keep sites that are both admin AND in the confirmed list
    valid_admin_ids = [s["site_id"] for s in scan["admin_sites"] if s["site_id"] in confirmed_set]

    if not valid_admin_ids:
        raise HTTPException(status_code=400, detail="Không có site Admin hợp lệ nào được xác nhận.")

    try:
        result = await service.link_account(
            username=payload.aruba_username,
            password=payload.aruba_password,
            linked_by=user["email"],
            access_token=scan["access_token"],
            expires_in=scan["expires_in"],
            admin_site_ids=valid_admin_ids,
            restricted_site_count=len(scan["restricted_sites"]),
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.delete("/unlink")
async def unlink_master_account(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Unlink (deactivate) the current master account."""
    try:
        return await service.unlink_account()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/refresh-now")
async def force_refresh_token(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Manually force a token refresh for the master account."""
    try:
        return await service.force_refresh()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
