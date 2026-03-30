from fastapi import APIRouter, Request
from pydantic import BaseModel
from .service import auth_service
<<<<<<< HEAD
=======
from app.shared.auth_deps import get_current_insight_user
>>>>>>> parent of 0c80cd2 (Delete backend directory)

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class CheckEmailRequest(BaseModel):
    email: str


<<<<<<< HEAD
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
=======
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
>>>>>>> parent of 0c80cd2 (Delete backend directory)


@router.post("/check-email")
async def check_email(body: CheckEmailRequest):
    """Step 1: Validate email — check existence, approval, zones, password status."""
    return await auth_service.check_email(body.email)


@router.post("/login")
async def login(body: LoginRequest):
<<<<<<< HEAD
    """Step 2: Login với tài khoản Insight nội bộ (email + password)."""
    return await auth_service.login(body.email, body.password)


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpRequest):
    """Step 3: Verify OTP before issuing the final Insight session."""
    return await auth_service.verify_otp(body.otp_challenge_token, body.otp)


@router.get("/session")
async def session(request: Request):
    """Kiểm tra JWT Insight — dùng cho heartbeat poll (App.jsx)."""
=======
    """Step 2: Login with internal Insight account (email + password)."""
    return await auth_service.login(body.email, body.password)


@router.get("/session")
async def session(request: Request):
    """Check Insight JWT — used for heartbeat poll (App.jsx)."""
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    token = _extract_token(request)
    return await auth_service.check_session(token)


@router.post("/refresh")
async def refresh(request: Request):
<<<<<<< HEAD
    """Refresh Insight JWT — xác thực JWT cũ → phát JWT mới."""
=======
    """Refresh Insight JWT — verify old JWT → issue new JWT."""
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    token = _extract_token(request)
    return await auth_service.refresh_token(token)


@router.post("/logout")
async def logout():
<<<<<<< HEAD
    """Logout: client tự xóa token khỏi sessionStorage."""
=======
    """Logout: client removes token from sessionStorage."""
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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
<<<<<<< HEAD
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


=======
async def change_password(body: ChangePasswordRequest, request: Request):
    """Authenticated user changes their own password."""
    user = await get_current_insight_user(request)
    return await auth_service.change_password(
        email=user["email"],
        current_password=body.current_password,
        new_password=body.new_password,
    )


>>>>>>> parent of 0c80cd2 (Delete backend directory)
def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    from fastapi import HTTPException
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
<<<<<<< HEAD
        raise HTTPException(status_code=401, detail="Không có token.")
    return auth.split(" ", 1)[1]

=======
        raise HTTPException(status_code=401, detail="No token provided.")
    return auth.split(" ", 1)[1]
>>>>>>> parent of 0c80cd2 (Delete backend directory)
