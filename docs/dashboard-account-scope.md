# Dashboard — dữ liệu theo tài khoản

## Task được giao

- Task 7: Điều chỉnh Dashboard để lấy đúng thông tin hiển thị theo tài khoản.
- PIC: Hải; estimate trong bảng phân công: 15 giờ.
- Task 4 (Database Account phân cấp), task 5 (chia task F1/F2) và task 6 (quản lý tài khoản F1/F2) thuộc PIC Nam.

## Hiện trạng đã rà soát

- `src/frontend/components/OverviewView.jsx` đang dựng KPI, biểu đồ và việc cần làm bằng số liệu demo cố định; bộ lọc thời gian chỉ đổi sang các bộ dữ liệu tĩnh.
- `src/frontend/app.jsx` đang khởi tạo `currentUser` mặc định với role `admin`, không tải user và scope từ phiên đăng nhập.
- `src/routes/dashboardRoutes.js` có API summary, funnel, sales-by-period và work-queue. Summary/funnel/sales-by-period áp dụng scope hiện có `All` hoặc `Own` qua `dashboard.read`; work-queue chỉ truy vấn dữ liệu của user hiện tại.
- Scope hiện tại dựa trên role `ADMIN`, `MANAGER`, `SALES`, `CUSTOMER_CARE`; chưa có mapping F0/F1/F2 hoặc scope theo danh mục sản phẩm/Business Account.
- API client chưa có phương thức Dashboard riêng. Client hiện có một số luồng fallback sang dữ liệu demo khi API lỗi.
- Trong DEMO mode, middleware xác thực gắn user mock role admin; không thể xác nhận hành vi đa tài khoản thực tế bằng demo này.

## Phụ thuộc và ranh giới

Yêu cầu trong bảng phân công/Excel cần Admin xem toàn bộ và Leader/Member xem dữ liệu theo danh mục được giao. Cơ sở dữ liệu Account phân cấp và gán phạm vi tài khoản/danh mục thuộc task của Nam. Không tự lọc dữ liệu chỉ trên frontend hoặc suy luận scope từ tên/role không có trong hợp đồng backend.

Trước khi hoàn thiện end-to-end cần thống nhất với PIC Nam:

- Định danh role chính thức và mapping F0/F1/F2 sang role runtime.
- Nguồn gán danh mục/Business Account cho từng user.
- API/DTO trả về scope hiệu lực và Dashboard metrics đã được backend lọc.
- Quy tắc xử lý user chưa được gán scope, bị khóa, hoặc không có quyền dashboard.

## Kế hoạch triển khai sau khi chốt hợp đồng

1. Dùng API dashboard được backend scope làm nguồn dữ liệu KPI, biểu đồ và việc cần làm; không giữ số demo khi ở Live Mode.
2. Thể hiện loading, lỗi truy cập/ tải dữ liệu và trạng thái rỗng rõ ràng.
3. Giữ kiểm soát quyền và lọc dữ liệu tại backend; UI chỉ trình bày dữ liệu đã scope.
4. Kiểm thử Admin, Leader, Member và user không có scope sau khi có API/DTO thống nhất.

## Trạng thái và ghi chú kiểm tra

- Hải chọn chờ Nam thống nhất API/scope F0/F1/F2 trước khi triển khai; hiện chưa sửa code Dashboard.
- Xác thực trực quan hiện cũng bị chặn bởi lỗi cú pháp Babel đã quan sát tại `src/frontend/utils/mockData.js:550`; không thuộc task Dashboard và chưa sửa.
