from fastapi import APIRouter, Request
from pydantic import BaseModel
from .service import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class CheckEmailRequest(BaseModel):
    email: str


@router.post("/check-email")
async def check_email(body: CheckEmailRequest):
    """Step 1: Validate email — check existence, approval, zones, password status."""
    return await auth_service.check_email(body.email)


@router.post("/login")
async def login(body: LoginRequest):
    """Step 2: Login với tài khoản Insight nội bộ (email + password)."""
    return await auth_service.login(body.email, body.password)


@router.get("/session")
async def session(request: Request):
    """Kiểm tra JWT Insight — dùng cho heartbeat poll (App.jsx)."""
    token = _extract_token(request)
    return await auth_service.check_session(token)


@router.post("/refresh")
async def refresh(request: Request):
    """Refresh Insight JWT — xác thực JWT cũ → phát JWT mới."""
    token = _extract_token(request)
    return await auth_service.refresh_token(token)


@router.post("/logout")
async def logout():
    """Logout: client tự xóa token khỏi sessionStorage."""
    return {"status": "success"}


@router.post("/set-password")
async def set_password(request: Request):
    """First-login password setup — requires setup_token."""
    body = await request.json()
    return await auth_service.set_password(
        setup_token=body.get("setup_token", ""),
        new_password=body.get("new_password", ""),
    )


def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    from fastapi import HTTPException
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Không có token.")
    return auth.split(" ", 1)[1]
