from pydantic import BaseModel, Field
from typing import Optional

class TemplateCreateRequest(BaseModel):
    """Template is an empty label — only needs a name and color for tagging."""
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None
    color: str = Field("#10B981", pattern=r"^#[0-9A-Fa-f]{6}$")

class TemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")

class SiteTemplateAssignRequest(BaseModel):
    site_id: str
    template_id: str

class SiteTemplateUnassignRequest(BaseModel):
    site_id: str
