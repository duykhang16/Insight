"""Super Admin routes — only accessible by role=super_admin.

All business logic delegated to SuperService.
Routes only handle HTTP concerns (auth, path params, query params).
"""
from fastapi import APIRouter, Depends
from typing import Any, Dict, List
from app.shared.auth_deps import require_super_admin
from app.database.models import LogResponse
from .service import super_service

router = APIRouter()


# ===== Tenant CRUD =====

@router.get("/tenants")
async def list_tenants(current_user: Dict[str, Any] = Depends(require_super_admin)):
    return await super_service.list_tenants()


@router.post("/tenants")
async def create_tenant_endpoint(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.create_tenant(
        name=payload.get("name", ""),
        note=payload.get("note", ""),
        owner_email=payload.get("owner_email", ""),
        primary_contact_email=payload.get("primary_contact_email", ""),
        notification_emails=payload.get("notification_emails", []),
        caller_email=current_user.get("email", ""),
    )


@router.put("/tenants/{tenant_id}")
async def update_tenant_endpoint(
    tenant_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.update_tenant(tenant_id, payload)


@router.delete("/tenants/{tenant_id}")
async def delete_tenant_endpoint(
    tenant_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.delete_tenant(tenant_id)


@router.post("/tenants/{tenant_id}/suspend")
async def suspend_tenant_endpoint(
    tenant_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.suspend_tenant(tenant_id)


@router.post("/tenants/{tenant_id}/activate")
async def activate_tenant_endpoint(
    tenant_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.activate_tenant(tenant_id)


@router.post("/tenants/{tenant_id}/assign-admin")
async def assign_admin_endpoint(
    tenant_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.assign_admin(tenant_id, payload.get("admin_email", "").strip())


# ===== System users =====

@router.get("/users")
async def list_all_users(current_user: Dict[str, Any] = Depends(require_super_admin)):
    return await super_service.list_users()


@router.post("/users")
async def create_user_endpoint(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.create_user(
        email=payload.get("email", "").strip().lower(),
        role=payload.get("role", "viewer"),
        brand_admin_email=payload.get("brand_admin_email", ""),
        caller_email=current_user.get("email", ""),
    )


@router.post("/users/{user_id}/assign-brand")
async def assign_user_brand_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.assign_user_brand(
        user_id=user_id,
        brand_admin_email=payload.get("brand_admin_email", ""),
    )


@router.put("/users/{user_id}")
async def update_user_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.update_user(user_id, payload, current_user.get("email", ""))


@router.delete("/users/{user_id}")
async def delete_user_endpoint(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.delete_user(user_id, current_user.get("email", ""))


@router.post("/users/{user_id}/reset-password")
async def reset_password_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.reset_password(user_id, current_user.get("email", ""))


# ===== Audit logs =====

@router.get("/logs", response_model=List[LogResponse])
async def get_system_logs(
    limit: int = 100,
    skip: int = 0,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.get_system_logs(limit=limit, skip=skip)


# ===== Role Permissions =====

@router.get("/permissions")
async def list_permissions(current_user: Dict[str, Any] = Depends(require_super_admin)):
    return await super_service.list_permissions()


@router.put("/permissions/{role}")
async def update_permissions(
    role: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    return await super_service.update_permissions(role, payload.get("permissions", {}))
