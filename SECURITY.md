# Báo cáo vấn đề bảo mật

Các adapter Demo hiện sử dụng dữ liệu tổng hợp và lưu trên trình duyệt. Đây không phải môi trường có xác thực, phân quyền hay cách ly doanh nghiệp; không dùng để xử lý dữ liệu thật.

Không mở issue công khai chứa credentials, dữ liệu cá nhân hoặc hướng dẫn khai thác chi tiết. Khi repository được đưa lên nền tảng mã nguồn mở, hãy bật kênh báo cáo bảo mật riêng của nền tảng và gửi báo cáo qua kênh đó. Repository hiện chưa cấu hình địa chỉ email bảo mật riêng.

Báo cáo nên nêu phiên bản, module, điều kiện tái hiện, tác động và cách khắc phục đề xuất. Chỉ chia sẻ dữ liệu tổng hợp đã loại bỏ bí mật.

Trước khi bật Live Mode cho người dùng thật, backend phải triển khai xác thực, RBAC, cách ly tenant, kiểm tra đầu vào, chống CSRF, audit log và lưu tệp an toàn. Không đặt bí mật trong `VITE_*` vì các biến này nằm trong mã phía trình duyệt.
