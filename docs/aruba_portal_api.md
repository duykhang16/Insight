# Tài liệu Kỹ thuật Aruba Instant On Portal API (Cloner Tool)

Tài liệu này cung cấp chi tiết về các endpoint của Aruba Portal được sử dụng trong công cụ Site Cloner. Dành cho lập trình viên muốn tái sử dụng hoặc mở rộng tích hợp.

## Thông tin Chung
- **Base URL**: `https://portal.instant-on.hpe.com/api`
- **Authentication**: Bearer Token (JWT) trong header `Authorization`.
- **Headers bắt buộc cho mọi request**:
  - `X-ION-API-VERSION`: `22`
  - `X-ION-CLIENT-TYPE`: `InstantOn`
  - `X-ION-CLIENT-PLATFORM`: `web`
  - `Content-Type`: `application/json`

---

## 1. Lấy Danh sách các Site (Site Discovery)
Lấy tất cả các site mà tài khoản đang quản lý.

- **Endpoint**: `GET /sites`
- **Mô tả**: Trả về danh sách các đối tượng site (Site ID, Site Name).
- **Phản hồi (Response)**:
  ```json
  [
    {
      "siteId": "uuid-string",
      "siteName": "Tên Site",
      "role": "OWNER/ADMIN",
      ...
    }
  ]
  ```

---

## 2. Lấy Cấu hình Mạng (Get Networks Summary)
Lấy thông tin chi tiết của toàn bộ mạng Wired và Wireless trong một Site.

- **Endpoint**: `GET /sites/{site_id}/networksSummary`
- **Mô tả**: Đây là API quan trọng nhất để lấy "bản gốc" cấu hình để clone.
- **Tham số**: `{site_id}` - ID của site cần truy vấn.

---

## 3. Quy trình Clone 2 Bước (Two-Pass Logic)

Do Aruba Portal áp dụng các ràng buộc chặt chẽ khi tạo mới, chúng ta phải tách làm 2 giai đoạn:

### Bước 1: Khởi tạo mạng (Phase 1: POST)
Tạo bản ghi mạng "sạch" trên Site đích.

- **Endpoint**: `POST /sites/{site_id}/networksSummary`
- **Request Body (Yêu cầu tối thiểu)**:
  - `networkName`: Tên mạng (String).
  - `type`: `employee` hoặc `guest`.
  - `isWireless`: `true/false`.
  - `authentication`: `psk`, `open`,...
  - `security`: `wpa2`, `wpa3`,...
  - `preSharedKey`: Mật khẩu (nếu có).
  - `vlanId`: ID mạng nội bộ.
- **Lưu ý quan trọng**: 
  - Đặt `accessPoints: []` (Mảng rỗng) để tránh lỗi không tìm thấy thiết bị ở Site mới.
  - Loại bỏ các trường ID của Site cũ (`siteId`, `networkId`).

### Bước 2: Cập nhật cấu hình nâng cao (Phase 2: PUT)
Áp dụng toàn bộ tính năng chi tiết sau khi mạng đã có ID tại Site đích.

- **Endpoint**: `PUT /sites/{site_id}/networksSummary/{network_id}`
- **Tham số**: `{network_id}` là ID mới vừa nhận được từ Bước 1.
- **Các trường nâng cao (Advanced Fields)**:
  - `schedule`: Lịch hoạt động (`activeDays`, `activeTimeRange`).
  - `bandwidthLimitMode`: Giới hạn băng thông (perClient/perNetwork).
  - `isBandwidthLimitEnabled`: `true/false`.
  - `applicationCategoryEffectivePolicies`: Chính sách chặn ứng dụng.
  - `isAccessRestricted`: Chặn truy cập mạng nội bộ.

---

## 4. Các trường dữ liệu cần xử lý (Data Sanitization)
Khi thực hiện Clone, lập trình viên **PHẢI** làm sạch dữ liệu từ Site cũ trước khi gửi đi:

| Trường (Field) | Hành động | Lý do |
| :--- | :--- | :--- |
| `networkId` | Xóa bỏ | Portal sẽ tự cấp ID mới cho Site đích. |
| `siteId` | Xóa bỏ | Phải dùng ID của Site đích. |
| `accessPoints` | Đặt là `[]` | Tránh lỗi 400 vì Site mới chưa gán thiết bị này. |
| `wiredNetworkId`| Đặt là `null` | Thuộc về cấu hình mạng dây cứng của Site cũ. |
| `schedule.state`| Xóa bỏ | Đây là trạng thái runtime (on/off hiện tại), không phải cấu hình tĩnh. |

---

> [!TIP]
> **Mẹo Debug**: Luôn theo dõi tab **Network** trong Browser Console. Aruba Portal trả về mã lỗi 400 kèm `message` rất chi tiết nếu JSON gửi lên thiếu trường hoặc sai kiểu dữ liệu.
