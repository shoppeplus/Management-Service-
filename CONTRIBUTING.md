# Đóng góp cho SmartSales Suite

SmartSales được tổ chức thành các module để thay đổi từng phần mà không phá vỡ luồng vận hành chung. Mã nguồn dự án dùng giấy phép MIT; các dependency giữ giấy phép riêng.

## Bắt đầu

1. Dùng Node.js 22 LTS (`.nvmrc`), chạy `npm ci` và `npm run dev`.
2. Dùng dữ liệu Demo tổng hợp. Không đưa thông tin khách hàng thật, khóa Firebase Admin hoặc credentials vào repository.
3. Tạo nhánh cho một thay đổi nhỏ, ví dụ `feat/care-ticket-assignment`.

## Quy tắc thay đổi

- Đặt giao diện trong `src/modules/<module>/`; dùng chung các kiểu tại `modules/operations/types.ts` và `types/inbox.ts`.
- Quy tắc trạng thái, tính tiền và tồn kho thuộc lớp nghiệp vụ/service. Component chỉ gửi lệnh và hiển thị kết quả.
- Hồ sơ liên hệ chỉ có một nguồn dữ liệu tại Inbox service. CRM lưu phần mở rộng theo `customerId`.
- Giữ adapter Demo và API riêng. Tích hợp chưa có credentials phải hiển thị là mô phỏng.
- Mọi nhãn giao diện mới cần Tiếng Việt và English qua `useI18n()`; không dịch tự động nội dung người dùng.
- Khi thay schema lưu trữ, tăng phiên bản và viết migration có kiểm thử. Không âm thầm xóa dữ liệu cũ để che lỗi.
- Giữ API hiện có tương thích hoặc ghi rõ breaking change và hướng dẫn nâng cấp.

## Kiểm tra trước pull request

```sh
npm run format:check
npm run lint
npm test
npm run build
```

Viết test cho hành vi và bất biến nghiệp vụ: giữ/trả tồn kho, thanh toán, liên kết thực thể, trạng thái vận chuyển, SLA và lỗi lưu trữ. Với thay đổi giao diện, kiểm tra 1440px và mobile bằng bàn phím; đính kèm ảnh chụp nếu có thể.

Pull request cần mô tả vấn đề, hành vi sau thay đổi, cách kiểm thử, issue liên quan và thay đổi API/schema. Dùng Conventional Commits, ví dụ `fix(orders): prevent duplicate stock release`.

Xem [kiến trúc](docs/architecture.md), [API vận hành](docs/operations-api.md) và [báo cáo lỗi bảo mật](SECURITY.md).
