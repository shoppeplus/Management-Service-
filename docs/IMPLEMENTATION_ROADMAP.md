# Lộ trình triển khai và trạng thái

Cập nhật ngày 18/11/2026. Giữ đủ đăng nhập, sản phẩm, phân tích thị trường và báo cáo. Đợt này tập trung hoàn thiện **kho → báo giá → PDF**, kiểm tra đăng nhập và ghi đúng hiện trạng; không coi trang kế hoạch là phân hệ đã chạy.

## Thứ tự triển khai

**1. Kho → nghiệm thu → 2. Phân tích thị trường → 3. Sản phẩm → 4. Báo cáo → 5. Tích hợp toàn hệ thống.** Đăng nhập là nền tảng dùng cho kho ngay trong giai đoạn 1. Phân tích thị trường đã bắt đầu ở mức MVP theo yêu cầu; việc này chưa đồng nghĩa Giai đoạn 1 đã nghiệm thu hoặc Giai đoạn 2 đã hoàn tất.

| Phần                    | Đã chạy / đã có                                                                                                                                                                               | Còn thiếu / điều kiện chuyển tiếp                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Đăng nhập               | `/login` và `/register`; email/mật khẩu, cookie HttpOnly 8 giờ, tự đổi mật khẩu, quản lý nhân viên, đặt lại mật khẩu, lịch sử đăng nhập, quyền theo vai trò và quyền tùy chỉnh theo nhân viên | Chưa chuẩn hóa roles/permissions, phân quyền theo từng kho, SSO hoặc mời nhân viên qua email                                               |
| 1. Kho                  | Node/SQLite, migrations 001–009, role presets, quyền thao tác tùy chỉnh được kiểm tra ở API, kho/vị trí, SKU, chứng từ, giữ hàng, kiểm kê, serial/bảo hành, dashboard, PO và đơn bán          | Chờ nghiệm thu; còn chuẩn hóa RBAC, quyền theo từng kho, nghiệp vụ kho nâng cao, production và kiểm tra giao diện; xem INVENTORY_MODULE.md |
| Kho → báo giá → PDF     | Lấy SKU đang hoạt động của doanh nghiệp từ API; lọc kho, dùng tồn khả dụng, giá và thông tin sản phẩm; chọn hàng → thông tin bên bán/khách → xem lại → tải PDF tiếng Việt                     | PDF tạo cục bộ; chưa lưu lịch sử báo giá trên server, chưa phê duyệt/gửi khách hoặc chuyển báo giá thành đơn                               |
| 2. Phân tích thị trường | MVP `/market-intelligence`: Gemini Google Search grounding, câu hỏi theo ngành/khu vực, phân tích tóm tắt, lịch sử SQLite theo tenant; cần khóa máy chủ | Chưa nghiệm thu provider thật; chưa có usage/quota, cấu hình provider theo tenant, worker/lịch, hủy/retry quản trị hoặc xác minh chéo nguồn |
| 3. Sản phẩm             | Danh mục `/products` dùng SKU kho, có tìm kiếm, lọc, tồn khả dụng và thêm/sửa thông tin hàng hóa, giá                                                                                         | Chưa có mô hình thuộc tính động theo ngành, variants, migration catalog hoặc danh mục Lumi xác minh. Triển khai sau Market                 |
| 4. Báo cáo              | Chỉ số kho và Dashboard hiện hữu; trang `/reports` ghi rõ phần dùng được                                                                                                                      | Chưa có report builder, read models liên phân hệ, lưu mẫu hoặc xuất báo cáo có quyền/giới hạn. Triển khai sau Product                      |
| 5. Tích hợp             | `/orders` và tạo nhanh từ Inbox dùng SKU/giá từ inventory API, có giữ/xuất/nhận trả theo transaction                                                                                          | Chưa tích hợp dữ liệu thanh toán/vận đơn của Orders Demo, Product → báo cáo, Market → báo cáo; chưa nghiệm thu toàn hệ thống               |

Các route kế hoạch và kho hoạt động độc lập với adapter Inbox/Operations cũ. Vì vậy backend Inbox chưa có không được chặn người dùng đọc tiến độ hoặc vào kho.

## Luồng hiện tại để kiểm tra

1. Chạy API theo [inventory-api.md](inventory-api.md), mở `/inventory` hoặc `/products`. Nếu chưa có phiên, ứng dụng chuyển tới `/login`; đăng ký chủ doanh nghiệp ở `/register`, sau đó vào `/admin/team` để tạo tài khoản và cấp vai trò cho nhân viên. Trang Quản trị dành riêng cho owner/admin, tách các trang tổng quan, bán hàng, chăm sóc và công việc khỏi màn hình thao tác tuyến đầu; menu nhân viên được lọc theo quyền server cấp.
2. Trong kho, tạo kho/vị trí và SKU; bổ sung giá bán, ảnh, mô tả, thông số và bảo hành nếu có. Nhập và ghi sổ chứng từ để có tồn thực tế. Giá bỏ trống khác giá 0 đồng được nhập có chủ đích.
3. Chọn **Tạo báo giá PDF**, chọn kho và các SKU cần báo giá. Dữ liệu lấy từ catalog API có tenant scope; không thay bằng sáu sản phẩm Demo khi API lỗi.
4. Nhập bên bán, khách hàng, ngày hiệu lực và điều khoản; kiểm tra tiền hàng, giảm giá/phí giao hàng rồi tải PDF. Có thể báo giá vượt tồn; báo giá không giữ kho hoặc tạo đơn.
5. Kiểm tra PDF trước khi tự chia sẻ. Ảnh không tải được phải được báo rõ; thông tin không có không được tự bịa.

## Kết quả kỹ thuật và giới hạn

Backend tests bao phủ transaction/rollback, idempotency, WAL concurrency, tenant/RBAC/CSRF, giữ và consume reservation, PO nhập từng phần, đơn bán/xuất/nhận trả, serial/coverage, migration 001–006 và catalog báo giá (giá chưa biết, giá 0, metadata công khai, scope kho). Frontend tests kiểm tra luồng báo giá, lỗi đăng nhập/phiên, route độc lập và điều hướng màn nhỏ. Kết quả lệnh kiểm tra đợt này được ghi sau khi chạy bộ kiểm tra cuối.

Kho vẫn ở trạng thái **đã có nền tảng và luồng hoạt động, chưa nghiệm thu toàn bộ giai đoạn 1**. Các adapter Inbox/CRM/Logistics và phần thanh toán/vận đơn của Orders cũ chưa triển khai; `/orders` và Inbox quick order hiện chỉ tạo đơn bán liên kết kho. Không coi các adapter còn lại là Live chỉ vì kho có server. Demo vẫn là dữ liệu cục bộ, không dùng cho hồ sơ khách hàng thật. Production cần identity doanh nghiệp, backup/restore diễn tập, giám sát, retention và load test; SQLite một máy chủ không tương đương nhiều replica/HA.

Công cụ kiểm tra trình duyệt dừng do không xác minh được URL; **chưa xác nhận visual QA desktop 1440px/narrow và chưa có ảnh chụp giao diện cho đợt này**. Không dùng component tests để thay thế kết luận visual QA.
