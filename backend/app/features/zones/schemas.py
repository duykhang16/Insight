"""Pydantic request/response schemas for the zones feature."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


VALID_ZONE_ROLES = {"admin", "viewer", "delegator"}


class ZoneSiteRoleOverride(BaseModel):
    site_id: str
    zone_role: str = Field(..., description="admin | viewer | delegator")


# ── Request models ──────────────────────────────────────────────────────────

class ZoneCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    color: str = Field("#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")


class ZoneUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ZoneSitesUpdateRequest(BaseModel):
    site_ids: List[str]


class ZoneMemberAddRequest(BaseModel):
    email: str
    zone_role: Optional[str] = Field("viewer", description="admin | viewer | delegator")
    all_sites: bool = Field(True, description="True = access all sites in zone")
    allowed_site_ids: List[str] = Field(default_factory=list, description="Only when all_sites=False")
    site_role_overrides: List[ZoneSiteRoleOverride] = Field(default_factory=list)

    def validate_role(self):
        if self.zone_role and self.zone_role not in VALID_ZONE_ROLES:
            raise ValueError(f"zone_role phải là một trong: {VALID_ZONE_ROLES}")


class ZoneMemberUpdateRequest(BaseModel):
    zone_role: Optional[str] = Field(None, description="admin | viewer | delegator")
    all_sites: Optional[bool] = None
    allowed_site_ids: Optional[List[str]] = None
    site_role_overrides: Optional[List[ZoneSiteRoleOverride]] = None


class ZoneMemberSitesUpdateRequest(BaseModel):
    """Update only the site-level permission for a member."""
    all_sites: bool
    allowed_site_ids: List[str] = Field(default_factory=list)
    site_role_overrides: List[ZoneSiteRoleOverride] = Field(default_factory=list)
    replacement_admin_email: Optional[str] = None


# ── Response models ─────────────────────────────────────────────────────────

class ZoneMemberResponse(BaseModel):
    email: str
    zone_role: str
    all_sites: bool = True
    allowed_site_ids: List[str] = Field(default_factory=list)
    site_role_overrides: List[ZoneSiteRoleOverride] = Field(default_factory=list)
    assigned_by: str
    assigned_at: str  # ISO string
    updated_at: Optional[str] = None


class ZoneResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    color: str
    created_by: str
    brand_admin_email: Optional[str] = None
    zone_type: str = "canonical"
    created_at: str
    updated_at: str
    site_ids: List[str]
    members: List[ZoneMemberResponse]
    member_count: int
    site_count: int


class ZoneListItem(BaseModel):
    """Lightweight zone for list views (no full member list)."""
    id: str
    name: str
    description: Optional[str]
    color: str
    created_by: str
    brand_admin_email: Optional[str] = None
    zone_type: str = "canonical"
    created_at: str
    member_count: int
    site_count: int
    site_ids: List[str] = Field(default_factory=list)
