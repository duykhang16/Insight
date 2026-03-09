"""CRUD operations with advanced filtering, full-text search, and auth management."""
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.database.connection import get_database


# ===== URL Normalization Helpers =====

def _parse_cookies(cookie_string: str) -> Dict[str, str]:
    """Parse a cookie string like 'key1=val1; key2=val2' into a dict."""
    cookies = {}
    if not cookie_string:
        return cookies
    for part in cookie_string.split(";"):
        part = part.strip()
        if "=" in part:
            key, _, value = part.partition("=")
            cookies[key.strip()] = value.strip()
    return cookies


def _body_to_text(body: Any) -> str:
    """Convert body to searchable text string."""
    if body is None:
        return ""
    if isinstance(body, str):
        return body[:5000]  # Limit text length
    if isinstance(body, (dict, list)):
        try:
            return json.dumps(body, ensure_ascii=False)[:5000]
        except (TypeError, ValueError):
            return str(body)[:5000]
    return str(body)[:5000]


# ===== ENDPOINT CRUD =====

async def upsert_endpoint(
    api_key: str,
    domain: str,
    path: str,
    method: str,
    request_headers: Dict[str, str],
    cookies_str: str = "",
    query_params: Dict[str, str] = None,
    request_body: Any = None,
    response_body: Any = None,
    status_code: int = 200,
    content_type: str = "application/json",
    duration_ms: int = 0,
    mandatory_headers: Any = None,
    execution_context: str = "DATA_FETCH",
    dependencies: List[str] = None,
) -> str:
    """Create or update an endpoint document with smart merging."""
    db = get_database()
    now = datetime.now(timezone.utc)
    headers = {k.lower(): v for k, v in request_headers.items()}
    parsed_cookies = _parse_cookies(cookies_str)
    qp = query_params or {}
    deps = dependencies or []
    
    # Convert Pydantic model to dict if needed
    mh_dict = mandatory_headers.dict() if hasattr(mandatory_headers, "dict") else mandatory_headers

    existing = await db.endpoints.find_one({"api_key": api_key})

    if existing:
        # MERGE UPDATE
        merged_qp = {**existing.get("query_params", {}), **qp}
        merged_cookies = {**existing.get("cookies", {}), **parsed_cookies}
        merged_headers = {**existing.get("request_headers", {}), **headers}

        update_doc = {
            "$set": {
                "request_headers": merged_headers,
                "cookies": merged_cookies,
                "query_params": merged_qp,
                "content_type": content_type,
                "last_seen_at": now,
                "execution_context": execution_context,
                "mandatory_headers_sample": mh_dict,
                "dependencies": list(set(existing.get("dependencies", []) + deps))
            },
            "$inc": {"request_count": 1},
        }

        if status_code and status_code not in existing.get("status_codes", []):
            update_doc["$addToSet"] = {"status_codes": status_code}

        if request_body is not None:
            update_doc["$set"]["request_body_sample"] = request_body
        if response_body is not None:
            update_doc["$set"]["response_body_sample"] = response_body

        await db.endpoints.update_one({"_id": existing["_id"]}, update_doc)
        return str(existing["_id"])
    else:
        # CREATE NEW
        new_doc = {
            "api_key": api_key,
            "domain": domain,
            "path": path,
            "method": method,
            "request_headers": headers,
            "cookies": parsed_cookies,
            "query_params": qp,
            "request_body_sample": request_body,
            "response_body_sample": response_body,
            "status_codes": [status_code] if status_code else [],
            "content_type": content_type,
            "request_count": 1,
            "first_seen_at": now,
            "last_seen_at": now,
            "execution_context": execution_context,
            "mandatory_headers_sample": mh_dict,
            "dependencies": deps,
        }
        result = await db.endpoints.insert_one(new_doc)
        return str(result.inserted_id)


# ===== RAW LOG CRUD =====

async def insert_raw_log(
    url: str,
    method: str,
    domain: str,
    path: str,
    request_headers: Dict[str, str],
    request_body: Any = None,
    status_code: int = 0,
    response_headers: Dict[str, str] = None,
    response_body: Any = None,
    duration_ms: int = 0,
    cookies: str = "",
    query_params: Dict[str, str] = None,
    mandatory_headers: Any = None,
    execution_context: str = "DATA_FETCH",
) -> str:
    """Insert a raw request/response log for full-text search."""
    db = get_database()
    now = datetime.now(timezone.utc)
    
    mh_dict = mandatory_headers.dict() if hasattr(mandatory_headers, "dict") else mandatory_headers

    doc = {
        "url": url,
        "method": method.upper(),
        "domain": domain,
        "path": path,
        "request_headers": request_headers,
        "request_body": request_body,
        "request_body_text": _body_to_text(request_body),
        "status_code": status_code,
        "response_headers": response_headers or {},
        "response_body": response_body,
        "response_body_text": _body_to_text(response_body),
        "duration_ms": duration_ms,
        "cookies": cookies,
        "query_params": query_params or {},
        "mandatory_headers": mh_dict,
        "execution_context": execution_context,
        "timestamp": now,
    }

    result = await db.raw_logs.insert_one(doc)
    return str(result.inserted_id)


async def get_log_by_id(log_id: str) -> Optional[dict]:
    """Retrieve a single raw log by ID."""
    from bson import ObjectId
    db = get_database()
    try:
        doc = await db.raw_logs.find_one({"_id": ObjectId(log_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc
    except Exception:
        return None


# ===== SEARCH & FILTER =====

async def search_logs(
    keyword: Optional[str] = None,
    method: Optional[List[str]] = None,
    status_code: Optional[List[int]] = None,
    domain: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    log_ids: Optional[List[str]] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[List[dict], int]:
    """Search raw_logs with advanced filtering.
    
    - keyword: searches across url, request_body_text, response_body_text
    - method: filter by HTTP methods (e.g. ["GET", "POST"])
    - status_code: filter by status codes (e.g. [200, 401])
    - domain: filter by domain
    - from_date: logs after this timestamp
    - to_date: logs before this timestamp
    """
    db = get_database()
    query = {}

    if domain:
        query["domain"] = domain

    if method:
        query["method"] = {"$in": [m.upper() for m in method]}

    if status_code:
        query["status_code"] = {"$in": status_code}

    if log_ids:
        from bson import ObjectId
        valid_ids = []
        for lid in log_ids:
            try: valid_ids.append(ObjectId(lid))
            except: continue
        if valid_ids:
            query["_id"] = {"$in": valid_ids}

    if from_date or to_date:
        query["timestamp"] = {}
        if from_date:
            query["timestamp"]["$gte"] = from_date
        if to_date:
            query["timestamp"]["$lte"] = to_date

    if keyword:
        # Use regex for more flexible keyword matching if text index is not ideal
        # or if we want to search URL even without $text index
        regex = {"$regex": keyword, "$options": "i"}
        query["$or"] = [
            {"url": regex},
            {"request_body_text": regex},
            {"response_body_text": regex},
            {"method": regex},
            {"path": regex}
        ]

    total = await db.raw_logs.count_documents(query)
    cursor = (
        db.raw_logs.find(query, {"request_body_text": 0, "response_body_text": 0})
        .sort("timestamp", -1)
        .skip(skip)
        .limit(limit)
    )
    logs = await cursor.to_list(length=limit)
    for log in logs:
        log["_id"] = str(log["_id"])

    return logs, total


async def get_all_endpoints(
    domain: Optional[str] = None,
    method: Optional[List[str]] = None,
    status_code: Optional[List[int]] = None,
    skip: int = 0,
    limit: int = 500,
) -> tuple[List[dict], int]:
    """Retrieve endpoints with optional filtering."""
    db = get_database()
    query = {}

    if domain:
        query["domain"] = domain

    if method:
        query["method"] = {"$in": [m.upper() for m in method]}

    if status_code:
        # Match endpoints that have ANY of the given status codes
        query["status_codes"] = {"$elemMatch": {"$in": status_code}}

    total = await db.endpoints.count_documents(query)
    cursor = (
        db.endpoints.find(query)
        .sort("path", 1)
        .skip(skip)
        .limit(limit)
    )
    endpoints = await cursor.to_list(length=limit)
    for ep in endpoints:
        ep["_id"] = str(ep["_id"])
    return endpoints, total


async def get_domains() -> List[str]:
    """Get list of unique captured domains."""
    db = get_database()
    return await db.endpoints.distinct("domain")


async def clear_all_data() -> dict:
    """Delete all data from all collections."""
    db = get_database()
    ep_count = (await db.endpoints.delete_many({})).deleted_count
    log_count = (await db.raw_logs.delete_many({})).deleted_count
    auth_count = (await db.auth_sessions.delete_many({})).deleted_count
    bp_count = (await db.auth_blueprints.delete_many({})).deleted_count
    return {
        "endpoints_deleted": ep_count,
        "logs_deleted": log_count,
        "auth_sessions_deleted": auth_count,
        "auth_blueprints_deleted": bp_count,
    }


# ===== AUTH SESSION CRUD =====

async def upsert_auth_session(
    token_type: str,
    token_value: str,
    email: Optional[str] = None,
    refresh_token: Optional[str] = None,
    expires_in: Optional[int] = None,
    source_url: str = "",
    headers_snapshot: Dict[str, str] = None,
) -> str:
    """Store or update a captured authentication session."""
    db = get_database()
    now = datetime.now(timezone.utc)

    doc = {
        "token_type": token_type,
        "token_value": token_value,
        "email": email,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
        "source_url": source_url,
        "headers_snapshot": headers_snapshot or {},
        "captured_at": now,
    }

    # Use token_value as the unique key to prevent shared session overwrites
    result = await db.auth_sessions.update_one(
        {"token_value": token_value},
        {"$set": doc},
        upsert=True,
    )
    return str(result.upserted_id) if result.upserted_id else "updated"


async def get_latest_auth(token_type: Optional[str] = "bearer") -> Optional[dict]:
    """Get the most recent auth session, preferring bearer tokens."""
    db = get_database()
    query = {}
    if token_type:
        query["token_type"] = token_type

    doc = await db.auth_sessions.find_one(query, sort=[("captured_at", -1)])
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def get_all_auth_sessions() -> List[dict]:
    """Get all auth sessions."""
    db = get_database()
    cursor = db.auth_sessions.find().sort("captured_at", -1)
    sessions = await cursor.to_list(length=20)
    for s in sessions:
        s["_id"] = str(s["_id"])
    return sessions


async def delete_all_auth_sessions():
    """Clear all stored authentication sessions."""
    db = get_database()
    await db.auth_sessions.delete_many({})


async def delete_auth_session(token_type: str):
    """Delete a specific auth session by type."""
    db = get_database()
    await db.auth_sessions.delete_many({"token_type": token_type})


async def delete_auth_session_by_token(token_value: str):
    """Delete a specific auth session by its token value."""
    db = get_database()
    await db.auth_sessions.delete_many({"token_value": token_value})


# ===== AUTH BLUEPRINT CRUD =====

async def upsert_blueprint(blueprint_data: dict) -> str:
    """Store or update an authentication blueprint. One per base_url."""
    db = get_database()
    now = datetime.now(timezone.utc)
    
    base_url = blueprint_data.get("base_url")
    if not base_url:
        return "error: missing base_url"
        
    blueprint_data["created_at"] = now
    
    result = await db.auth_blueprints.update_one(
        {"base_url": base_url},
        {"$set": blueprint_data},
        upsert=True
    )
    return str(result.upserted_id) if result.upserted_id else "updated"


async def get_blueprint_by_domain(domain: str) -> Optional[dict]:
    """Retrieve a blueprint by domain (fuzzy match or exact origin)."""
    db = get_database()
    # Try exact match or if the base_url contains the domain
    blueprint = await db.auth_blueprints.find_one({
        "$or": [
            {"base_url": {"$regex": domain}},
            {"base_url": domain}
        ]
    })
    
    if blueprint:
        blueprint["_id"] = str(blueprint["_id"])
    return blueprint
