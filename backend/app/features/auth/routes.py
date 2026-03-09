from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from app.shared.jwt_utils import create_insight_token, verify_insight_token
from app.database.auth_crud import authenticate_user, get_user_by_email, hash_password

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


_ERROR_MESSAGES = {
    "bad_credentials": (401, "Tên đăng nhập hoặc mật khẩu không chính xác."),
    "not_approved":    (403, "Tài khoản của bạn chưa được kích hoạt. Vui lòng liên hệ Admin Master."),
    "no_zones":        (403, "Bạn chưa được phân quyền quản lý Zone nào. Vui lòng liên hệ Admin để được cấp quyền."),
}

# Special token type for first-login password-setup flow (short-lived, limited scope)
_SETUP_TOKEN_PURPOSE = "must_set_password"


@router.post("/login")
async def login(body: LoginRequest):
    """Login với tài khoản Insight nội bộ (email + password)."""
    result = await authenticate_user(body.email, body.password)

    if not result.ok:
        status_code, detail = _ERROR_MESSAGES.get(
            result.error, (401, "Xác thực thất bại.")
        )
        raise HTTPException(status_code=status_code, detail=detail)

    user = result.user
    role = user.get("role", "viewer")

    # First-login: account has no password yet — issue a setup token, not a full session token
    if result.must_set_password:
        setup_token = create_insight_token(email=body.email, role=role, extra={"purpose": _SETUP_TOKEN_PURPOSE}, expiry_hours=1)
        return {
            "status": "must_set_password",
            "setup_token": setup_token,
            "email": body.email,
        }

    access_token = create_insight_token(email=body.email, role=role)

    # Check Zone Admin status at login time (only relevant for manager/viewer)
    is_zone_admin = False
    if role not in ("super_admin", "tenant_admin"):
        from app.database.zones_crud import get_zones_for_member
        zones = await get_zones_for_member(body.email)
        is_zone_admin = any(
            m.get("zone_role") == "admin"
            for z in zones
            for m in z.get("members", [])
            if m.get("email") == body.email
        )

    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "Bearer",
        "email": body.email,
        "role": role,
        "is_zone_admin": is_zone_admin,
    }


@router.get("/session")
async def session(request: Request):
    """Kiểm tra JWT Insight — dùng cho heartbeat poll (App.jsx)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Không có token.")
    token = auth.split(" ", 1)[1]
    payload = verify_insight_token(token)  # raises 401 on invalid/expired

    user = await get_user_by_email(payload["sub"])
    if not user or not user.get("isApproved", False):
        raise HTTPException(status_code=403, detail="Tài khoản chưa được phê duyệt.")

    # Check if user is a Zone Admin in any zone (only relevant for manager/viewer)
    email = payload["sub"]
    role = user.get("role", payload.get("role", "viewer"))
    is_zone_admin = False
    if role not in ("super_admin", "tenant_admin"):
        from app.database.zones_crud import get_zones_for_member
        zones = await get_zones_for_member(email)
        is_zone_admin = any(
            m.get("zone_role") == "admin"
            for z in zones
            for m in z.get("members", [])
            if m.get("email") == email
        )

    return {
        "status": "active",
        "email": email,
        "role": role,
        "is_zone_admin": is_zone_admin,
    }


@router.post("/refresh")
async def refresh(request: Request):
    """Refresh Insight JWT — xác thực JWT cũ → phát JWT mới."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Không có token.")
    old_token = auth.split(" ", 1)[1]
    payload = verify_insight_token(old_token)

    email = payload["sub"]
    user = await get_user_by_email(email)
    if not user or not user.get("isApproved", False):
        raise HTTPException(status_code=403, detail="Tài khoản không hợp lệ.")

    role = user.get("role", "viewer")
    new_token = create_insight_token(email=email, role=role)
    return {
        "status": "success",
        "access_token": new_token,
        "token_type": "Bearer",
    }


@router.post("/logout")
async def logout():
    """Logout: client tự xóa token khỏi sessionStorage."""
    return {"status": "success"}


@router.post("/set-password")
async def set_password(request: Request):
    """First-login password setup — requires setup_token (purpose=must_set_password).

    Body: { "setup_token": str, "new_password": str }
    On success: returns a full access_token (same as normal login).
    """
    body = await request.json()
    setup_token = body.get("setup_token", "")
    new_password = body.get("new_password", "")

    if not setup_token:
        raise HTTPException(status_code=400, detail="setup_token là bắt buộc.")
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải ít nhất 8 ký tự.")

    payload = verify_insight_token(setup_token)
    if payload.get("purpose") != _SETUP_TOKEN_PURPOSE:
        raise HTTPException(status_code=403, detail="Token không hợp lệ cho tác vụ này.")

    email = payload.get("sub")
    user = await get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")
    if not user.get("must_set_password"):
        raise HTTPException(status_code=400, detail="Tài khoản này không cần đặt mật khẩu lần đầu.")

    from app.database.connection import get_database
    db = get_database()
    await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": hash_password(new_password)}, "$unset": {"must_set_password": ""}}
    )

    # Issue full session token now
    role = user.get("role", "viewer")
    access_token = create_insight_token(email=email, role=role)

    is_zone_admin = False
    if role not in ("super_admin", "tenant_admin"):
        from app.database.zones_crud import get_zones_for_member
        zones = await get_zones_for_member(email)
        is_zone_admin = any(
            m.get("zone_role") == "admin"
            for z in zones
            for m in z.get("members", [])
            if m.get("email") == email
        )

    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "Bearer",
        "email": email,
        "role": role,
        "is_zone_admin": is_zone_admin,
    }
