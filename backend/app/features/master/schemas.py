"""Pydantic schemas for the master account feature."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class MasterLinkRequest(BaseModel):
    aruba_username: str = Field(..., min_length=1)
    aruba_password: str = Field(..., min_length=1)


class MasterLinkConfirmRequest(BaseModel):
    """Second-step confirm: link using only the admin-capable sites."""
    aruba_username: str = Field(..., min_length=1)
    aruba_password: str = Field(..., min_length=1)
    confirmed_admin_site_ids: List[str] = Field(
        ..., description="Site IDs the user confirmed as admin-accessible"
    )


class SiteScanResult(BaseModel):
    site_id: str
    site_name: str
    role: str


class MasterScanResponse(BaseModel):
    """Result of a credential scan — no DB write performed."""
    total: int
    admin_sites: List[SiteScanResult]
    restricted_sites: List[SiteScanResult]
    # Serialised token so the confirm step can reuse it without re-login
    _access_token: Optional[str] = None


class MasterStatusResponse(BaseModel):
    is_linked: bool
    linked_by: Optional[str] = None
    linked_at: Optional[str] = None
    token_expires_at: Optional[str] = None
    token_age_seconds: Optional[int] = None
    refresh_interval_minutes: Optional[int] = None
    admin_site_count: Optional[int] = None
    restricted_site_count: Optional[int] = None


class MasterLinkResponse(BaseModel):
    message: str
    linked_at: str
    token_expires_at: str
    admin_site_count: int = 0
    restricted_site_count: int = 0
