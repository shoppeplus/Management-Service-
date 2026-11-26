# TikTokService — Hỗ trợ nhiều TikTok Shop

## Phạm vi

Tài liệu mô tả registry nhiều shop trong `src/services/tiktokService.js`. Đây là tích hợp server-side thử nghiệm theo credential cấu hình môi trường; chưa phải luồng kết nối OAuth hoàn chỉnh hoặc quản lý tài khoản qua UI.

## Cấu hình

Thêm `TIKTOK_ACCOUNTS` vào `.env` dưới dạng JSON array. Mỗi record hỗ trợ:

| Trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `shopId` | Có | Shop ID ổn định để định tuyến webhook/API. |
| `name` | Không | Tên hiển thị; nếu thiếu tạo nhãn từ shop ID. |
| `appKey` | Tùy credential | App key của ứng dụng TikTok. |
| `appSecret` | Tùy credential | Dùng ký request, chỉ ở backend. |
| `accessToken` | Không | Token của shop, chỉ ở backend. |

Ví dụ placeholder; không điền credential thật trong tài liệu hoặc commit:

```json
[
  {
    "shopId": "shop-id-01",
    "name": "TikTok Shop 01",
    "appKey": "replace-me",
    "appSecret": "replace-me",
    "accessToken": "replace-me"
  },
  {
    "shopId": "shop-id-02",
    "name": "TikTok Shop 02",
    "appKey": "replace-me",
    "appSecret": "replace-me",
    "accessToken": "replace-me"
  }
]
```

Đặt JSON string đúng cách cho shell/hosting platform; tránh ghi credential vào log. `.env.example` chỉ là hướng dẫn định dạng, không phải nơi lưu bí mật.

## API nội bộ của service

- `resolveAccount(shopId)`: tìm record theo ID; trả `null` nếu không có.
- `getAccounts()`: trả `shopId`, `name`, `connected`; không trả secret hay access token.
- `processWebhook(body)`: đọc shop ID từ `shop_id`/`shopId` ở root hoặc `data`, sau đó định tuyến event.
- `getOrderDetail(orderId, accessToken, shopId)`, `getOrders(queryParams, accessToken, shopId)`, `acknowledgeOrder(orderId, accessToken, shopId)`: nhận shop ID tùy chọn để ký bằng credential riêng. Tương thích lời gọi cũ dùng access token tham số.

## Webhook và định danh shop

- `ORDER_STATUS_CHANGE` và `PACKAGE_UPDATE` nhận account đã resolve.
- Nếu payload nêu shop ID nhưng ID đó không có trong registry, service ghi cảnh báo và bỏ qua event.
- Nếu webhook không có shop ID, hiện xử lý theo đường tương thích cũ với account `null`. Muốn đảm bảo shop isolation tuyệt đối, webhook adapter cần xác thực/chuyển tiếp shop identity theo contract TikTok trước khi bỏ chế độ tương thích này.
- Event đã xử lý ghi `metadata.tiktokShopId` và `metadata.tiktokShopName` khi có shop tương ứng.

## Bảo mật

- Không trả token/secret qua `getAccounts()`.
- Không đưa credential vào frontend, log, commit hoặc docs.
- `.env.example` chỉ dùng placeholder.
- Registry ENV không thay thế encryption/rotation/secret manager phù hợp production.
- Registry hiện chưa kiểm tra quyền user; không dùng `getAccounts()` làm API cho user nếu chưa có endpoint được bảo vệ bởi Access Control.

## Giới hạn và phối hợp Access Control

- Không có OAuth authorization/callback, refresh token, revoke hoặc lưu credential bền vững.
- Không có API quản trị để thêm/xóa/kết nối shop từ giao diện.
- Chưa có user-to-shop assignment hoặc filtering hội thoại theo account.
- Admin cấp tài khoản và phân quyền account thuộc PIC Access Control; không tạo cơ chế phân quyền song song trong service này.
- TikTok API thực tế có thể yêu cầu các signature parameters hoặc webhook validation khác; xác minh theo tài liệu/version được cấp trước khi triển khai production.

## Tệp liên quan

- `src/services/tiktokService.js`: cấu hình registry, signature, webhook và API calls.
- `src/routes/webhookRoutes.js`: endpoint nhận webhook `/api/webhooks/tiktok`.
- `.env.example`: ví dụ cấu hình.
- `test/tiktokAccounts.test.js`: unit tests cho account registry.

## Kiểm tra

```bash
npm test
```

Kiểm thử production bổ sung cần xác minh OAuth, webhook signature, shop ID, token expiry và không log secret; không gửi request live nếu chưa có credential/approval.
