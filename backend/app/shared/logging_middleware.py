import re
import json
import asyncio
from datetime import datetime, timezone
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.database.auth_crud import insert_audit_log
from app.shared.jwt_utils import verify_insight_token


# Regex to extract site_id from path like /api/v1/cloner/sites/{id}/...
_SITE_ID_RE = re.compile(r"/sites/([^/]+)")
# Regex to extract zone_id from path like /api/v1/zones/{id}/...
_ZONE_ID_RE = re.compile(r"/zones/([^/]+)")

# Exact-match endpoint → action label
_EXACT_ACTIONS = {
    "/api/v1/cloner/apply": "Clone Complete Config",
    "/api/v1/cloner/sync-password": "Update PSK (Password)",
    "/api/v1/cloner/sync-config": "Sync SSID Config",
    "/api/v1/cloner/sync-delete": "Delete SSID",
    "/api/v1/cloner/sync-create": "Create SSID",
    "/api/v1/cloner/batch-site-delete": "Batch Site Delete",
    "/api/v1/cloner/batch-account-access": "Batch Account Access",
    "/api/v1/cloner/batch-site-provision": "Batch Site Provision",
    "/api/v1/master/link": "Master Account Linked",
    "/api/v1/master/unlink": "Master Account Unlinked",
    "/api/v1/master/refresh-now": "Master Token Force Refreshed",
    # Legacy paths (no /v1) kept for backward compat during transition
    "/api/cloner/apply": "Clone Complete Config",
    "/api/cloner/sync-password": "Update PSK (Password)",
    "/api/cloner/sync-config": "Sync SSID Config",
    "/api/cloner/sync-delete": "Delete SSID",
    "/api/cloner/sync-create": "Create SSID",
}


def _resolve_zone_action(path: str, method: str):
    if "/api/v1/zones" not in path:
        return None
    if method == "POST" and path.endswith("/api/v1/zones"):
        return "Zone Created"
    if method == "DELETE" and "/members/" in path:
        return "Zone Member Removed"
    if method == "PUT" and "/members/" in path:
        return "Zone Member Role Updated"
    if method == "POST" and "/members" in path:
        return "Zone Member Added"
    if method == "PUT" and "/sites" in path:
        return "Zone Sites Updated"
    if method == "DELETE":
        return "Zone Deleted"
    return None


def _extract_jwt_email(request: Request):
    """Try to extract email from Insight JWT without raising."""
    try:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            payload = verify_insight_token(auth.split(" ", 1)[1])
            return payload.get("sub")
    except Exception:
        pass
    return None


class GlobalLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in ["POST", "PUT", "PATCH", "DELETE"]:
            return await call_next(request)

        path = str(request.url.path)

        # Resolve action label
        action_name = _EXACT_ACTIONS.get(path)
        if action_name is None:
            action_name = _resolve_zone_action(path, request.method)
        if action_name is None:
            return await call_next(request)

        # Identity: prefer JWT sub, fall back to X-Insight-User header
        actor_email = _extract_jwt_email(request) or request.headers.get("X-Insight-User", "anonymous")

        method = request.method
        ip_address = request.client.host if request.client else None

        # Extract contextual IDs from path
        site_match = _SITE_ID_RE.search(path)
        site_id = site_match.group(1) if site_match else None
        zone_match = _ZONE_ID_RE.search(path)
        zone_id = zone_match.group(1) if zone_match else None

        # Detect master token usage (any cloner/config/overview/inventory call = master)
        master_account_used = any(seg in path for seg in ["/cloner/", "/config/", "/overview/", "/inventory/"])

        # Read request body safely
        body_bytes = await request.body()
        payload_data = None
        if body_bytes:
            try:
                payload_data = json.loads(body_bytes.decode("utf-8"))
                if isinstance(payload_data, dict):
                    for key in [k for k in payload_data if "password" in k.lower() or "token" in k.lower()]:
                        del payload_data[key]
            except Exception:
                payload_data = {"raw": body_bytes.decode("utf-8", errors="ignore")}

        # Extract site_id from body too (sync ops send target_site_ids)
        if not site_id and isinstance(payload_data, dict):
            ids = payload_data.get("target_site_ids") or payload_data.get("site_id")
            if isinstance(ids, list) and ids:
                site_id = ids[0]
            elif isinstance(ids, str):
                site_id = ids

        receive_called = False
        async def receive():
            nonlocal receive_called
            if receive_called:
                return {"type": "http.disconnect"}
            receive_called = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}

        request._receive = receive

        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            raise e
        finally:
            # Try to determine admin_master_id if possible
            # Simplified to Master System for now unless a specific account is known
            admin_master_id = "Master System" if master_account_used else None
            
            # Use 'target_zone_ids' if present in body
            if not zone_id and isinstance(payload_data, dict):
                z_ids = payload_data.get("target_zone_ids")
                if isinstance(z_ids, list) and z_ids:
                    zone_id = z_ids[0] # Track primary target zone
            
            status_text = "SUCCESS" if 200 <= status_code < 300 else "ERROR"
            
            log_entry = {
                "timestamp": datetime.now(timezone.utc),
                "insight_user_id": actor_email,
                "admin_master_id": admin_master_id,
                "action": action_name,
                "zone_id": zone_id,
                "site_id": site_id,
                "status": status_text,
                "method": method,
                "endpoint": path,
                "payload": payload_data,
                "ip_address": ip_address,
                "statusCode": status_code,
            }
            asyncio.create_task(insert_audit_log(log_entry))

        return response
