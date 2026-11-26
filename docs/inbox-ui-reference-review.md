# Đánh giá giao diện Inbox theo ảnh tham khảo

## Câu hỏi

Đánh giá khả năng làm Inbox hiện tại theo ảnh tham khảo và chọn hướng thiết kế phù hợp; chưa triển khai thay đổi giao diện.

## So sánh bố cục

Ảnh tham khảo cho thấy giao diện desktop chia khu vực rõ theo luồng xử lý CSKH:

1. Thanh điều hướng biểu tượng hẹp.
2. Thanh trên cùng có thương hiệu, breadcrumb, chọn kênh/tài khoản và ngôn ngữ.
3. Danh sách hộp thư/folder và số lượng.
4. Danh sách hội thoại có trạng thái, nhãn, người phụ trách.
5. Khung nội dung hội thoại.
6. Panel thông tin khách hàng có thể đóng/mở.

Inbox hiện tại nằm trong app shell đã có Sidebar và Header toàn cục; bên trong có tiêu đề, tìm kiếm, lọc kênh, tab và panel danh mục dạng drawer, danh sách hội thoại, luồng trao đổi và customer context. Cấu trúc hiện tại gọn và ít chiếm chỗ hơn, nhưng chưa có một sidebar folder thường trực như “Hộp thư của tôi”, “Tất cả hội thoại”, “Chưa phân công”, “Được nhắc đến”, “Trợ lý tự động”, “Nhóm” và “Lưu trữ”.

## Đánh giá

- Ảnh tham khảo phù hợp hơn với nhân viên xử lý lượng hội thoại lớn: khu vực inbox và trạng thái dễ quét, panel khách hàng luôn ở cạnh luồng xử lý, bộ lọc đa kênh dễ thấy.
- Giao diện hiện tại phù hợp cho demo/khối lượng vừa: ít lớp điều hướng hơn và dành được diện tích cho hội thoại. Không có cơ sở để kết luận nó kém; ảnh tham khảo thiên về sản phẩm CSKH chuyên biệt và có nhiều chức năng hơn.
- Có thể triển khai theo stack hiện tại (React 18 UMD/JSX + Tailwind CDN); đây chủ yếu là thay đổi bố cục/component, không đòi hỏi đổi framework.
- Không nên sao chép nguyên ảnh: app hiện đã có Sidebar/Header toàn cục, nên thêm thanh điều hướng biểu tượng thứ hai sẽ trùng chức năng. Top bar đa kênh cũng không được hiểu là các kết nối thật nếu API/account selection chưa triển khai.
- Bố cục 4 vùng chính có chi phí không gian đáng kể. Ở laptop nhỏ cần cho phép thu gọn folder sidebar và customer panel; trên mobile cần chuyển chúng thành drawer hoặc view riêng.

## Khuyến nghị

Chọn hướng hybrid thay vì giữ nguyên không đổi hoặc chép nguyên mẫu:

1. Giữ Sidebar và Header hiện tại làm điều hướng toàn app.
2. Thêm navigation/folder panel dành riêng cho Inbox, mặc định hẹp hoặc có thể thu gọn.
3. Đưa danh sách hội thoại và nội dung trao đổi thành hai vùng trung tâm rõ ràng hơn.
4. Giữ customer context ở panel đóng/mở để người dùng chủ động lấy thêm diện tích.
5. Giữ category filter hiện có, nhưng đặt vào nhóm lọc Inbox thay vì tạo thêm lớp điều hướng cạnh tranh.
6. Chỉ hiển thị lựa chọn kênh, trạng thái, assignment và AI khi tương tác tương ứng có dữ liệu/API thật; không tạo số liệu/trạng thái giả.

## Phạm vi gợi ý cho một vòng UI

- Desktop: app shell + folder sidebar thu gọn được + conversation list + thread + customer panel đóng/mở.
- Responsive: folder và customer context thành drawer; ưu tiên thread trên màn hình nhỏ.
- Không đổi hợp đồng API, quyền truy cập, dữ liệu hội thoại hoặc provider integrations trong một vòng chỉnh visual.
- Trước khi code nên xác nhận các folder cần có và panel nào cần mở mặc định. Dữ liệu count phải lấy từ nguồn đã scope, không dùng số tĩnh.

## Hạn chế khi đánh giá

- Đây là đánh giá theo ảnh tĩnh và cấu trúc code; chưa có kiểm thử trực quan Inbox hiện tại do lỗi Babel tại `src/frontend/utils/mockData.js:550`.
- Danh sách kênh/tài khoản trong ảnh không chứng minh rằng các provider đó đã được kết nối trong repository.
- Chưa có contract backend đầy đủ cho category-filter hoặc folder semantics của Inbox.

## Trạng thái

- Hướng hybrid đã được chọn và bắt đầu áp dụng vào `src/frontend/components/OmnichannelInbox.jsx`: cải thiện khung hội thoại, chuyển danh sách item sang button hỗ trợ bàn phím, thêm điều khiển ẩn/hiện hồ sơ khách hàng và tinh chỉnh header/message spacing trên màn hình nhỏ.
- Giữ nguyên app shell, bộ lọc danh mục, màu sắc tổng thể và các thao tác nghiệp vụ; không thêm giả lập folder/kênh mới.
- Đã kiểm tra luồng desktop và mobile trong trình duyệt: danh sách hội thoại hiển thị, chọn conversation mở thread trên mobile, nút quay lại trả về danh sách; hồ sơ khách hàng có thể mở/đóng ở viewport tablet.
- `npm test` đạt 4/4; `git diff --check` thành công.
- Ứng dụng vẫn báo lỗi Babel có sẵn tại `src/frontend/utils/mockData.js:550`; browser vẫn nạp Inbox component để kiểm tra, nhưng dữ liệu demo đầu vào của file đó có thể không đầy đủ.
