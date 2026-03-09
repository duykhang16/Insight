# Instant Insight — API Reference

> Tài liệu này tổng hợp toàn bộ API proxy (backend) và API gốc Aruba mà hệ thống gọi tới.
> Dùng làm tài liệu tham chiếu khi refactor hoặc rebuild.

---

## Mục lục

1. [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
2. [Frontend → Backend (Proxy API)](#frontend--backend-proxy-api)
   - [Auth](#1-auth--apiv1auth)
   - [Cloner / SSID Management](#2-cloner--apiv1cloner)
   - [Overview / Sites](#3-overview--apiv1overview)
   - [Config](#4-config--apiv1config)
   - [Inventory](#5-inventory--apiv1inventory)
   - [Replay / Generic Proxy](#6-replay--apiv1replay)
   - [Admin](#7-admin--apiv1admin)
   - [Capture (Internal)](#8-capture-internal--apiv1)
3. [Backend → Aruba API (Upstream)](#backend--aruba-api-upstream)
   - [SSO / Auth Flow](#aruba-sso--auth-flow)
   - [Sites API](#aruba-sites-api)
   - [Networks API](#aruba-networks-api)
4. [Headers & Auth Pattern](#headers--auth-pattern)
5. [Error Codes](#error-codes)

---

## Kiến trúc tổng quan

```text
Browser (React)
    │  Authorization: Bearer <aruba_token>
    │  X-Insight-User: <email>
    ▼
FastAPI Backend (:8000)
    │  Proxy / BFF pattern — ẩn secret, spoof headers
    ▼
Aruba Instant-On API
    https://portal.instant-on.hpe.com
    https://sso.arubainstanton.com
```

**Base URL frontend:** `/api/v1` (proxied qua Vite dev → `http://localhost:8000`)

**Session pattern:** Stateless — Aruba Bearer token là session token, lưu trong `sessionStorage`:

- `sessionStorage.getItem('token')` → Aruba access_token
- `sessionStorage.getItem('insight_user_email')` → email
- `sessionStorage.getItem('refresh_token')` → Fernet-encrypted `{u, p}`

---

## Frontend → Backend (Proxy API)

### 1. Auth — `/api/v1/auth`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/v1/auth/session` | Heartbeat check — echo lại token nếu hợp lệ |
| `POST` | `/api/v1/auth/login` | Đăng nhập Aruba, trả token + refresh_token |
| `POST` | `/api/v1/auth/refresh` | Giải mã refresh_token → đăng nhập lại → token mới |
| `POST` | `/api/v1/auth/logout` | Stateless logout (client xóa sessionStorage) |

#### `GET /api/v1/auth/session`

- **Auth required:** Bearer token (optional)
- **Response (200):**

```json
{ "token_value": "<token>", "status": "active" }
```

hoặc `{ "token_value": null }` nếu không có token.

#### `POST /api/v1/auth/login`

- **Body (JSON):**

```json
{ "username": "user@email.com", "password": "secret" }
```

- **Response (200):**

```json
{
  "status": "success",
  "token_value": "<aruba_access_token>",
  "refresh_token": "<fernet_blob>",
  "email": "user@email.com",
  "role": "admin|operator|viewer|user|guest"
}
```

- **Error (401):** Email không trong whitelist, hoặc sai credentials Aruba.

#### `POST /api/v1/auth/refresh`

- **Body (JSON):**

```json
{ "refresh_token": "<fernet_blob>" }
```

- **Response (200):**

```json
{
  "status": "success",
  "token_value": "<new_aruba_access_token>",
  "refresh_token": "<new_fernet_blob>"
}
```

#### `POST /api/v1/auth/logout`

- **Response (200):** `{ "status": "success" }`

---

### 2. Cloner — `/api/v1/cloner`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/v1/cloner/live-sites` | Lấy danh sách sites theo token |
| `GET` | `/api/v1/cloner/target-sites` | Alias của `/live-sites` |
| `GET` | `/api/v1/cloner/auth-session` | Stateless check token |
| `POST` | `/api/v1/cloner/login` | Legacy login (redirect sang `/auth/login`) |
| `POST` | `/api/v1/cloner/logout` | Legacy logout |
| `POST` | `/api/v1/cloner/preview` | Preview các operations sẽ clone |
| `POST` | `/api/v1/cloner/apply` | Thực thi clone config sang target sites |
| `GET` | `/api/v1/cloner/sites/{site_id}/ssids` | Lấy danh sách SSIDs của site |
| `POST` | `/api/v1/cloner/sync-password` | Batch update password SSID |
| `POST` | `/api/v1/cloner/sync-config` | Batch deep sync config SSID từ source site |
| `POST` | `/api/v1/cloner/sync-delete` | Batch xóa SSID matching |
| `POST` | `/api/v1/cloner/sync-create` | Batch tạo SSID mới |
| `GET` | `/api/v1/cloner/site-overview/{site_id}` | Lấy network overview của site |

#### `GET /api/v1/cloner/live-sites`

- **Auth:** `Authorization: Bearer <token>` (required)
- **Response (200):**

```json
[
  { "siteId": "abc123", "siteName": "HQ Office", "role": "administrator" }
]
```

#### `POST /api/v1/cloner/preview`

- **Auth:** Bearer (required nếu source=live)
- **Body (JSON):**

```json
{ "site_id": "abc123", "source": "live" }
```

- `source`: `"live"` (fetch live từ Aruba) hoặc `"captured"` (từ DB)
- **Response (200):**

```json
{
  "site_id": "abc123",
  "source": "live",
  "operations": [ { "type": "UPDATE_NETWORK" } ]
}
```

#### `POST /api/v1/cloner/apply`

- **Auth:** Bearer (required)
- **Body (JSON):**

```json
{
  "target_site_ids": ["site1", "site2"],
  "operations": [ { "type": "UPDATE_NETWORK" } ]
}
```

- Hỗ trợ cả `target_site_id` (string, single) cho backward compat.
- **Response (200):**

```json
{
  "status": "success",
  "results": {
    "site1": {},
    "site2": {}
  }
}
```

#### `POST /api/v1/cloner/sync-password`

- **Auth:** Bearer (required)
- **Body (JSON):**

```json
{
  "source_network_name": "WiFi-HQ",
  "new_password": "NewPassword123",
  "target_site_ids": ["site1", "site2"]
}
```

- **Response (200):** `{ "status": "success", "results": {} }`

#### `POST /api/v1/cloner/sync-config`

- **Auth:** Bearer (required)
- **Body (JSON):**

```json
{
  "source_site_id": "siteA",
  "source_network_name": "WiFi-HQ",
  "target_site_ids": ["site1", "site2"]
}
```

#### `POST /api/v1/cloner/sync-delete`

- **Auth:** Bearer (required)
- **Body (JSON):**

```json
{
  "source_network_name": "WiFi-Guest",
  "target_site_ids": ["site1", "site2"]
}
```

#### `POST /api/v1/cloner/sync-create`

- **Auth:** Bearer (required)
- **Body (JSON):**

```json
{
  "network_name": "WiFi-New",
  "network_type": "employee",
  "security": "wpa2-personal",
  "password": "MyPassword",
  "is_hidden": false,
  "is_wifi6_enabled": true,
  "band_24": true,
  "band_5": true,
  "band_6": true,
  "client_isolation": false,
  "vlan_id": null,
  "target_site_ids": ["site1", "site2"]
}
```

---

### 3. Overview — `/api/v1/overview`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/v1/overview/sites` | Lấy tất cả sites với role mapping |
| `GET` | `/api/v1/overview/sites/{site_id}` | Chi tiết 1 site từ Aruba API |

#### `GET /api/v1/overview/sites`

- **Auth:** Bearer + `X-Insight-User: email` (required)
- **Response (200):**

```json
{
  "status": "success",
  "sites": [
    {
      "siteId": "abc",
      "siteName": "HQ",
      "aruba_role_raw": "administrator",
      "internal_app_role": "admin"
    }
  ]
}
```

#### `GET /api/v1/overview/sites/{site_id}`

- **Auth:** Bearer (required)
- **Response (200):** Raw Aruba site detail JSON

---

### 4. Config — `/api/v1/config`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/v1/config/sites/{site_id}` | Toàn bộ config site (networks + guest_portal) |
| `GET` | `/api/v1/config/sites/{site_id}/ssids` | Danh sách SSID wireless |
| `GET` | `/api/v1/config/sites/{site_id}/overview` | Tóm tắt networks cho SmartSync table |

#### `GET /api/v1/config/sites/{site_id}`

- **Auth:** Bearer (required)
- **Response (200):**

```json
{
  "networks": [ { "id": "...", "networkName": "..." } ],
  "guest_portal": null
}
```

#### `GET /api/v1/config/sites/{site_id}/ssids`

- **Auth:** Bearer (required)
- **Response (200):**

```json
[
  {
    "networkId": "...",
    "networkName": "WiFi-HQ",
    "security": "wpa2-personal",
    "isGuestPortalEnabled": false
  }
]
```

#### `GET /api/v1/config/sites/{site_id}/overview`

- **Auth:** Bearer (required)
- **Response (200):**

```json
{
  "status": "success",
  "networks": [
    { "id": "...", "name": "WiFi-HQ", "type": "EMPLOYEE", "vlanId": null, "isEnabled": true, "isWireless": true }
  ]
}
```

---

### 5. Inventory — `/api/v1/inventory`

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/v1/inventory/sites/{site_id}/devices` | Danh sách thiết bị của site |

#### `GET /api/v1/inventory/sites/{site_id}/devices`

- **Auth:** Bearer (required)
- **Response (200):** Array of `DeviceResponse` objects

```json
[
  { "id": "...", "name": "AP-Floor1", "type": "AP", "status": "online" }
]
```

---

### 6. Replay — `/api/v1/replay`

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/api/v1/replay/login` | Aruba SSO Login Replay |
| `ANY` | `/api/v1/replay/{path}` | Generic proxy — forward mọi request tới Aruba API |

#### `POST /api/v1/replay/login`

- **Body (JSON):**

```json
{ "username": "user@email.com", "password": "secret", "client_id": null }
```

- **Response (200):** Raw Aruba token response

#### `ANY /api/v1/replay/{path}`

- **Mô tả:** Forward toàn bộ request (method, headers, body) tới Aruba API tương ứng.
- **Ví dụ:** `GET /api/v1/replay/api/sites` → `GET https://portal.instant-on.hpe.com/api/sites`
- **Auth:** Bearer (auto-injected từ header)

---

### 7. Admin — `/api/v1/admin`

> Tất cả endpoints admin yêu cầu `X-Insight-User` email với role `admin` và `isApproved: true` trong MongoDB.
> **Không** cần Aruba token hợp lệ (Track 1 — Internal Auth).

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/api/v1/admin/users` | Lấy danh sách tất cả users |
| `PUT` | `/api/v1/admin/users/{user_id}` | Cập nhật role và approval status |
| `GET` | `/api/v1/admin/logs` | Lấy audit logs (mới nhất trước) |

#### `GET /api/v1/admin/users`

- **Auth:** `X-Insight-User: admin@email.com` (Internal Admin check)
- **Response (200):**

```json
[
  { "id": "mongo_id", "email": "user@email.com", "role": "viewer", "isApproved": false, "created_at": "..." }
]
```

#### `PUT /api/v1/admin/users/{user_id}`

- **Auth:** Internal Admin
- **Body (JSON):**

```json
{ "role": "operator", "isApproved": true }
```

- `role` valid values: `admin`, `operator`, `viewer`, `user`, `guest`
- **Response (200):** `{ "message": "User updated successfully" }`

#### `GET /api/v1/admin/logs`

- **Auth:** Internal Admin
- **Query params:** `limit` (default 50), `skip` (default 0)
- **Response (200):** Array of log entries (GMT+7 timestamps)

```json
[
  {
    "id": "...",
    "timestamp": "2026-03-05 10:00:00 ICT",
    "actor_email": "admin@email.com",
    "method": "PUT",
    "endpoint": "/api/v1/admin/users/123",
    "payload": {},
    "ip_address": "1.2.3.4",
    "statusCode": 200,
    "action": "UPDATE_USER"
  }
]
```

---

### 8. Capture (Internal) — `/api/v1`

> Endpoints ẩn (`include_in_schema=False`) — dùng cho Chrome Extension và internal dashboard.

| Method | Path | Mô tả |
|--------|------|--------|
| `POST` | `/api/v1/capture` | Gửi 1 captured request |
| `POST` | `/api/v1/capture/batch` | Gửi nhiều captured requests |
| `POST` | `/api/v1/auth-session` | Lưu captured auth token vào DB |
| `GET` | `/api/v1/auth-session` | Lấy auth session hiện tại từ DB |
| `POST` | `/api/v1/capture-blueprint` | Lưu auth flow blueprint |
| `GET` | `/api/v1/logs` | Lấy logs với filtering |
| `GET` | `/api/v1/logs/{log_id}` | Lấy 1 log detail |
| `DELETE` | `/api/v1/logs` | Xóa toàn bộ logs |
| `GET` | `/api/v1/endpoints` | Lấy danh sách documented endpoints |
| `GET` | `/api/v1/logs/export/postman` | Export logs thành Postman Collection v2.1 |
| `GET` | `/api/v1/logs/export/json` | Export logs thành raw JSON |

#### `GET /api/v1/logs`

- **Query params:**
  - `limit` (int, default 100), `skip` (int, default 0)
  - `domain` (string), `keyword` (string)
  - `method` (string, comma-sep: `GET,POST`)
  - `status` (string, comma-sep: `200,404` hoặc digit: `2` = 2xx)
  - `from` (ISO datetime), `to` (ISO datetime)

#### `GET /api/v1/logs/export/postman`

- **Query params:** Same as GET logs + `ids` (comma-sep log IDs)
- **Response:** Postman Collection v2.1 JSON

---

## Backend → Aruba API (Upstream)

> Tất cả calls tới Aruba đều đi qua `ArubaService.call_api()` với header spoofing.

**Base URL:** `https://portal.instant-on.hpe.com`

### Aruba SSO / Auth Flow

| Step | Method | URL | Mô tả |
|------|--------|-----|--------|
| Discovery | `GET` | `https://portal.instant-on.hpe.com/settings.json` | Lấy `ssoClientIdAuthN`, `ssoClientIdAuthZ` |
| MFA Validate | `POST` | `https://sso.arubainstanton.com/aio/api/v1/mfa/validate/full` | Xác thực credentials |
| OAuth Authorize | `GET` | `https://sso.arubainstanton.com/as/authorization.oauth2` | Lấy auth code |
| Token Exchange | `POST` | `https://sso.arubainstanton.com/as/token.oauth2` | Đổi code lấy access_token |

### Aruba Sites API

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/sites` | Lấy tất cả sites của account |
| `GET` | `/api/v1/sites` | Fallback version |
| `GET` | `/api/sites/{site_id}` | Chi tiết 1 site |

### Aruba Networks API

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/sites/{site_id}/networksSummary` | Tóm tắt networks của site |
| `GET` | `/api/v1/sites/{site_id}/networksSummary` | Fallback version |
| `GET` | `/api/sites/{site_id}/guestPortalSettings` | Cấu hình Guest Portal |
| `GET` | `/api/sites/{site_id}/networks/{network_id}` | Chi tiết 1 network |
| `PUT` | `/api/sites/{site_id}/networks/{network_id}` | Cập nhật network config |
| `POST` | `/api/sites/{site_id}/networks` | Tạo network mới |
| `DELETE` | `/api/sites/{site_id}/networks/{network_id}` | Xóa network |

---

## Headers & Auth Pattern

### Request Headers (Frontend → Backend)

```http
Authorization: Bearer <aruba_access_token>
X-Insight-User: user@email.com
X-ION-API-VERSION: 22
X-ION-CLIENT-TYPE: InstantOn
X-ION-CLIENT-PLATFORM: web
```

### Request Headers (Backend → Aruba)

```http
Authorization: Bearer <aruba_access_token>
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36
Accept: application/json, text/plain, */*
Accept-Language: en-us
X-Ion-Api-Version: 23
X-Ion-Client-Type: InstantOn
X-Ion-Client-Platform: web
Origin: https://portal.instant-on.hpe.com
Referer: https://portal.instant-on.hpe.com/
Host: portal.instant-on.hpe.com
```

### Auth Track Summary

| Track | Guard | Yêu cầu | Dùng cho |
|-------|-------|----------|----------|
| Track 1 — Internal | `require_internal_admin` | `X-Insight-User` email, role=admin, isApproved=True trong MongoDB | Admin routes (users, logs) |
| Track 2 — Aruba | `get_stateless_user` / manual Bearer check | Aruba Bearer token hợp lệ | Cloner, Backup, Rollback, SSID mgmt |

### Refresh Token Pattern

```text
Login → Aruba access_token + Fernet({"u": username, "p": password}) = refresh_token
↓
401 detected → POST /api/v1/auth/refresh { refresh_token }
↓
Backend: decrypt → replay Aruba login → new access_token + new refresh_token
```

---

## Error Codes

| Code | Tình huống |
|------|-----------|
| `401` | Token hết hạn, thiếu token, credentials sai, email không trong whitelist |
| `403` | Không đủ quyền (role check) |
| `400` | Body/params không hợp lệ, site IDs rỗng |
| `404` | Resource không tìm thấy (site, network, log) |
| `500` | Lỗi server / Aruba API không phản hồi |

---

## Roles (internalWebRole)

> Role này chỉ kiểm soát dashboard INSIGHT, **không liên quan** đến Aruba cloud role.

| Role | Quyền |
|------|-------|
| `admin` | Toàn bộ tính năng, quản lý users, xem logs |
| `operator` | Backup, clone, SSID management (canWrite) |
| `viewer` | Xem cấu hình, backup history, diff (read-only) |
| `user` | Xem backup history và diff |
| `guest` | Tối thiểu |

---

*Generated: 2026-03-05 | Version: 2.0*
