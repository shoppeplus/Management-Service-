# SmartSales

**Nền tảng quản lý và vận hành bán hàng đa kênh** — xây dựng với React, TypeScript và Node.js, hỗ trợ giao diện tiếng Việt và tiếng Anh.

> Dự án hiện có chế độ Demo chạy độc lập và backend Live dùng Node.js/SQLite. Một số tích hợp kênh bán hàng và chức năng nâng cao vẫn đang được phát triển.

## Tính năng

- **Vận hành bán hàng:** tổng quan, khách hàng, hộp thư, chăm sóc, đơn hàng và vận chuyển.
- **Quản trị:** báo cáo, tài khoản nhân viên và phân quyền.
- **Kho & báo giá:** quản lý SKU, nhập/xuất/chuyển/kiểm kê và xuất báo giá PDF.
- **Phân tích thị trường:** Gemini tự tìm kiếm web và trả về bản phân tích tóm tắt.
- **Tích hợp:** cấu hình Gemini, Telegram, Shopee, Lazada và TikTok Shop trong phần Cài đặt.

Xem [lộ trình và các giới hạn hiện tại](docs/IMPLEMENTATION_ROADMAP.md) trước khi dùng dữ liệu thật.

## Công nghệ

| Thành phần          | Công nghệ               |
| ------------------- | ----------------------- |
| Giao diện           | React, TypeScript, Vite |
| API                 | Node.js                 |
| Cơ sở dữ liệu local | SQLite                  |
| Kiểm thử            | Vitest, Testing Library |

## Yêu cầu

- Node.js **22.12 trở lên**
- npm

## Bắt đầu nhanh — Demo

```powershell
git clone <repository-url>
cd <project-folder>
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Trong `.env`, đặt:

```env
VITE_APP_MODE=demo
```

Chạy ứng dụng:

```powershell
npm run dev
```

Mở [http://127.0.0.1:5173](http://127.0.0.1:5173). Demo lưu dữ liệu trong trình duyệt; không dùng dữ liệu khách hàng thật.

## Chạy backend Live

Đặt `VITE_APP_MODE=live` trong `.env`, sau đó mở hai terminal:

```powershell
# Terminal 1 — API
npm run server:inventory
```

```powershell
# Terminal 2 — giao diện
npm run dev
```

Tạo tài khoản tại `/register` rồi đăng nhập bằng owner/admin. API mặc định chạy tại `http://127.0.0.1:3001`; Vite chuyển tiếp các yêu cầu `/api/v1` trong môi trường phát triển.

### Cấu hình AI và kết nối

Trong **Cài đặt**, nhập và kiểm tra API key Gemini hoặc bot token Telegram. Để lưu credentials mã hóa phía máy chủ, tạo `INTEGRATION_ENCRYPTION_KEY` một lần:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Giữ khóa này bí mật và ổn định; nếu thay đổi, máy chủ không thể giải mã credentials đã lưu. Có thể cấu hình Gemini và Telegram bằng biến môi trường phía máy chủ tương ứng.

Shopee, Lazada và TikTok Shop hiện hỗ trợ nhập credentials, kiểm tra API seller chỉ đọc, lưu và ngắt kết nối. Luồng OAuth/callback, tự làm mới token và đồng bộ đơn hàng/sản phẩm chưa được triển khai.

## Triển khai

Vercel được cấu hình sẵn để triển khai **giao diện Demo**: `vercel.json` chạy `npm run build:vercel` (typecheck và build với mode Demo), xuất bản thư mục `dist` và hỗ trợ các đường dẫn SPA. Không cần thêm biến môi trường để chạy Demo.

Chế độ Live cần API được triển khai riêng trên máy chủ có lưu trữ dữ liệu bền vững. Backend hiện dùng SQLite trên hệ thống tệp local; không triển khai API này như function tạm thời trên Vercel. Nếu cấu hình giao diện Live, đặt các URL API production phù hợp trong Environment Variables của Vercel và bảo đảm chúng dùng HTTPS.

## Lệnh thường dùng

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Bảo mật và giới hạn

- Không commit `.env`, API keys, access tokens hoặc dữ liệu khách hàng.
- Không đưa secrets vào biến `VITE_*`; các biến này được đóng gói vào trình duyệt.
- Hộp thư không tự đồng bộ theo chu kỳ; đồng bộ khi người dùng chủ động thao tác.
- Demo và một số kênh/tính năng còn mô phỏng hoặc chưa hoàn thiện; xem [lộ trình triển khai](docs/IMPLEMENTATION_ROADMAP.md).

## Tài liệu

[API](docs/api-contract.md) · [Kiến trúc](docs/architecture.md) · [API kho](docs/inventory-api.md) · [Kịch bản Demo](docs/demo-walkthrough.md)

Test git log lần 2