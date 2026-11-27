# SmartSales Suite

Nền tảng quản lý và vận hành bán hàng đa kênh, xây dựng bằng React, TypeScript và Node.js. Giao diện hỗ trợ tiếng Việt và tiếng Anh.

## Yêu cầu

- Node.js 22.12 trở lên
- npm

## Cài đặt và chạy Demo

Mở PowerShell và chạy:

```powershell
git clone https://github.com/shoppeplus/Management-Service-.git
cd Management-Service-
npm ci
Copy-Item .env.example .env
npm run dev
```

Mở địa chỉ được Vite hiển thị (mặc định là [http://127.0.0.1:5173](http://127.0.0.1:5173)). File `.env.example` đặt `VITE_APP_MODE=demo`, vì vậy có thể chạy Demo ngay mà không cần API key. Demo dùng dữ liệu mẫu trong trình duyệt; không nhập dữ liệu khách hàng thật.

## Chạy backend

Backend dùng SQLite local. Mở `.env` và đổi `VITE_APP_MODE=demo` thành `VITE_APP_MODE=live`, sau đó mở hai cửa sổ PowerShell tại thư mục dự án:

```powershell
# Cửa sổ 1 — backend API tại http://127.0.0.1:3002
npm run server:inventory
```

```powershell
# Cửa sổ 2 — giao diện tại http://127.0.0.1:5173
npm run dev
```

Vite proxy các yêu cầu `/api/v1` tới backend local. Tạo tài khoản tại `/register` để bắt đầu. Dữ liệu backend mặc định nằm trong `var/inventory.sqlite`; thư mục này chỉ dành cho dữ liệu local và không được đưa lên Git.

### Cấu hình tích hợp

Các API key và token chỉ dành cho backend, được đặt trong `.env` (không dùng tiền tố `VITE_`). Để lưu credentials tích hợp đã mã hóa, tạo `INTEGRATION_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Giữ khóa này bí mật và ổn định; nếu thay đổi, backend không thể giải mã credentials đã lưu. Các kết nối Gemini, Telegram và marketplace cần cấu hình riêng theo `.env.example`. Một số tích hợp vẫn đang phát triển; không xem dữ liệu Demo hoặc chức năng mô phỏng là kết nối live.

## Lệnh thường dùng

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Cấu trúc dự án

- `src/` — ứng dụng React, giao diện, module nghiệp vụ và kiểm thử.
- `server/` — API Node.js, dịch vụ và các migration SQLite.
- `public/` — hình ảnh, biểu tượng và font chữ tĩnh.
- `var/` — dữ liệu SQLite local được tạo khi chạy backend; không commit.

Xem thêm [hướng dẫn đóng góp](CONTRIBUTING.md) và [chính sách bảo mật](SECURITY.md).

## Bảo mật

- Không commit `.env`, API key, access token hoặc dữ liệu khách hàng.
- Không đưa secrets vào biến `VITE_*`; chúng được đóng gói vào trình duyệt.
- Demo lưu dữ liệu trong trình duyệt và không phù hợp với hồ sơ khách hàng thật.
