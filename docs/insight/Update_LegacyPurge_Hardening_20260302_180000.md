# Nhật ký Update: Legacy Purge & Final Hardening (Phase 5)

**Thời gian:** 2026-03-02 18:00:00 ICT (GMT+7)

**Mục tiêu:**
Xóa toàn bộ logic phiên DB lỗi thời, loại bỏ các route đã migrate sang features,
và đảm bảo khóa Fernet hoàn toàn do môi trường điều khiển.
Không có DB growth ngoại trừ `users` và `audit_logs`.

**Nguyên tắc bất biến:**
- TUYỆT ĐỐI KHÔNG lưu token, password, session vào DB
- Chỉ `users` + `audit_logs` được phép ghi vào DB insight
- Fernet key phải đến từ biến môi trường `INTERNAL_APP_AUTH`

**Các file sẽ tác động:**
| File | Thay đổi |
|---|---|
| `app/core/auth_deps.py` | Xóa block DEPRECATED `get_current_user` / `RoleChecker` |
| `app/core/cloner/routes.py` | Xóa `/logout` DB call; xóa `/sites` (captured) endpoint |
| `app/core/replay_service.py` | Xóa import `upsert_auth_session`; xóa PHASE 0.1 DB lookup |
| `app/services/aruba.py` | Xóa dead import `get_all_auth_sessions`, `delete_all_auth_sessions` |
| `app/core/logging_middleware.py` | Xóa fallback DB lookup `auth_sessions`; header-only |
| `app/core/fernet.py` | Tạo mới — module tập trung cho Fernet helpers |
| `app/features/auth/routes.py` | Import từ `fernet.py` thay vì inline helpers |
| `app/config.py` | Thêm warning khi `INTERNAL_APP_AUTH` là giá trị mặc định |

**Trạng thái:** Hoàn thành (Completed)
