<<<<<<< HEAD
"""Master Aruba account management API routes (per-tenant)."""
=======
"""Master Aruba account management API routes."""
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
    """Return current master account link status for THIS tenant."""
    if user.get("role") == "super_admin":
        # Super admin can check but won't have their own config
        return MasterStatusResponse(is_linked=False)
    return await service.get_status(admin_email=user["email"])
=======
    """Return current master account link status."""
    return await service.get_status()
>>>>>>> parent of 0c80cd2 (Delete backend directory)


@router.post("/scan")
async def scan_master_sites(
    payload: MasterLinkRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """
    Step 1: Login with Aruba credentials and classify sites by role.
    Returns admin_sites + restricted_sites WITHOUT writing to DB.
<<<<<<< HEAD
    """
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không thể liên kết Aruba account. Sử dụng Tenant Admin.")
=======
    Frontend uses this to show the confirmation modal.
    """
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
=======
        # Pass token back so confirm step can skip re-login
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không thể liên kết Aruba account. Sử dụng Tenant Admin.")
=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
    """
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không thể liên kết Aruba account. Sử dụng Tenant Admin.")
    if not payload.confirmed_admin_site_ids:
        raise HTTPException(status_code=400, detail="Danh sách site Admin không được rỗng.")

=======
    Frontend sends the _access_token from scan + confirmed_admin_site_ids.
    """
    if not payload.confirmed_admin_site_ids:
        raise HTTPException(status_code=400, detail="Danh sách site Admin không được rỗng.")

    # We re-login here because we cannot safely pass raw tokens in request bodies
    # (tokens are ephemeral; the small latency of re-login is acceptable)
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    try:
        scan = await service.scan_sites(
            username=payload.aruba_username,
            password=payload.aruba_password,
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    confirmed_set = set(payload.confirmed_admin_site_ids)
<<<<<<< HEAD
=======
    # Only keep sites that are both admin AND in the confirmed list
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
    """Unlink (deactivate) the current master account for THIS tenant."""
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không có Master Account để unlink.")
    try:
        return await service.unlink_account(admin_email=user["email"])
=======
    """Unlink (deactivate) the current master account."""
    try:
        return await service.unlink_account()
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/refresh-now")
async def force_refresh_token(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
<<<<<<< HEAD
    """Manually force a token refresh for THIS tenant's master account."""
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không có Master Account.")
    try:
        return await service.force_refresh(admin_email=user["email"])
=======
    """Manually force a token refresh for the master account."""
    try:
        return await service.force_refresh()
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
