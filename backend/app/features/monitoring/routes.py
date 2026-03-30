"""System Monitoring routes — super_admin only.

Provides endpoints for server metrics, DB stats, user analytics,
and traffic analytics dashboard.
"""
from fastapi import APIRouter, Depends, Query
from typing import Any, Dict
from app.shared.auth_deps import require_super_admin
from .service import monitoring_service

router = APIRouter()


@router.get("/server")
async def get_server_metrics(
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Get server resource metrics (CPU, RAM, Disk, Network)."""
    return await monitoring_service.get_server_metrics()


@router.get("/database")
async def get_database_stats(
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Get MongoDB database statistics."""
    return await monitoring_service.get_db_stats()


@router.get("/users")
async def get_user_stats(
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Get user statistics."""
    return await monitoring_service.get_user_stats()


@router.get("/traffic")
async def get_traffic_analytics(
    days: int = Query(default=7, ge=1, le=90),
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Get traffic analytics from audit logs."""
    return await monitoring_service.get_traffic_analytics(days=days)


@router.get("/dashboard")
async def get_full_dashboard(
    days: int = Query(default=7, ge=1, le=90),
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Get complete monitoring dashboard data."""
    return await monitoring_service.get_full_dashboard(traffic_days=days)
