from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from app.features.inventory.schemas import DeviceResponse
from app.features.inventory.service import inventory_service
from app.shared.auth_deps import get_current_insight_user, require_master_token

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])


@router.get("/sites/{site_id}/devices", response_model=List[DeviceResponse])
async def get_devices(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await inventory_service.get_site_devices(site_id, master_token)
