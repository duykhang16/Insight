# Tenant Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Thêm collection `tenants` vào MongoDB, Super Admin quản lý Tenant theo nhóm khách hàng/công ty, mỗi Tenant chỉ có 1 tenant_admin, cảnh báo khi assign tenant_admin đã có, Super Admin có log/user view riêng tách biệt Tenant Admin.

**Architecture:**
- Thêm collection `tenants` (tên cty, tenant_admin_email, created_at, is_active)
- `users` giữ `parent_admin_id` = email của tenant_admin (không thay đổi)
- Super Admin dashboard dùng endpoint riêng `/api/v1/super/tenants` — aggregate từ `tenants` + `users` + `audit_logs`
- Super Admin chỉ tác động đến `tenant_admin` tier, không đụng manager/viewer
- Tenant Admin dùng endpoint `/api/v1/admin/*` hiện tại (đã có scope guard)

**Tech Stack:** FastAPI, Motor (async MongoDB), React, Tailwind CSS, lucide-react

---

## Task 1: Backend — Collection `tenants` + CRUD

**Files:**
- Create: `sources/insight/backend/app/database/tenants_crud.py`
- Modify: `sources/insight/backend/app/database/connection.py`

**Step 1: Thêm index cho collection `tenants` trong connection.py**

Trong `connect_to_mongo()`, sau dòng `await db.master_config.create_index("is_active")`, thêm:

```python
# === Tenant management ===
await db.tenants.create_index("tenant_admin_email", unique=True, sparse=True)
await db.tenants.create_index("name", unique=True)
```

**Step 2: Tạo file `tenants_crud.py`**

```python
"""CRUD operations for tenants collection.

Schema:
  _id              : ObjectId
  name             : str  — tên công ty/khách hàng (unique)
  tenant_admin_email: str | None — email của tenant_admin được assign (unique, sparse)
  is_active        : bool
  created_at       : datetime
  note             : str | None — ghi chú tuỳ ý
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from .connection import get_database


async def create_tenant(name: str, note: str = "") -> str:
    db = get_database()
    doc = {
        "name": name,
        "tenant_admin_email": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "note": note,
    }
    result = await db.tenants.insert_one(doc)
    return str(result.inserted_id)


async def get_all_tenants() -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.tenants.find().sort("created_at", -1)
    docs = await cursor.to_list(500)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


async def get_tenant_by_id(tenant_id: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return None
    doc = await db.tenants.find_one({"_id": obj_id})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


async def get_tenant_by_admin_email(email: str) -> Optional[Dict[str, Any]]:
    """Return tenant doc where tenant_admin_email == email, or None."""
    db = get_database()
    doc = await db.tenants.find_one({"tenant_admin_email": email})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


async def assign_tenant_admin(tenant_id: str, admin_email: str) -> bool:
    """Assign a tenant_admin to a tenant. Clears previous assignment on that tenant."""
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return False
    result = await db.tenants.update_one(
        {"_id": obj_id},
        {"$set": {"tenant_admin_email": admin_email}}
    )
    return result.matched_count > 0


async def unassign_tenant_admin(tenant_id: str) -> bool:
    """Remove tenant_admin assignment from a tenant."""
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return False
    result = await db.tenants.update_one(
        {"_id": obj_id},
        {"$set": {"tenant_admin_email": None}}
    )
    return result.matched_count > 0


async def update_tenant(tenant_id: str, fields: Dict[str, Any]) -> bool:
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return False
    allowed = {k: v for k, v in fields.items() if k in ("name", "note", "is_active")}
    if not allowed:
        return False
    result = await db.tenants.update_one({"_id": obj_id}, {"$set": allowed})
    return result.matched_count > 0


async def delete_tenant(tenant_id: str) -> bool:
    db = get_database()
    try:
        obj_id = ObjectId(tenant_id)
    except Exception:
        return False
    result = await db.tenants.delete_one({"_id": obj_id})
    return result.deleted_count > 0


async def get_tenants_with_stats() -> List[Dict[str, Any]]:
    """Return tenants enriched with sub-account count.

    Joins tenants → users (by parent_admin_id == tenant_admin_email).
    Returns list sorted by created_at desc.
    """
    db = get_database()
    pipeline = [
        {"$sort": {"created_at": -1}},
        {
            "$lookup": {
                "from": "users",
                "let": {"admin_email": "$tenant_admin_email"},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": ["$parent_admin_id", "$$admin_email"]}}},
                    {"$count": "count"}
                ],
                "as": "sub_count_arr"
            }
        },
        {
            "$addFields": {
                "sub_account_count": {
                    "$ifNull": [{"$arrayElemAt": ["$sub_count_arr.count", 0]}, 0]
                }
            }
        },
        {"$project": {"sub_count_arr": 0}},
    ]
    cursor = db.tenants.aggregate(pipeline)
    docs = await cursor.to_list(500)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs
```

**Step 3: Commit**

```bash
git add sources/insight/backend/app/database/tenants_crud.py sources/insight/backend/app/database/connection.py
git commit -m "feat: add tenants collection CRUD + indexes"
```

---

## Task 2: Backend — Super Admin API routes `/api/v1/super/`

**Files:**
- Create: `sources/insight/backend/app/features/super/routes.py`
- Create: `sources/insight/backend/app/features/super/__init__.py`
- Modify: `sources/insight/backend/app/main.py`

**Step 1: Tạo `__init__.py` rỗng**

```python
# sources/insight/backend/app/features/super/__init__.py
```

**Step 2: Tạo `routes.py`**

```python
"""Super Admin exclusive routes — /api/v1/super/

Chỉ super_admin mới được gọi. Tách hoàn toàn khỏi /admin/ (dùng chung bởi tenant_admin).

Endpoints:
  GET  /tenants               — list all tenants with stats
  POST /tenants               — create tenant
  PUT  /tenants/{id}          — update tenant name/note/is_active
  DELETE /tenants/{id}        — delete tenant (unlinks admin, không xóa users)
  POST /tenants/{id}/assign-admin   — assign tenant_admin (với conflict check)
  POST /tenants/{id}/unassign-admin — remove tenant_admin assignment
  GET  /users                 — all users flat list (super_admin view)
  GET  /logs                  — all audit logs (super_admin view, filter by tenant)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
import pytz
from app.shared.auth_deps import require_super_admin
from app.database.connection import get_database
from app.database.models import LogResponse

router = APIRouter(prefix="/api/v1/super", tags=["Super Admin"])
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")


# ===== Tenant CRUD =====

@router.get("/tenants")
async def list_tenants(
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    from app.database.tenants_crud import get_tenants_with_stats
    return await get_tenants_with_stats()


@router.post("/tenants")
async def create_tenant(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    name = payload.get("name", "").strip()
    note = payload.get("note", "")
    if not name:
        raise HTTPException(status_code=400, detail="Tên tenant là bắt buộc.")
    from app.database.tenants_crud import create_tenant as _create
    tenant_id = await _create(name, note)
    return {"message": "Tạo tenant thành công.", "id": tenant_id}


@router.put("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    from app.database.tenants_crud import update_tenant as _update, get_tenant_by_id
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant không tồn tại.")
    ok = await _update(tenant_id, payload)
    if not ok:
        raise HTTPException(status_code=400, detail="Không có trường hợp lệ để cập nhật.")
    return {"message": "Cập nhật tenant thành công."}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    from app.database.tenants_crud import delete_tenant as _delete, get_tenant_by_id
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant không tồn tại.")
    await _delete(tenant_id)
    return {"message": "Đã xóa tenant. Các user trong tenant vẫn được giữ nguyên."}


@router.post("/tenants/{tenant_id}/assign-admin")
async def assign_tenant_admin(
    tenant_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Assign 1 tenant_admin vào tenant.

    Conflict checks:
    1. Email phải tồn tại và có role=tenant_admin
    2. Nếu tenant đã có admin → trả về warning (409) với info admin hiện tại
    3. Nếu email này đã được assign vào tenant khác → trả về warning (409)
    """
    admin_email = payload.get("admin_email", "").strip()
    if not admin_email:
        raise HTTPException(status_code=400, detail="admin_email là bắt buộc.")

    from app.database.tenants_crud import (
        get_tenant_by_id, get_tenant_by_admin_email, assign_tenant_admin as _assign
    )
    from app.database.auth_crud import get_user_by_email

    # Validate user exists + role
    user = await get_user_by_email(admin_email)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {admin_email} không tồn tại.")
    if user.get("role") != "tenant_admin":
        raise HTTPException(
            status_code=400,
            detail=f"User {admin_email} không có role tenant_admin (role hiện tại: {user.get('role')})."
        )

    # Check tenant exists
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant không tồn tại.")

    # Conflict: tenant already has an admin
    if tenant.get("tenant_admin_email") and tenant["tenant_admin_email"] != admin_email:
        raise HTTPException(
            status_code=409,
            detail=f"Tenant '{tenant['name']}' đã có Tenant Admin: {tenant['tenant_admin_email']}. Unassign trước khi gán admin mới."
        )

    # Conflict: this email is already managing another tenant
    existing_tenant = await get_tenant_by_admin_email(admin_email)
    if existing_tenant and existing_tenant["id"] != tenant_id:
        raise HTTPException(
            status_code=409,
            detail=f"{admin_email} đã là Tenant Admin của '{existing_tenant['name']}'. Mỗi Tenant Admin chỉ được quản lý 1 tenant."
        )

    await _assign(tenant_id, admin_email)
    return {"message": f"Đã gán {admin_email} làm Tenant Admin của tenant '{tenant['name']}'."}


@router.post("/tenants/{tenant_id}/unassign-admin")
async def unassign_tenant_admin(
    tenant_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    from app.database.tenants_crud import unassign_tenant_admin as _unassign, get_tenant_by_id
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant không tồn tại.")
    await _unassign(tenant_id)
    return {"message": "Đã gỡ Tenant Admin khỏi tenant."}


# ===== Super Admin — User flat list (chỉ tenant_admin tier) =====

@router.get("/users")
async def list_all_tenant_admins(
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Super Admin chỉ thấy + tác động đến tenant_admin accounts."""
    db = get_database()
    users = await db.users.find({"role": "tenant_admin"}).to_list(500)
    result = []
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
        u.pop("password_hash", None)
        result.append(u)
    return result


@router.post("/users")
async def create_tenant_admin(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Super Admin tạo tenant_admin account."""
    from app.database.auth_crud import create_user_with_password, get_user_by_email
    email = payload.get("email", "").strip()
    password = payload.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email và mật khẩu là bắt buộc.")
    if await get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Email đã tồn tại.")
    # Super admin tạo tenant_admin — không có parent_admin_id
    user_id = await create_user_with_password(
        email=email,
        password=password,
        role="tenant_admin",
        is_approved=payload.get("isApproved", True),
        parent_admin_id=None,
    )
    return {"message": "Tạo Tenant Admin thành công.", "id": user_id}


@router.delete("/users/{user_id}")
async def delete_tenant_admin(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Super Admin xóa tenant_admin. Tự bảo vệ: không xóa chính mình."""
    from bson import ObjectId
    db = get_database()
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID không hợp lệ.")
    user = await db.users.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
    if user.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình.")
    if user.get("role") != "tenant_admin":
        raise HTTPException(status_code=403, detail="Super Admin chỉ được xóa tài khoản tenant_admin.")
    await db.users.delete_one({"_id": obj_id})
    return {"message": "Đã xóa Tenant Admin."}


@router.post("/users/{user_id}/reset-password")
async def reset_tenant_admin_password(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    from bson import ObjectId
    from app.database.auth_crud import reset_user_password
    db = get_database()
    new_password = payload.get("new_password", "")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu tối thiểu 6 ký tự.")
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID không hợp lệ.")
    user = await db.users.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
    if user.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể reset password của chính mình.")
    if user.get("role") != "tenant_admin":
        raise HTTPException(status_code=403, detail="Super Admin chỉ được reset password tenant_admin.")
    await reset_user_password(user["email"], new_password)
    return {"message": "Reset mật khẩu thành công."}


# ===== Super Admin — Logs (toàn hệ thống, filter theo tenant) =====

@router.get("/logs")
async def get_super_logs(
    limit: int = 100,
    skip: int = 0,
    tenant_admin_email: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Super Admin xem toàn bộ audit logs. Filter theo tenant_admin_email nếu cần."""
    db = get_database()
    query: dict = {}

    if tenant_admin_email:
        # Lấy tất cả emails thuộc tenant này (tenant_admin + sub-accounts)
        sub_users = await db.users.find(
            {"parent_admin_id": tenant_admin_email},
            {"email": 1}
        ).to_list(500)
        all_emails = [tenant_admin_email] + [u["email"] for u in sub_users]
        query["$or"] = [
            {"actor_email": {"$in": all_emails}},
            {"insight_user_id": {"$in": all_emails}},
        ]

    cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=limit)

    formatted = []
    for log in logs:
        utc_dt = log.get("timestamp")
        gmt7_str = ""
        if utc_dt:
            if utc_dt.tzinfo is None:
                utc_dt = pytz.utc.localize(utc_dt)
            gmt7_str = utc_dt.astimezone(VN_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")
        formatted.append(LogResponse(
            id=str(log["_id"]),
            timestamp=gmt7_str,
            actor_email=log.get("actor_email"),
            insight_user_id=log.get("insight_user_id"),
            method=log.get("method", ""),
            endpoint=log.get("endpoint", ""),
            payload=log.get("payload"),
            ip_address=log.get("ip_address"),
            statusCode=log.get("statusCode", 0),
            action=log.get("action"),
            site_id=log.get("site_id"),
            zone_id=log.get("zone_id"),
            master_account_used=log.get("master_account_used", False),
        ))
    return formatted
```

**Step 3: Đăng ký router trong `main.py`**

Thêm sau dòng `from app.features.master.routes import router as master_router`:
```python
from app.features.super.routes import router as super_router
```

Thêm sau dòng `app.include_router(master_router, ...)`:
```python
app.include_router(super_router)   # /api/v1/super — super_admin only
```

**Step 4: Commit**

```bash
git add sources/insight/backend/app/features/super/ sources/insight/backend/app/main.py
git commit -m "feat: add super admin API routes for tenant + user + log management"
```

---

## Task 3: Frontend — Trang Super Admin riêng (`/super/tenants`)

**Files:**
- Create: `sources/insight/frontend/src/pages/Super/TenantManagement.jsx`
- Modify: `sources/insight/frontend/src/App.jsx`
- Modify: `sources/insight/frontend/src/components/Sidebar/GlobalSidebar.jsx`

**Step 1: Tạo `TenantManagement.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Building2, Plus, Trash2, KeyRound, UserCheck, UserX,
    AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Users
} from 'lucide-react';
import apiClient from '../../api/apiClient';

const ROLE_BADGE = 'bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs rounded px-2 py-0.5';

const Alert = ({ type, message, onClose }) => {
    const base = type === 'error'
        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    const Icon = type === 'error' ? AlertTriangle : CheckCircle;
    return (
        <div className={`flex items-start gap-2 border rounded-lg px-4 py-3 mb-4 text-sm ${base}`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{message}</span>
            {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 ml-2">&times;</button>}
        </div>
    );
};

const TenantManagement = () => {
    const currentEmail = sessionStorage.getItem('insight_user_email') || '';

    const [tenants, setTenants] = useState([]);
    const [tenantAdmins, setTenantAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [alert, setAlert] = useState(null);
    const [expandedTenant, setExpandedTenant] = useState(null);

    // Create tenant form
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', note: '' });
    const [creating, setCreating] = useState(false);

    // Create tenant admin form
    const [showCreateAdmin, setShowCreateAdmin] = useState(false);
    const [adminForm, setAdminForm] = useState({ email: '', password: '', isApproved: true });
    const [creatingAdmin, setCreatingAdmin] = useState(false);

    // Assign admin modal
    const [assignTarget, setAssignTarget] = useState(null); // tenant doc
    const [assignEmail, setAssignEmail] = useState('');
    const [assigning, setAssigning] = useState(false);

    // Reset password modal
    const [resetTarget, setResetTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);

    const showAlert = (type, message) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 7000);
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [tRes, uRes] = await Promise.all([
                apiClient.get('/super/tenants'),
                apiClient.get('/super/users'),
            ]);
            setTenants(tRes.data);
            setTenantAdmins(uRes.data);
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Tải dữ liệu thất bại.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Tenant CRUD ──
    const handleCreateTenant = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await apiClient.post('/super/tenants', form);
            showAlert('success', `Tạo tenant "${form.name}" thành công.`);
            setForm({ name: '', note: '' });
            setShowCreate(false);
            fetchAll();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Tạo tenant thất bại.');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteTenant = async (tenant) => {
        if (!confirm(`Xóa tenant "${tenant.name}"? Các user trong tenant vẫn được giữ nguyên.`)) return;
        try {
            await apiClient.delete(`/super/tenants/${tenant.id}`);
            showAlert('success', `Đã xóa tenant "${tenant.name}".`);
            fetchAll();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Xóa thất bại.');
        }
    };

    // ── Tenant Admin CRUD ──
    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setCreatingAdmin(true);
        try {
            await apiClient.post('/super/users', adminForm);
            showAlert('success', `Tạo Tenant Admin ${adminForm.email} thành công.`);
            setAdminForm({ email: '', password: '', isApproved: true });
            setShowCreateAdmin(false);
            fetchAll();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Tạo admin thất bại.');
        } finally {
            setCreatingAdmin(false);
        }
    };

    const handleDeleteAdmin = async (user) => {
        if (!confirm(`Xóa tài khoản Tenant Admin ${user.email}?`)) return;
        try {
            await apiClient.delete(`/super/users/${user.id}`);
            showAlert('success', `Đã xóa ${user.email}.`);
            fetchAll();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Xóa thất bại.');
        }
    };

    // ── Assign/Unassign admin ──
    const handleAssign = async (e) => {
        e.preventDefault();
        setAssigning(true);
        try {
            await apiClient.post(`/super/tenants/${assignTarget.id}/assign-admin`, { admin_email: assignEmail });
            showAlert('success', `Đã gán ${assignEmail} làm Tenant Admin của "${assignTarget.name}".`);
            setAssignTarget(null);
            setAssignEmail('');
            fetchAll();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Gán admin thất bại.');
        } finally {
            setAssigning(false);
        }
    };

    const handleUnassign = async (tenant) => {
        if (!confirm(`Gỡ Tenant Admin ${tenant.tenant_admin_email} khỏi "${tenant.name}"?`)) return;
        try {
            await apiClient.post(`/super/tenants/${tenant.id}/unassign-admin`);
            showAlert('success', 'Đã gỡ Tenant Admin.');
            fetchAll();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Gỡ admin thất bại.');
        }
    };

    // ── Reset password ──
    const handleResetPassword = async (e) => {
        e.preventDefault();
        setResetting(true);
        try {
            await apiClient.post(`/super/users/${resetTarget.id}/reset-password`, { new_password: newPassword });
            showAlert('success', `Reset mật khẩu ${resetTarget.email} thành công.`);
            setResetTarget(null);
            setNewPassword('');
        } catch (err) {
            showAlert('error', err.response?.data?.detail || 'Reset thất bại.');
        } finally {
            setResetting(false);
        }
    };

    // Unassigned tenant admins (not linked to any tenant)
    const assignedEmails = new Set(tenants.map(t => t.tenant_admin_email).filter(Boolean));
    const unassignedAdmins = tenantAdmins.filter(a => !assignedEmails.has(a.email));

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
        </div>
    );

    return (
        <div className="p-6 max-w-6xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-blue-400" />
                    <h1 className="text-lg font-semibold text-white">Tenant Management</h1>
                    <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
                        {tenants.length} tenants
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowCreateAdmin(!showCreateAdmin)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                    >
                        <UserCheck className="w-4 h-4" />
                        Tạo Tenant Admin
                    </button>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Tạo Tenant
                    </button>
                </div>
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

            {/* Create Tenant Admin form */}
            {showCreateAdmin && (
                <div className="bg-[#0F172A] border border-amber-500/20 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-amber-400 mb-4">Tạo Tenant Admin mới</h2>
                    <form onSubmit={handleCreateAdmin} className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Email</label>
                            <input type="email" required value={adminForm.email}
                                onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                                placeholder="admin@company.com" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Mật khẩu</label>
                            <input type="password" required minLength={6} value={adminForm.password}
                                onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                                placeholder="Tối thiểu 6 ký tự" />
                        </div>
                        <div className="flex items-end gap-3">
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={adminForm.isApproved}
                                    onChange={e => setAdminForm({ ...adminForm, isApproved: e.target.checked })}
                                    className="rounded" />
                                Approved ngay
                            </label>
                        </div>
                        <div className="col-span-2 flex gap-2">
                            <button type="submit" disabled={creatingAdmin}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg disabled:opacity-50">
                                {creatingAdmin ? 'Đang tạo...' : 'Tạo Tenant Admin'}
                            </button>
                            <button type="button" onClick={() => setShowCreateAdmin(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg">
                                Hủy
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Create Tenant form */}
            {showCreate && (
                <div className="bg-[#0F172A] border border-blue-500/20 rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-blue-400 mb-4">Tạo Tenant mới</h2>
                    <form onSubmit={handleCreateTenant} className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Tên công ty / Tenant</label>
                            <input type="text" required value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="VD: Công ty AITC" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Ghi chú</label>
                            <input type="text" value={form.note}
                                onChange={e => setForm({ ...form, note: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="Tuỳ chọn" />
                        </div>
                        <div className="col-span-2 flex gap-2">
                            <button type="submit" disabled={creating}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
                                {creating ? 'Đang tạo...' : 'Tạo Tenant'}
                            </button>
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg">
                                Hủy
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tenant list */}
            <div className="space-y-3">
                {tenants.map(tenant => (
                    <div key={tenant.id} className="bg-[#0F172A] border border-slate-700 rounded-xl overflow-hidden">
                        {/* Tenant row */}
                        <div className="flex items-center gap-4 px-4 py-3">
                            <button
                                onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            >
                                {expandedTenant === tenant.id
                                    ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                                    : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                                <span className="font-semibold text-white text-sm">{tenant.name}</span>
                                {tenant.note && <span className="text-xs text-slate-500 truncate">— {tenant.note}</span>}
                            </button>

                            {/* Stats */}
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                    <Users className="w-3 h-3" />
                                    {tenant.sub_account_count} sub-accounts
                                </span>

                                {/* Admin badge */}
                                {tenant.tenant_admin_email ? (
                                    <div className="flex items-center gap-1.5">
                                        <span className={ROLE_BADGE}>{tenant.tenant_admin_email}</span>
                                        <button
                                            onClick={() => handleUnassign(tenant)}
                                            title="Gỡ Tenant Admin"
                                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                        >
                                            <UserX className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setAssignTarget(tenant); setAssignEmail(''); }}
                                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded px-2 py-0.5 transition-colors"
                                    >
                                        <UserCheck className="w-3 h-3" />
                                        Gán Admin
                                    </button>
                                )}

                                <button
                                    onClick={() => handleDeleteTenant(tenant)}
                                    title="Xóa tenant"
                                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {tenants.length === 0 && (
                    <div className="text-center py-12 text-slate-600 text-sm">
                        Chưa có tenant nào. Tạo tenant đầu tiên để bắt đầu.
                    </div>
                )}
            </div>

            {/* Unassigned Tenant Admins */}
            {unassignedAdmins.length > 0 && (
                <div className="bg-[#0F172A] border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                            Tenant Admin chưa được gán tenant ({unassignedAdmins.length})
                        </span>
                    </div>
                    <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-800">
                            {unassignedAdmins.map(user => (
                                <tr key={user.id} className="hover:bg-slate-800/30">
                                    <td className="px-4 py-3 text-slate-200 font-mono text-xs">{user.email}</td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                        {user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 justify-end">
                                            <button onClick={() => setResetTarget(user)} title="Reset mật khẩu"
                                                className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                                                <KeyRound className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleDeleteAdmin(user)} title="Xóa"
                                                disabled={user.email === currentEmail}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-30">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Assign Admin Modal */}
            {assignTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4">
                        <h3 className="text-sm font-semibold text-white mb-1">Gán Tenant Admin</h3>
                        <p className="text-xs text-slate-400 mb-4">Tenant: <span className="text-amber-400">{assignTarget.name}</span></p>
                        <form onSubmit={handleAssign} className="space-y-3">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Chọn Tenant Admin</label>
                                <select value={assignEmail} onChange={e => setAssignEmail(e.target.value)} required
                                    className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
                                    <option value="">— Chọn tài khoản —</option>
                                    {tenantAdmins.map(a => (
                                        <option key={a.id} value={a.email}>
                                            {a.email}{assignedEmails.has(a.email) ? ' (đã có tenant)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <button type="submit" disabled={assigning}
                                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg disabled:opacity-50">
                                    {assigning ? 'Đang gán...' : 'Xác nhận'}
                                </button>
                                <button type="button" onClick={() => setAssignTarget(null)}
                                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg">
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4">
                        <div className="flex items-center gap-2 mb-4">
                            <KeyRound className="w-4 h-4 text-amber-400" />
                            <h3 className="text-sm font-semibold text-white">Reset mật khẩu</h3>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">{resetTarget.email}</p>
                        <form onSubmit={handleResetPassword} className="space-y-3">
                            <input type="password" required minLength={6} value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" autoFocus />
                            <div className="flex gap-2">
                                <button type="submit" disabled={resetting}
                                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg disabled:opacity-50">
                                    {resetting ? 'Đang reset...' : 'Xác nhận'}
                                </button>
                                <button type="button" onClick={() => { setResetTarget(null); setNewPassword(''); }}
                                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg">
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TenantManagement;
```

**Step 2: Thêm route trong `App.jsx`**

Thêm import:
```jsx
import TenantManagement from './pages/Super/TenantManagement';
```

Thêm guard component (chỉ super_admin):
```jsx
const SuperRoute = ({ userRole, children }) => {
  if (userRole === 'super_admin') return children;
  return <Navigate to="/dashboard" replace />;
};
```

Thêm route trong `<Routes>`:
```jsx
<Route path="/super/tenants" element={
  <SuperRoute userRole={userRole}>
    <TenantManagement />
  </SuperRoute>
} />
```

**Step 3: Thêm sidebar link trong `GlobalSidebar.jsx`**

Trong block Admin section, thêm riêng cho super_admin:
```jsx
{userRole === 'super_admin' && (
    <NavLink to="/super/tenants" className={getNavLinkClass}>
        <Building2 className="w-5 h-5 mr-3" />
        Tenant Management
    </NavLink>
)}
```

Thêm import `Building2` từ lucide-react.

**Step 4: Commit**

```bash
git add sources/insight/frontend/src/pages/Super/ sources/insight/frontend/src/App.jsx sources/insight/frontend/src/components/Sidebar/GlobalSidebar.jsx
git commit -m "feat: add Tenant Management page for super_admin"
```

---

## Task 4: MongoDB Migration — Seed dữ liệu hiện có

**Files:**
- Create: `sources/insight/backend/scripts/migrate_tenants.py` (temporary, xóa sau khi chạy)

**Step 1: Tạo script migration**

```python
"""One-time migration: tạo tenant records cho các tenant_admin đang có trong DB.

Chạy: python -m scripts.migrate_tenants
Sau khi chạy thành công, xóa file này.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "insight_db")


async def main():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    # 1. Migrate role strings cũ
    await db.users.update_many({"role": "insight_admin"}, {"$set": {"role": "tenant_admin"}})
    await db.users.update_many({"role": "insight_viewer"}, {"$set": {"role": "manager"}})
    await db.users.update_many({"role": "guest"}, {"$set": {"role": "viewer"}})
    print("✓ Role strings migrated")

    # 2. Tạo tenant record cho mỗi tenant_admin
    tenant_admins = await db.users.find({"role": "tenant_admin"}).to_list(500)
    for admin in tenant_admins:
        email = admin["email"]
        existing = await db.tenants.find_one({"tenant_admin_email": email})
        if not existing:
            await db.tenants.insert_one({
                "name": f"Tenant — {email}",
                "tenant_admin_email": email,
                "is_active": True,
                "created_at": admin.get("created_at"),
                "note": "Auto-migrated",
            })
            print(f"✓ Created tenant for {email}")
        else:
            print(f"  Skipped {email} (tenant already exists)")

    client.close()
    print("Migration complete.")

asyncio.run(main())
```

**Step 2: Chạy migration**

```bash
cd sources/insight/backend
python -m scripts.migrate_tenants
```

**Step 3: Xóa script sau khi chạy**

```bash
rm sources/insight/backend/scripts/migrate_tenants.py
git add -A
git commit -m "feat: migrate tenant data + role strings"
```

---

## Task 5: Super Admin Logs page riêng

**Files:**
- Create: `sources/insight/frontend/src/pages/Super/SuperLogs.jsx`
- Modify: `sources/insight/frontend/src/App.jsx`
- Modify: `sources/insight/frontend/src/components/Sidebar/GlobalSidebar.jsx`

**Step 1: Tạo `SuperLogs.jsx`**

Copy từ `pages/Admin/Logs.jsx`, chỉnh:
- Đổi API call từ `/admin/logs` → `/super/logs`
- Thêm filter dropdown `tenant_admin_email` (dùng list từ `/super/users`)
- Tiêu đề: "System Logs — All Tenants"

Cấu trúc chính:
```jsx
const [tenantFilter, setTenantFilter] = useState('');
const [tenantAdmins, setTenantAdmins] = useState([]);

// Fetch logs
const params = { limit, skip };
if (tenantFilter) params.tenant_admin_email = tenantFilter;
const res = await apiClient.get('/super/logs', { params });
```

Filter UI:
```jsx
<select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
    className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-3 py-1.5 text-sm">
    <option value="">— Tất cả Tenants —</option>
    {tenantAdmins.map(a => <option key={a.id} value={a.email}>{a.email}</option>)}
</select>
```

**Step 2: Đăng ký route trong `App.jsx`**

```jsx
import SuperLogs from './pages/Super/SuperLogs';

// Trong Routes:
<Route path="/super/logs" element={
  <SuperRoute userRole={userRole}>
    <SuperLogs />
  </SuperRoute>
} />
```

**Step 3: Thêm sidebar link**

```jsx
{userRole === 'super_admin' && (
    <NavLink to="/super/logs" className={getNavLinkClass}>
        <ScrollText className="w-5 h-5 mr-3" />
        System Logs
    </NavLink>
)}
```

**Step 4: Commit**

```bash
git add sources/insight/frontend/src/pages/Super/SuperLogs.jsx sources/insight/frontend/src/App.jsx sources/insight/frontend/src/components/Sidebar/GlobalSidebar.jsx
git commit -m "feat: add Super Admin system logs page with tenant filter"
```

---

## Kiểm tra cuối

```bash
# Restart backend
docker compose restart insight-backend

# Verify collections exist
# Trong MongoDB shell:
# db.tenants.find().pretty()
# db.users.find({role: "tenant_admin"}).pretty()
```

**Acceptance criteria:**
- [ ] Super Admin thấy menu "Tenant Management" và "System Logs" riêng
- [ ] Tenant Admin KHÔNG thấy 2 menu trên
- [ ] Tạo tenant → assign tenant_admin → cảnh báo nếu đã có admin
- [ ] Gán email đã là admin của tenant khác → error 409
- [ ] Super Admin chỉ tạo/xóa/reset-password được `tenant_admin`
- [ ] Super Logs filter được theo từng tenant
- [ ] Tenant Admin logs (`/admin/logs`) chỉ thấy activity trong tenant mình
