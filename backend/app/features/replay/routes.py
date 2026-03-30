from typing import Optional
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from app.features.replay.service import replay_login, proxy_api_call

router = APIRouter(prefix="/api/v1/replay", tags=["Replay"])

class ReplayLoginPayload(BaseModel):
    username: str
    password: str
    client_id: Optional[str] = None

@router.post("/login")
async def login(payload: ReplayLoginPayload):
    """Aruba SSO Login Replay."""
    return await replay_login(payload.username, payload.password, payload.client_id)

@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    tags=["Replay"]
)
async def proxy(path: str, request: Request):
    """Aruba API Proxy."""
    return await proxy_api_call(path, request.method, request)
