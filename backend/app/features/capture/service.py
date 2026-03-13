"""
Capture Service — business logic cho traffic capture & log export.

Tách ra khỏi routes để:
  - Dễ test capture logic riêng biệt
  - Mở rộng export formats (Postman, JSON, HAR, etc.)
  - Routes chỉ validate input + gọi service
"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

from fastapi import HTTPException
from app.database.models import CapturePayload
from app.database.crud import (
    upsert_endpoint,
    insert_raw_log,
    search_logs,
    get_all_endpoints,
    upsert_blueprint,
    clear_all_data,
    get_log_by_id,
    upsert_auth_session,
)

# Websocket manager — stub fallback
class _NoopBroadcaster:
    async def broadcast(self, *args, **kwargs): pass

manager = _NoopBroadcaster()


class CaptureService:
    """Handles traffic capture, log storage, and export operations."""

    # ── Capture processing ─────────────────────────────────────────

    async def process_capture(self, data: CapturePayload) -> Dict[str, str]:
        """Process a single captured request: store endpoint + raw log + broadcast."""
        url_obj = data.url.split("/")
        domain = data.domain or (url_obj[2] if len(url_obj) > 2 else "unknown")
        path = data.path or ("/" + "/".join(url_obj[3:]).split("?")[0] if len(url_obj) > 3 else "/")

        parsed_url = urlparse(data.url)
        q_params = {k: v[0] for k, v in parse_qs(parsed_url.query).items()}
        cookies_str = data.request_headers.get("cookie", data.request_headers.get("Cookie", ""))

        # 1. Structured endpoint (documentation)
        endpoint_id = await upsert_endpoint(
            api_key=f"{data.method}-{data.url.split('?')[0]}",
            domain=domain,
            path=path,
            method=data.method,
            request_headers=data.request_headers or {},
            cookies_str=cookies_str,
            query_params=q_params,
            response_body=data.response_body,
            request_body=data.request_body,
            status_code=data.status_code,
            content_type=data.response_headers.get("content-type", "") if data.response_headers else "",
        )

        # 2. Raw log (observability)
        log_id = await insert_raw_log(
            url=data.url,
            method=data.method,
            domain=domain,
            path=path,
            request_headers=data.request_headers or {},
            request_body=data.request_body,
            status_code=data.status_code,
            response_headers=data.response_headers,
            response_body=data.response_body,
            duration_ms=data.duration_ms or 0,
            cookies=cookies_str,
            query_params=q_params,
            mandatory_headers=data.mandatory_headers,
            execution_context=data.execution_context,
        )

        # 3. Broadcast to UI
        await manager.broadcast({
            "type": "NEW_REQUEST",
            "data": {
                "id": log_id,
                "url": data.url,
                "method": data.method,
                "domain": domain,
                "path": path,
                "status_code": data.status_code,
                "duration_ms": data.duration_ms or 0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

        return {"endpoint_id": endpoint_id, "log_id": log_id}

    async def process_batch(self, requests: list) -> Dict[str, Any]:
        """Process multiple captured requests at once."""
        results = []
        for req in requests:
            try:
                result = await self.process_capture(req)
                results.append(result)
            except Exception as e:
                print(f"[BATCH ERROR] Skipping: {e}")
        return {"status": "success", "processed": len(results)}

    # ── Auth session ───────────────────────────────────────────────

    async def store_auth_session(self, data) -> dict:
        """Store a captured authentication session."""
        session_id = await upsert_auth_session(
            token_type=data.token_type,
            token_value=data.token_value,
            refresh_token=data.refresh_token,
            expires_in=data.expires_in,
            source_url=data.source_url,
            headers_snapshot=data.headers_snapshot,
        )
        return {"status": "success", "session_id": session_id}

    async def get_auth_session(self, token: str) -> dict:
        """Retrieve active auth session by token."""
        from app.database.connection import get_database
        db = get_database()
        session = await db.auth_sessions.find_one({"token_value": token})
        if session:
            return {
                "token_value": session.get("token_value"),
                "expires_in": session.get("expires_in"),
            }
        return {"token_value": None}

    # ── Blueprint ──────────────────────────────────────────────────

    async def store_blueprint(self, blueprint_data: dict) -> dict:
        """Store an auth flow blueprint."""
        result = await upsert_blueprint(blueprint_data)
        return {"status": "success", "id": result}

    # ── Log queries ────────────────────────────────────────────────

    async def get_log(self, log_id: str) -> dict:
        """Get a single log by ID."""
        log = await get_log_by_id(log_id)
        if not log:
            raise HTTPException(status_code=404, detail="Log not found")
        return log

    async def search(
        self,
        limit: int = 100,
        skip: int = 0,
        domain: Optional[str] = None,
        keyword: Optional[str] = None,
        method: Optional[str] = None,
        status: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        log_ids: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Search logs with advanced filtering."""
        method_list = method.split(",") if method else None
        status_list = self._parse_status_filter(status)
        f_date = self._parse_date(from_date)
        t_date = self._parse_date(to_date)
        ids_list = log_ids.split(",") if log_ids else None

        logs, total = await search_logs(
            limit=limit, skip=skip,
            domain=domain, keyword=keyword,
            method=method_list, status_code=status_list,
            from_date=f_date, to_date=t_date,
            log_ids=ids_list,
        )
        return {"logs": logs, "total": total}

    # ── Export ─────────────────────────────────────────────────────

    async def export_postman(self, **kwargs) -> dict:
        """Export logs as Postman Collection v2.1."""
        try:
            from app.export.postman import generate_postman_from_logs
        except ImportError:
            raise HTTPException(status_code=501, detail="Postman export module not available")

        result = await self.search(**kwargs)
        logs = result["logs"]
        if not logs:
            raise HTTPException(status_code=404, detail="No logs found matching criteria")

        return generate_postman_from_logs(
            logs,
            collection_name=f"Captured Traffic - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        )

    async def export_json(self, **kwargs) -> dict:
        """Export logs as raw JSON."""
        result = await self.search(**kwargs)
        if not result["logs"]:
            raise HTTPException(status_code=404, detail="No logs found matching criteria")
        return {"logs": result["logs"], "exported_at": datetime.now(timezone.utc).isoformat()}

    # ── Endpoints & cleanup ────────────────────────────────────────

    async def get_endpoints(self, limit: int = 100, skip: int = 0) -> dict:
        """Get all captured endpoints."""
        endpoints, total = await get_all_endpoints(limit=limit, skip=skip)
        return {"data": endpoints, "total": total}

    async def clear_all(self) -> dict:
        """Clear all captured data."""
        result = await clear_all_data()
        return {"status": "success", "deleted": result}

    # ── Helpers ────────────────────────────────────────────────────

    @staticmethod
    def _parse_status_filter(status: Optional[str]) -> list:
        if not status:
            return []
        result = []
        for s in status.split(","):
            if len(s) == 1:
                result.extend([int(f"{s}{i:02d}") for i in range(100)])
            else:
                result.append(int(s))
        return result

    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except Exception:
            return None


capture_service = CaptureService()
