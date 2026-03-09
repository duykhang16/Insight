# Nhật ký Update: Live Config Service (Phase 4)

**Thời gian:** 2026-03-02 17:30:00 ICT (GMT+7)

**Mục tiêu:**
Tạo `features/config/service.py` phục vụ cấu hình site trực tiếp từ Aruba API.
- Đảm bảo 100% JSON keys khớp với UI labels (SmartSync, FullClone).
- 401/403 từ Aruba → raise HTTPException(401).
- TUYỆT ĐỐI không lưu config vào database.

**Mapping UI ↔ Backend:**
| UI Field (SmartSync/FullClone) | Backend Key | Nguồn (Aruba API) |
|---|---|---|
| `net.id` | `networkId` | networksSummary |
| `net.name` | `networkName` | networksSummary |
| `net.type` | `type` | networksSummary |
| `net.vlanId` | `vlanId` | networksSummary |
| `net.isEnabled` | `isEnabled` | networksSummary |
| `net.isWireless` | `isWireless` | networksSummary |
| SSID `networkName` | `networkName` | networksSummary (wireless only) |
| SSID `security` | `security` | networksSummary |
| SSID `isGuestPortalEnabled` | `isGuestPortalEnabled` | networksSummary |
| `guest_portal` | raw JSON | guestPortalSettings |

**Các file sẽ tác động:**
- `sources/insight/backend/app/features/config/__init__.py` — mới
- `sources/insight/backend/app/features/config/service.py` — mới
- `sources/insight/backend/app/features/config/routes.py` — mới
- `sources/insight/backend/app/main.py` — đăng ký router

**Trạng thái:** Hoàn thành (Completed)
