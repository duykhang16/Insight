"""Pydantic models for the Aruba API capture system."""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr, Field


# ===== INPUT MODELS (from Extension) =====

class MandatoryHeaders(BaseModel):
    """Explicitly tracked headers for API Blueprint & Portability."""
    authorization: Optional[str] = None
    csrf: Optional[str] = None
    cookie: Optional[str] = None
    referer: Optional[str] = None
    origin: Optional[str] = None


class CapturePayload(BaseModel):
    """Schema for a single captured request/response from the extension."""
    url: str = Field(..., description="Full request URL")
    method: str = Field(..., description="HTTP verb")
    domain: Optional[str] = Field(None, description="Request domain")
    path: Optional[str] = Field(None, description="URL path")
    request_headers: Dict[str, str] = Field(default_factory=dict)
    mandatory_headers: Optional[MandatoryHeaders] = Field(None)
    execution_context: str = Field("DATA_FETCH", description="AUTH_FLOW, CONFIG_CHANGE, DATA_FETCH")
    request_body: Optional[Any] = Field(None)
    status_code: int = Field(0)
    response_headers: Dict[str, str] = Field(default_factory=dict)
    response_body: Optional[Any] = Field(None)
    duration_ms: int = Field(0)
    mime_type: Optional[str] = Field(None)
    timestamp: float = Field(0.0)
    is_binary: bool = Field(False)


class BatchCapturePayload(BaseModel):
    """Schema for batch capture — multiple requests at once."""
    requests: List[CapturePayload]


class AuthSessionPayload(BaseModel):
    """Schema for captured authentication session from the extension."""
    token_type: str = Field(..., description="bearer, session, csrf, cookie")
    token_value: str = Field(..., description="The actual token value")
    refresh_token: Optional[str] = Field(None, description="Refresh token if available")
    expires_in: Optional[int] = Field(None, description="Token TTL in seconds")
    source_url: str = Field("", description="URL where token was captured")
    headers_snapshot: Dict[str, str] = Field(
        default_factory=dict, description="Full headers at capture time"
    )


class AuthFlowBlueprint(BaseModel):
    """Blueprint for replaying an authentication flow."""
    base_url: str = Field(..., description="Target origin URL")
    endpoint: str = Field(..., description="Auth path")
    method: str = Field(..., description="HTTP method")
    headers: Dict[str, str] = Field(..., description="Headers with masked sensitive data")
    body_template: Optional[Dict[str, Any]] = Field(None, description="Body with placeholders")
    detected_tokens: List[str] = Field(default_factory=list, description="Keys to extract from response")
    created_at: Optional[datetime] = None


class ReplayLoginPayload(BaseModel):
    """Payload sent from Swagger UI to trigger replay login."""
    domain: str = Field(..., description="Target domain to login to")
    username: str
    password: str


# ===== DATABASE DOCUMENT MODELS =====

class EndpointDocument(BaseModel):
    """Represents a unique API endpoint stored in MongoDB.
    
    Each unique (domain, normalized_path, method) is one document.
    Multiple calls are merged/aggregated.
    """
    id: Optional[str] = Field(None, alias="_id")
    api_key: str = Field(..., description="Unique key: domain|path|METHOD")
    domain: str = Field(..., description="e.g. nb.portal.arubainstanton.com")
    path: str = Field(..., description="Normalized path e.g. /api/sites/{id}")
    method: str = Field(..., description="HTTP method uppercase")

    # Latest captured data
    request_headers: Dict[str, str] = Field(
        default_factory=dict, description="Latest captured request headers"
    )
    cookies: Dict[str, str] = Field(
        default_factory=dict, description="Parsed cookies as key-value"
    )
    query_params: Dict[str, str] = Field(
        default_factory=dict, description="Merged query params from all calls"
    )
    request_body_sample: Optional[Any] = Field(
        None, description="Latest request body sample"
    )
    response_body_sample: Optional[Any] = Field(
        None, description="Latest response body sample"
    )
    status_codes: List[int] = Field(
        default_factory=list, description="All observed status codes"
    )
    content_type: str = Field(
        "application/json", description="Response content type"
    )

    # Metadata
    request_count: int = Field(0, description="Total times this endpoint was hit")
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None

    # API Blueprint specific
    execution_context: str = "DATA_FETCH"
    dependencies: List[str] = Field(default_factory=list, description="IDs of other endpoints this one depends on")
    mandatory_headers_sample: Optional[MandatoryHeaders] = None

    class Config:
        populate_by_name = True


# ===== RESPONSE MODELS =====

class EndpointListResponse(BaseModel):
    """Paginated list of endpoints."""
    total: int
    endpoints: List[EndpointDocument]


class DomainListResponse(BaseModel):
    """List of captured domains."""
    domains: List[str]


class LogSearchResponse(BaseModel):
    """Paginated search results from raw_logs."""
    total: int
    logs: List[dict]


class AuthSessionResponse(BaseModel):
    """Latest captured auth session."""
    token_type: str
    token_value: str
    refresh_token: Optional[str] = None
    expires_at: Optional[str] = None
    source_url: str = ""
    captured_at: Optional[str] = None
    headers_snapshot: Dict[str, str] = Field(default_factory=dict)

# ===== NEW AUTH & LOGGING MODELS =====

class UserDocument(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: str
    password_hash: Optional[str] = Field(None, description="bcrypt hash — None for super admins seeded via env")
    role: str = Field("viewer", description="super_admin | tenant_admin | manager | viewer")
    isApproved: bool = Field(False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parent_admin_id: Optional[str] = Field(None, description="Email của admin đã tạo sub-account này")
    is_locked: bool = Field(False, description="Nếu True, chỉ super_admin mới edit/delete được")

    class Config:
        populate_by_name = True


class AuditLogDocument(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    actor_email: Optional[str] = None
    insight_user_id: Optional[str] = None   # MongoDB _id of the Insight user
    method: str
    endpoint: str
    payload: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    statusCode: int = 0
    action: Optional[str] = None
    site_id: Optional[str] = None           # Aruba site affected (if applicable)
    zone_id: Optional[str] = None           # Zone context (if applicable)
    master_account_used: bool = False       # True if master token was used for Aruba call


class LogResponse(BaseModel):
    id: str
    timestamp: str  # Will be formatted in GMT+7
    actor_email: Optional[str]
    insight_user_id: Optional[str] = None
    method: str
    endpoint: str
    payload: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    statusCode: int
    action: Optional[str]
    site_id: Optional[str] = None
    zone_id: Optional[str] = None
    master_account_used: bool = False


# ===== ZONE & MASTER ACCOUNT MODELS =====

class ZoneMemberDocument(BaseModel):
    email: str
    zone_role: str = Field(..., description="admin | operator | viewer")
    assigned_by: str
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ZoneDocument(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    description: Optional[str] = None
    color: str = Field("#3B82F6", description="Hex color for UI card")
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    site_ids: List[str] = Field(default_factory=list)
    members: List[ZoneMemberDocument] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class MasterConfigDocument(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    linked_by: str
    linked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    username: str = Field(..., description="Aruba username")
    encrypted_password: str = Field(..., description="AES-256 encrypted password")
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True
    refresh_interval_minutes: int = 25

    class Config:
        populate_by_name = True


class MasterStatusResponse(BaseModel):
    is_linked: bool
    linked_by: Optional[str] = None
    linked_at: Optional[str] = None
    token_expires_at: Optional[str] = None
    token_age_seconds: Optional[int] = None
    refresh_interval_minutes: Optional[int] = None
