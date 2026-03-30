from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List
from app.shared.auth_deps import require_internal_admin
from app.database.models import LogResponse
from app.shared.rbac import ROLE_SUPER_ADMIN, normalize_legacy_role
from .service import admin_service

router = APIRouter()


def _reject_super_admin(current_user: Dict[str, Any]) -> None:
    if normalize_legacy_role(current_user.get("role")) == ROLE_SUPER_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Super Admin không thao tác trực tiếp trên màn hình quản trị brand ở thời điểm hiện tại.",
        )


@router.get("/users")
async def get_all_users(
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.list_users(current_user)


@router.post("/users")
async def create_user_endpoint(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.create_user(payload, current_user)


@router.post("/users/check-email")
async def check_create_user_email(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.check_create_email(payload.get("email", ""), current_user)


@router.get("/users/{user_id}/assignments")
async def get_user_assignments(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.get_user_assignments(user_id, current_user)


@router.put("/users/{user_id}/assignments")
async def update_user_assignments(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.update_user_assignments(user_id, payload, current_user)


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.update_user(user_id, payload, current_user)


@router.delete("/users/{user_id}")
async def delete_user_endpoint(
    user_id: str,
    payload: dict = None,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.delete_user(user_id, current_user, payload)


@router.post("/users/{user_id}/reset-password")
async def reset_password_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.reset_password(user_id, current_user)


@router.get("/logs", response_model=List[LogResponse])
async def get_audit_logs(
    limit: int = 50,
    skip: int = 0,
    zone_id: str = None,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    _reject_super_admin(current_user)
    return await admin_service.get_audit_logs(current_user, limit=limit, skip=skip, zone_id=zone_id)
