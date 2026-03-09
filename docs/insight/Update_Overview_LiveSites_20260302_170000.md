# Nhật ký Update: Overview — Live Sites (Phase 3)

**Thời gian:** 2026-03-02 17:00:00 ICT (GMT+7)

**Mục tiêu:**
Hoàn thiện `overview_service.get_live_sites()` theo kiến trúc Stateless:
- Dữ liệu site lấy trực tiếp từ Aruba API (Live-Only, không cache DB).
- Map role Aruba → shorthand theo thời gian thực.
- Raise `HTTPException(401)` khi token hết hạn để frontend interceptor kích hoạt refresh.
- Tách biệt `insight_app_role` (Track 1, DB) khỏi `aruba_role` (Track 2, Live).

**Các file sẽ tác động:**
- `sources/insight/backend/app/features/overview/service.py` — rewrite

**Trạng thái:** Hoàn thành (Completed)
