from fastapi import APIRouter, HTTPException, Query, Request, status
from typing import List, Optional
from app.database.models import CapturePayload, BatchCapturePayload, AuthSessionPayload, AuthFlowBlueprint
from app.database.crud import (
    upsert_endpoint,
    insert_raw_log,
    search_logs,
    get_all_endpoints,
    upsert_blueprint,
    clear_all_data,
    get_log_by_id,
    upsert_auth_session
)
try:
    from app.export.postman import generate_postman_from_logs
except ImportError:
    generate_postman_from_logs = None

# Websocket manager — stub fallback (module not present in this deployment)
class _NoopBroadcaster:
    async def broadcast(self, *args, **kwargs): pass
manager = _NoopBroadcaster()
from datetime import datetime, timezone

# Hidden router for internal tools (Extension, Dashboard)
router = APIRouter(prefix="/api/v1", include_in_schema=False)

async def _process_capture(data: CapturePayload):
    """Helper to process a single capture payload."""
    # Extract domain and path robustly if missing
    url_obj = data.url.split("/")
    domain = data.domain or (url_obj[2] if len(url_obj) > 2 else "unknown")
    path = data.path or ("/" + "/".join(url_obj[3:]).split("?")[0] if len(url_obj) > 3 else "/")

    # Parse query params from URL if not explicitly provided
    from urllib.parse import urlparse, parse_qs
    parsed_url = urlparse(data.url)
    q_params = {k: v[0] for k, v in parse_qs(parsed_url.query).items()}

    # Get cookies from headers
    cookies_str = data.request_headers.get("cookie", data.request_headers.get("Cookie", ""))

    # 1. Store as structured Endpoint (for documentation)
    endpoint_id = await upsert_endpoint(
        api_key=f"{data.method}-{data.url.split('?')[0]}", # Simple deduce key
        domain=domain,
        path=path,
        method=data.method,
        request_headers=data.request_headers or {},
        cookies_str=cookies_str,
        query_params=q_params,
        response_body=data.response_body,
        request_body=data.request_body,
        status_code=data.status_code,
        content_type=data.response_headers.get("content-type", "") if data.response_headers else ""
    )

    # 2. Store as Raw Log (for observability)
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
        execution_context=data.execution_context
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
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    })
    return endpoint_id, log_id

@router.post("/capture", status_code=status.HTTP_201_CREATED)
async def capture_request(data: CapturePayload):
    """Handle incoming traffic from Chrome Extension."""
    try:
        endpoint_id, log_id = await _process_capture(data)
        return {"status": "success", "endpoint_id": endpoint_id, "log_id": log_id}
    except Exception as e:
        print(f"[CAPTURE ERROR] {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/capture/batch", status_code=status.HTTP_201_CREATED)
async def capture_batch(data: BatchCapturePayload):
    """Handle multiple captured requests at once."""
    results = []
    for req in data.requests:
        try:
            eid, lid = await _process_capture(req)
            results.append({"endpoint_id": eid, "log_id": lid})
        except Exception as e:
            print(f"[BATCH ERROR] Skipping individual request failure: {e}")
    return {"status": "success", "processed": len(results)}

@router.post("/auth-session", status_code=status.HTTP_201_CREATED)
async def capture_auth_session(data: AuthSessionPayload):
    """Store captured authentication tokens."""
    try:
        session_id = await upsert_auth_session(
            token_type=data.token_type,
            token_value=data.token_value,
            refresh_token=data.refresh_token,
            expires_in=data.expires_in,
            source_url=data.source_url,
            headers_snapshot=data.headers_snapshot
        )
        return {"status": "success", "session_id": session_id}
    except Exception as e:
        print(f"[AUTH ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth-session")
async def get_auth_session(request: Request):
    """Retrieve the current active authentication session based on the request token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"token_value": None}

    token = auth_header.split(" ")[1]
    from app.database.connection import get_database
    db = get_database()
    session = await db.auth_sessions.find_one({"token_value": token})

    if session:
        return {
            "token_value": session.get("token_value"),
            "expires_in": session.get("expires_in")
        }
    return {"token_value": None}

@router.post("/capture-blueprint", status_code=status.HTTP_201_CREATED)
async def capture_blueprint(blueprint: AuthFlowBlueprint):
    """Handle Auth Blueprint from Extension."""
    try:
        result = await upsert_blueprint(blueprint.dict())
        return {"status": "success", "id": result}
    except Exception as e:
        print(f"[BLUEPRINT ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/logs/export/postman")
async def export_logs_postman(
    limit: int = 5000,
    skip: int = 0,
    domain: Optional[str] = None,
    keyword: Optional[str] = None,
    method: Optional[str] = None,
    status: Optional[str] = None,
    log_ids: Optional[str] = Query(None, alias="ids"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to")
):
    """
    Export captured logs as a Postman Collection v2.1.
    """
    ids_list = log_ids.split(",") if log_ids else None

    # Reuse filtering logic
    method_list = method.split(",") if method else None
    status_list = []
    if status:
        for s in status.split(","):
            if len(s) == 1: status_list.extend([int(f"{s}{i:02d}") for i in range(100)])
            else: status_list.append(int(s))

    f_date = None
    if from_date:
        try: f_date = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except: pass
    t_date = None
    if to_date:
        try: t_date = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except: pass

    logs, _ = await search_logs(
        limit=limit,
        skip=skip,
        domain=domain,
        keyword=keyword,
        method=method_list,
        status_code=status_list,
        from_date=f_date,
        to_date=t_date,
        log_ids=ids_list
    )

    if not logs:
        raise HTTPException(status_code=404, detail="No logs found matching criteria")

    collection = generate_postman_from_logs(
        logs,
        collection_name=f"Captured Traffic - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )

    return collection

@router.get("/logs/export/json")
async def export_logs_json(
    limit: int = 5000,
    skip: int = 0,
    domain: Optional[str] = None,
    keyword: Optional[str] = None,
    method: Optional[str] = None,
    status: Optional[str] = None,
    log_ids: Optional[str] = Query(None, alias="ids"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to")
):
    """
    Export captured logs as raw JSON.
    """
    ids_list = log_ids.split(",") if log_ids else None
    method_list = method.split(",") if method else None
    status_list = []
    if status:
        for s in status.split(","):
            if len(s) == 1: status_list.extend([int(f"{s}{i:02d}") for i in range(100)])
            else: status_list.append(int(s))

    f_date = None
    if from_date:
        try: f_date = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except: pass
    t_date = None
    if to_date:
        try: t_date = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except: pass

    logs, _ = await search_logs(
        limit=limit,
        skip=skip,
        domain=domain,
        keyword=keyword,
        method=method_list,
        status_code=status_list,
        from_date=f_date,
        to_date=t_date,
        log_ids=ids_list
    )

    if not logs:
        raise HTTPException(status_code=404, detail="No logs found matching criteria")

    return {"logs": logs, "exported_at": datetime.now(timezone.utc).isoformat()}

@router.get("/logs/{log_id}")
async def get_log(log_id: str):
    """
    Retrieve a single log detail for Dashboard.
    Hidden from Swagger.
    """
    log = await get_log_by_id(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log

@router.get("/logs")
async def get_logs(
    limit: int = 100,
    skip: int = 0,
    domain: Optional[str] = None,
    keyword: Optional[str] = None,
    method: Optional[str] = None, # Comma separated: GET,POST
    status: Optional[str] = None, # Comma separated: 200,404 or first digit: 2,4
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to")
):
    """
    Retrieve logs for Dashboard with advanced filtering.
    Hidden from Swagger.
    """
    method_list = method.split(",") if method else None

    status_list = []
    if status:
        for s in status.split(","):
            if len(s) == 1: # Group match like '2' for 2xx
                status_list.extend([int(f"{s}{i:02d}") for i in range(100)])
            else:
                status_list.append(int(s))

    # Parse dates
    f_date = None
    if from_date:
        try:
            f_date = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except: pass

    t_date = None
    if to_date:
        try:
            t_date = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except: pass

    logs, total = await search_logs(
        limit=limit,
        skip=skip,
        domain=domain,
        keyword=keyword,
        method=method_list,
        status_code=status_list,
        from_date=f_date,
        to_date=t_date
    )
    return {"logs": logs, "total": total}

@router.get("/endpoints")
async def get_captured_endpoints(limit: int = 100, skip: int = 0):
    """
    Retrieve documented endpoints for Dashboard.
    Hidden from Swagger.
    """
    endpoints, total = await get_all_endpoints(limit=limit, skip=skip)
    return {"data": endpoints, "total": total}

@router.delete("/logs")
async def clear_logs():
    """
    Clear all captured data.
    Hidden from Swagger.
    """
    result = await clear_all_data()
    return {"status": "success", "deleted": result}
