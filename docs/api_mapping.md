# Insight API Mapping — Internal Proxy → Aruba Native

This file maps every **internal Insight endpoint** to its corresponding **Aruba Native API** target.
Use this as the authoritative reference when adding new frontend calls or backend routes.

---

## Format

| Field | Description |
|---|---|
| **Internal Endpoint** | The URL frontend calls (relative to `/api/v1`) |
| **Aruba Target** | The actual Aruba HPE endpoint being proxied |
| **Auth** | Headers required |
| **Key Response Fields** | Fields used by the UI |

---

## Overview Module

### GET `/api/v1/overview/sites`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/sites` (fallback: `/api/v1/sites`)
- **Auth:** `Authorization: Bearer <token>`, `X-Insight-User: <email>`
- **Response:** Array of site objects enriched with internal role mapping
- **Key Fields Used:**

  ```json
  {
    "siteId": "uuid",
    "siteName": "AITC",
    "role": "admin",
    "status": "up",
    "healthScore": {},
    "activeAlertsCounters": {}
  }
  ```

- **Backend:** `app/features/overview/routes.py` → `overview_service.get_live_sites()`
- **Frontend:** `SiteContext.jsx` → `apiClient.get('/overview/sites')`

---

### GET `/api/v1/overview/sites/{site_id}` ✅ *Added 2026-03-04*

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/sites/{site_id}`
- **Auth:** `Authorization: Bearer <token>`
- **Response:** Single site object — basic header info only
- **Confirmed Response Shape:**

  ```json
  {
    "id": "f13f86d8-6641-49a6-8120-4cccaa77cbbb",
    "name": "AITC",
    "health": "warning",
    "status": "up",
    "activeAlertsCount": 1
  }
  ```

- **Backend:** `app/features/overview/routes.py` → `aruba_service.call_api()`
- **Frontend:** `SiteDetail.jsx` → header name + health badge; `GlobalDashboard.jsx` (via SiteContext) → Online/Offline badge

---

## Dashboard Module (via Replay Proxy)

All routes below use the **generic replay proxy** at `GET /api/v1/replay/{path}` which forwards
directly to Aruba with spoofed headers. No backend service layer.

### GET `/api/v1/replay/api/v1/sites/{site_id}/dashboard`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/v1/sites/{site_id}/dashboard`
- **Auth:** `Authorization: Bearer <token>` (forwarded transparently)
- **Response:** Full aggregated site dashboard data
- **Confirmed Response Shape:**

  ```json
  {
    "healthOverview": {
      "currentScore": { "score": 85 }
    },
    "alertsOverview": {
      "activeMajorAlertsCount": 0,
      "activeMinorAlertsCount": 1,
      "activeInfoAlertsCount": 2
    },
    "clientsOverview": {
      "totalClient": { "total": 42 }
    },
    "networksOverview": {
      "wirelessNetworks": 3,
      "wiredNetworks": 1,
      "vpnNetworks": 0
    },
    "devicesOverview": {
      "accessPoints":  { "online": 5, "total": 5 },
      "switches":      { "online": 2, "total": 2 },
      "stacks":        { "online": 0, "total": 0 },
      "wifiRouters":   { "online": 0, "total": 0 },
      "gateways":      { "online": 0, "total": 0 }
    },
    "applicationsOverview": {
      "applicationsTotal": {
        "upstreamDataTransferredInBytes": 123456,
        "downstreamDataTransferredInBytes": 789012,
        "transferredDataByCategory": [
          {
            "applicationCategory": "video_streaming",
            "upstreamDataTransferredInBytes": 10000,
            "downstreamDataTransferredInBytes": 50000
          }
        ]
      }
    }
  }
  ```

- **Frontend:** `SiteDetail.jsx` (metric cards via `data` state + `Promise.all`), `ApplicationSummaryCard.jsx` (pie chart via `applicationsOverview`), `Applications/index.jsx`

---

### GET `/api/v1/replay/api/v1/sites/{site_id}/health`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/v1/sites/{site_id}/health`
- **Frontend:** `Dashboard/Health.jsx`

---

### GET `/api/v1/replay/api/v1/sites/{site_id}/alerts`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/v1/sites/{site_id}/alerts`
- **Frontend:** `Dashboard/Alerts/index.jsx`

---

### GET `/api/v1/replay/api/v1/sites/{site_id}/inventory`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/v1/sites/{site_id}/inventory`
- **Frontend:** `Dashboard/Devices/index.jsx`

---

### GET `/api/v1/replay/api/v1/sites/{site_id}/wiredNetworks`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/v1/sites/{site_id}/wiredNetworks`
- **Frontend:** `Dashboard/Networks/index.jsx`

---

## Network Config Module

### GET `/api/v1/config/sites/{site_id}/overview`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary`
- **Auth:** `Authorization: Bearer <token>`
- **Backend:** `app/features/config/routes.py` → `config_service.get_site_overview()`
- **Frontend:** Configuration / SmartSync panel

---

## Cloner Module

### GET `/api/v1/cloner/site-overview/{site_id}`

- **Aruba Target:** `GET https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary`
- **Auth:** `Authorization: Bearer <token>`
- **Response:** Structured network list `{ status, networks: [{id, name, type, isWireless, vlanId}] }`
- **Backend:** `app/features/cloner/routes.py` → `cloner_service.fetch_site_config_live()`

---

## Auth Module

| Internal Endpoint | Aruba Target | Notes |
|---|---|---|
| `POST /api/v1/auth/login` | `POST https://sso.arubainstanton.com/aio/api/v1/mfa/validate/full` + OAuth2 PKCE | Full auth flow replay |
| `POST /api/v1/auth/refresh` | Replays login with Fernet-decrypted credentials | Returns new access_token |
| `POST /api/v1/auth/logout` | Clears sessionStorage only (stateless) | No Aruba call |

---

*Last updated: 2026-03-04 — maintained by Insight dev team*
