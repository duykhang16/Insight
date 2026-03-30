<<<<<<< HEAD
"""Pydantic request/response schemas for the templates feature."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ── Request models ──────────────────────────────────────────────────────────

class TemplateCreateRequest(BaseModel):
    """Tạo template (blueprint) — lưu DB sẵn sàng, chưa áp cho site nào."""
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None
    color: str = Field("#10B981", pattern=r"^#[0-9A-Fa-f]{6}$")
    zone_id: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON config: {networks: [...], guest_portal: {...}}. Null = tạo template trống."
    )

=======
from pydantic import BaseModel, Field
from typing import Optional

class TemplateCreateRequest(BaseModel):
    """Template is an empty label — only needs a name and color for tagging."""
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None
    color: str = Field("#10B981", pattern=r"^#[0-9A-Fa-f]{6}$")
>>>>>>> parent of 0c80cd2 (Delete backend directory)

class TemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
<<<<<<< HEAD
    zone_id: Optional[str] = None


class TemplateConfigUpdateRequest(BaseModel):
    """Update config_data trực tiếp (workflow ②: nhập config thủ công)."""
    config_data: Dict[str, Any] = Field(
        ...,
        description="JSON config: {networks: [...], guest_portal: {...}}"
    )


class TemplateExtractRequest(BaseModel):
    """Trích xuất config từ site nguồn (workflow ①)."""
    source_site_id: str = Field(..., description="Site ID để trích xuất config từ Aruba API")
    name: str = Field(..., min_length=1, max_length=80, description="Tên template mới")
    description: Optional[str] = None
    color: str = Field("#10B981", pattern=r"^#[0-9A-Fa-f]{6}$")
    zone_id: Optional[str] = None

=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)

class SiteTemplateAssignRequest(BaseModel):
    site_id: str
    template_id: str

<<<<<<< HEAD

class SiteTemplateRemoveRequest(BaseModel):
    site_id: str
    template_id: str
=======
class SiteTemplateUnassignRequest(BaseModel):
    site_id: str
>>>>>>> parent of 0c80cd2 (Delete backend directory)
