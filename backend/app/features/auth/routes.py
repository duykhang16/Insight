from fastapi import APIRouter, Request
from pydantic import BaseModel
from .service import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class CheckEmailRequest(BaseModel):
    email: str


class VerifyOtpRequest(BaseModel):
    otp_challenge_token: str
    otp: str


class TwoFactorSetupRequest(BaseModel):
    current_password: str
    label_email: str


class TwoFactorConfirmRequest(BaseModel):
    otp: str


class TwoFactorDisableRequest(BaseModel):
    current_password: str
    otp: str


@router.post("/check-email")
async def check_email(body: CheckEmailRequest):
    """Step 1: Validate email — check existence, approval, zones, password status."""
    return await auth_service.check_email(body.email)


@router.post("/login")
async def login(body: LoginRequest):
    """Step 2: Login với tài khoản Insight nội bộ (email + password)."""
    return await auth_service.login(body.email, body.password)


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpRequest):
    """Step 3: Verify OTP before issuing the final Insight session."""
    return await auth_service.verify_otp(body.otp_challenge_token, body.otp)


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


@router.post("/change-password")
async def change_password(request: Request):
    """Change password for authenticated user — requires old password."""
    from app.shared.auth_deps import get_current_insight_user
    user = await get_current_insight_user(request)
    body = await request.json()
    return await auth_service.change_password(
        email=user["email"],
        old_password=body.get("old_password", ""),
        new_password=body.get("new_password", ""),
    )


@router.get("/2fa/status")
async def two_factor_status(request: Request):
    from app.shared.auth_deps import get_current_insight_user

    user = await get_current_insight_user(request)
    return await auth_service.get_two_factor_status(user["email"])


@router.post("/2fa/setup")
async def setup_two_factor(body: TwoFactorSetupRequest, request: Request):
    from app.shared.auth_deps import get_current_insight_user

    user = await get_current_insight_user(request)
    return await auth_service.setup_two_factor(user["email"], body.current_password, body.label_email)


@router.post("/2fa/confirm")
async def confirm_two_factor(body: TwoFactorConfirmRequest, request: Request):
    from app.shared.auth_deps import get_current_insight_user

    user = await get_current_insight_user(request)
    return await auth_service.confirm_two_factor(user["email"], body.otp)


@router.post("/2fa/disable")
async def disable_two_factor(body: TwoFactorDisableRequest, request: Request):
    from app.shared.auth_deps import get_current_insight_user

    user = await get_current_insight_user(request)
    return await auth_service.disable_two_factor(user["email"], body.current_password, body.otp)


def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    from fastapi import HTTPException
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Không có token.")
    return auth.split(" ", 1)[1]

