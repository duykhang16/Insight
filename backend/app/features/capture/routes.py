from fastapi import APIRouter, HTTPException, Query, Request, status
from typing import Optional
from app.database.models import CapturePayload, BatchCapturePayload, AuthSessionPayload, AuthFlowBlueprint
from .service import capture_service

# Hidden router for internal tools (Extension, Dashboard)
router = APIRouter(prefix="/api/v1", include_in_schema=False)


@router.post("/capture", status_code=status.HTTP_201_CREATED)
async def capture_request(data: CapturePayload):
    """Handle incoming traffic from Chrome Extension."""
    try:
        result = await capture_service.process_capture(data)
        return {"status": "success", **result}
    except Exception as e:
        print(f"[CAPTURE ERROR] {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/capture/batch", status_code=status.HTTP_201_CREATED)
async def capture_batch(data: BatchCapturePayload):
    """Handle multiple captured requests at once."""
    return await capture_service.process_batch(data.requests)


@router.post("/auth-session", status_code=status.HTTP_201_CREATED)
async def capture_auth_session(data: AuthSessionPayload):
    """Store captured authentication tokens."""
    try:
        return await capture_service.store_auth_session(data)
    except Exception as e:
        print(f"[AUTH ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth-session")
async def get_auth_session(request: Request):
    """Retrieve active auth session by request token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"token_value": None}
    token = auth_header.split(" ")[1]
    return await capture_service.get_auth_session(token)


@router.post("/capture-blueprint", status_code=status.HTTP_201_CREATED)
async def capture_blueprint(blueprint: AuthFlowBlueprint):
    """Handle Auth Blueprint from Extension."""
    try:
        return await capture_service.store_blueprint(blueprint.dict())
    except Exception as e:
        print(f"[BLUEPRINT ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/export/postman")
async def export_logs_postman(
    limit: int = 5000, skip: int = 0,
    domain: Optional[str] = None, keyword: Optional[str] = None,
    method: Optional[str] = None, status: Optional[str] = None,
    log_ids: Optional[str] = Query(None, alias="ids"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    return await capture_service.export_postman(
        limit=limit, skip=skip, domain=domain, keyword=keyword,
        method=method, status=status, log_ids=log_ids,
        from_date=from_date, to_date=to_date,
    )


@router.get("/logs/export/json")
async def export_logs_json(
    limit: int = 5000, skip: int = 0,
    domain: Optional[str] = None, keyword: Optional[str] = None,
    method: Optional[str] = None, status: Optional[str] = None,
    log_ids: Optional[str] = Query(None, alias="ids"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    return await capture_service.export_json(
        limit=limit, skip=skip, domain=domain, keyword=keyword,
        method=method, status=status, log_ids=log_ids,
        from_date=from_date, to_date=to_date,
    )


@router.get("/logs/{log_id}")
async def get_log(log_id: str):
    return await capture_service.get_log(log_id)


@router.get("/logs")
async def get_logs(
    limit: int = 100, skip: int = 0,
    domain: Optional[str] = None, keyword: Optional[str] = None,
    method: Optional[str] = None, status: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    return await capture_service.search(
        limit=limit, skip=skip, domain=domain, keyword=keyword,
        method=method, status=status, from_date=from_date, to_date=to_date,
    )


@router.get("/endpoints")
async def get_captured_endpoints(limit: int = 100, skip: int = 0):
    return await capture_service.get_endpoints(limit=limit, skip=skip)


@router.delete("/logs")
async def clear_logs():
    return await capture_service.clear_all()
