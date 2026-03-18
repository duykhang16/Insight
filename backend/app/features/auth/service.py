"""
Auth Service — business logic for authentication flows.

Separated from routes to:
  - Easily test login/session/refresh flows independently
  - Reuse zone_admin, permissions logic across modules
  - Routes only parse HTTP input + call service
"""
from typing import Any, Dict, Optional

from fastapi import HTTPException
from app.shared.jwt_utils import create_insight_token, verify_insight_token
from app.database.auth_crud import authenticate_user, get_user_by_email, hash_password


_SETUP_TOKEN_PURPOSE = "must_set_password"


class AuthService:
    """Handles all authentication-related business logic."""

    # ── Check email (Step 1) ─────────────────────────────────────

    async def check_email(self, email: str) -> dict:
        """Step 1: Validate email before asking for password.

        Returns next_step:
          - "enter_password"    → normal account, proceed to password input
          - "must_set_password" → first-login, show set-password form + setup_token
        Raises HTTPException for: not found, not approved, no zones.
        """
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Email not found.")

        if not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Account not yet activated. Please contact Admin.")

        # Zone check for non-admin roles
        role = user.get("role", "viewer")
        _ADMIN_ROLES = {"super_admin", "tenant_admin"}
        if role not in _ADMIN_ROLES:
            from app.database.zones_crud import get_zones_for_member
            zones = await get_zones_for_member(email)
            if not zones:
                raise HTTPException(
                    status_code=403,
                    detail="You are not assigned to any Zone. Please contact Admin.",
                )

        # Check password status
        password_hash = user.get("password_hash")
        if not password_hash and user.get("must_set_password"):
            setup_token = create_insight_token(
                email=email, role=role,
                extra={"purpose": _SETUP_TOKEN_PURPOSE},
                expiry_hours=1,
            )
            return {
                "status": "ok",
                "next_step": "must_set_password",
                "setup_token": setup_token,
                "email": email,
            }

        return {
            "status": "ok",
            "next_step": "enter_password",
            "email": email,
        }

    # ── Login (Step 2) ────────────────────────────────────────────

    async def login(self, email: str, password: str) -> dict:
        """Authenticate user and return token + metadata."""
        result = await authenticate_user(email, password)

        if not result.ok:
            _ERROR_MESSAGES = {
                "bad_credentials": (401, "Incorrect email or password."),
                "not_approved":    (403, "Your account is not activated. Please contact the Master Admin."),
                "no_zones":        (403, "You are not assigned to any Zone. Please contact Admin for access."),
            }
            status_code, detail = _ERROR_MESSAGES.get(result.error, (401, "Authentication failed."))
            raise HTTPException(status_code=status_code, detail=detail)

        user = result.user
        role = user.get("role", "viewer")

        # First-login: no password yet → issue setup token
        if result.must_set_password:
            setup_token = create_insight_token(
                email=email, role=role,
                extra={"purpose": _SETUP_TOKEN_PURPOSE},
                expiry_hours=1,
            )
            return {
                "status": "must_set_password",
                "setup_token": setup_token,
                "email": email,
            }

        access_token = create_insight_token(email=email, role=role)
        is_zone_admin = await self._check_zone_admin(email, role)
        permissions = await self._get_permissions(role)

        return {
            "status": "success",
            "access_token": access_token,
            "token_type": "Bearer",
            "email": email,
            "role": role,
            "is_zone_admin": is_zone_admin,
            "permissions": permissions,
        }

    # ── Session check ──────────────────────────────────────────────

    async def check_session(self, token: str) -> dict:
        """Verify JWT and return current session info."""
        payload = verify_insight_token(token)  # raises 401 if invalid

        user = await get_user_by_email(payload["sub"])
        if not user or not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Account not approved.")

        email = payload["sub"]
        role = user.get("role", payload.get("role", "viewer"))
        is_zone_admin = await self._check_zone_admin(email, role)
        permissions = await self._get_permissions(role)

        return {
            "status": "active",
            "email": email,
            "role": role,
            "is_zone_admin": is_zone_admin,
            "permissions": permissions,
        }

    # ── Refresh ────────────────────────────────────────────────────

    async def refresh_token(self, old_token: str) -> dict:
        """Issue new JWT from a valid old token."""
        payload = verify_insight_token(old_token)
        email = payload["sub"]

        user = await get_user_by_email(email)
        if not user or not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Invalid account.")

        role = user.get("role", "viewer")
        new_token = create_insight_token(email=email, role=role)
        return {
            "status": "success",
            "access_token": new_token,
            "token_type": "Bearer",
        }

    # ── Set password (first login) ─────────────────────────────────

    async def set_password(self, setup_token: str, new_password: str) -> dict:
        """Handle first-login password setup flow."""
        if not setup_token:
            raise HTTPException(status_code=400, detail="setup_token is required.")
        if not new_password or len(new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

        payload = verify_insight_token(setup_token)
        if payload.get("purpose") != _SETUP_TOKEN_PURPOSE:
            raise HTTPException(status_code=403, detail="Invalid token for this operation.")

        email = payload.get("sub")
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Account not found.")
        if not user.get("must_set_password"):
            raise HTTPException(status_code=400, detail="This account does not require first-time password setup.")

        from app.database.connection import get_database
        db = get_database()
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_hash": hash_password(new_password)}, "$unset": {"must_set_password": ""}}
        )

        role = user.get("role", "viewer")
        access_token = create_insight_token(email=email, role=role)
        is_zone_admin = await self._check_zone_admin(email, role)
        permissions = await self._get_permissions(role)

        return {
            "status": "success",
            "access_token": access_token,
            "token_type": "Bearer",
            "email": email,
            "role": role,
            "is_zone_admin": is_zone_admin,
            "permissions": permissions,
        }

    # ── Change password (authenticated) ────────────────────────────

    async def change_password(self, email: str, current_password: str, new_password: str) -> dict:
        """Change password for an authenticated user."""
        if not current_password:
            raise HTTPException(status_code=400, detail="Current password is required.")
        if not new_password or len(new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Account not found.")

        # Verify current password
        from app.database.auth_crud import verify_password
        if not verify_password(current_password, user.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

        # Update password
        from app.database.connection import get_database
        db = get_database()
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_hash": hash_password(new_password)}}
        )

        return {"status": "success", "message": "Password changed successfully."}

    # ── Shared helpers ─────────────────────────────────────────────

    @staticmethod
    async def _check_zone_admin(email: str, role: str) -> bool:
        """Check if user is a zone admin (only for manager/viewer roles)."""
        if role in ("super_admin", "tenant_admin"):
            return False
        from app.database.zones_crud import get_zones_for_member
        zones = await get_zones_for_member(email)
        return any(
            m.get("zone_role") == "admin"
            for z in zones
            for m in z.get("members", [])
            if m.get("email") == email
        )

    @staticmethod
    async def _get_permissions(role: str) -> dict:
        """Get role permissions from DB."""
        from app.database.roles_crud import get_role_permissions
        return await get_role_permissions(role)


auth_service = AuthService()
