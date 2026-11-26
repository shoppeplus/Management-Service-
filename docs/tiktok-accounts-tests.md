# TikTok Accounts — Hướng dẫn kiểm thử

## Mục đích

`test/tiktokAccounts.test.js` kiểm tra hành vi nền tảng của registry TikTok multi-shop mà không gọi TikTok API hoặc dùng thông tin bí mật thật.

## Test cases

1. Resolve được hai tài khoản độc lập theo `shopId`; ID không tồn tại trả `null`.
2. Danh sách tài khoản chỉ gồm ID, tên và cờ kết nối; access token không xuất hiện trong JSON.
3. Webhook có shop ID chưa đăng ký không được xử lý và trả danh sách kết quả rỗng.
4. Signature HMAC tạo được với app secret của shop được chọn.

## Chạy

```bash
npm test
```

Script dùng Node built-in test runner: `node --test test/*.test.js`. Không cần cấu hình TikTok credentials; Firebase có thể in cảnh báo demo mode lúc import service nhưng không tham gia test.

## Phạm vi chưa được test

- TikTok OAuth/callback/refresh token.
- Xác thực chữ ký webhook từ TikTok.
- Gọi network thật tới TikTok.
- Lưu credential an toàn, phân quyền hoặc cấp shop cho employee.
- Xử lý đồng thời và retry event production.

Không xem các test unit này là bằng chứng tích hợp TikTok production đã hoạt động.
