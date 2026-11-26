# Omnichannel Inbox — Bộ lọc danh mục sản phẩm

## Mục đích và phạm vi

`src/frontend/components/OmnichannelInbox.jsx` là view Inbox ba cột trong giao diện demo hiện tại. Phần được mô tả ở đây là bộ chọn danh mục để lọc danh sách hội thoại. Component vẫn chứa dữ liệu demo và mô phỏng tương tác; đây chưa phải tích hợp TikTok messaging production.

## Luồng hoạt động

1. Khi Inbox mount, component gọi `GET /api/products/categories/all`.
2. Nút hamburger trong header mở panel danh mục phủ lên Inbox; bấm nền hoặc nút đóng để đóng panel.
3. Danh mục có thể tìm theo tên.
4. Chọn “Tất cả danh mục” bỏ bộ lọc; chọn danh mục sẽ cập nhật `categoryFilter` và đóng panel.
5. `filteredList` áp dụng bộ lọc danh mục cùng tab mine/unassigned, kênh và từ khóa tìm kiếm.
6. Nếu hội thoại đang chọn không còn trong danh sách, tự chuyển sang hội thoại khớp đầu tiên. Khi danh sách lọc rỗng, không tự gán hội thoại thay thế.
7. Header thể hiện danh mục đang chọn.

## Quy chuẩn giao diện phần Inbox

- Header chính ưu tiên tiêu đề “Hộp thư đa kênh”; trạng thái danh mục hiển thị thành dòng phụ thay vì ghép tên thương hiệu, dấu phân cách và tiêu đề trên một hàng.
- Nút danh mục có kích thước cố định, viền trung tính và trạng thái hover rõ ràng.
- Khu vực quy trình ở màn hình lớn dùng nhãn điều hướng đồng nhất, không dựa vào emoji.
- Bộ lọc kênh và ô tìm kiếm dùng chiều cao, radius và focus ring thống nhất.
- Bộ lọc kênh có tùy chọn TikTok; biểu tượng hội thoại dùng nhãn `T` trung tính trong danh sách.
- Panel danh mục dùng hierarchy, nút mở/thu danh mục cha, trạng thái đang chọn, số hội thoại và trạng thái loading/error/empty riêng.
- Khung chat có nút ẩn/hiện hồ sơ khách hàng để ưu tiên diện tích hội thoại; panel hồ sơ hiển thị dạng overlay ở viewport nhỏ hơn 2xl và dạng cột bên phải ở viewport rộng.
- Dưới breakpoint `lg`, Inbox chuyển qua lại giữa danh sách và khung chat; nút quay lại trong header khung chat đưa người dùng về danh sách.
- Conversation item dùng button semantics và focus-visible ring để hỗ trợ thao tác bàn phím; header chat co giãn trên màn hình nhỏ.
- Tab “Của tôi” và “Chưa phân công” hiển thị số hội thoại lấy từ map hiện có thay vì số viết cứng.
- Badge ở cạnh “Hộp thư” phản ánh số hội thoại đang khớp tất cả bộ lọc đang bật.

Các số đếm này hiện dựa trên dữ liệu component; khi chuyển sang Live Mode cần dùng dữ liệu/metadata đã được backend scope, không dùng số demo.

## API danh mục

```http
GET /api/products/categories/all
Authorization: Bearer <token>
```

Response route hiện tại:

```json
{
  "success": true,
  "data": [
    { "id": "cat_1", "name": "Mỹ phẩm", "code": "MY_PHAM" }
  ]
}
```

Endpoint hiện trả danh mục phẳng. UI dựng danh mục phân cấp nếu backend gửi `parentName`, `parent.name` hoặc mảng `children` lồng nhau; backend hiện chưa có hợp đồng cây cha/con chính thức.

## Dữ liệu category của hội thoại

Lọc đọc trường category theo thứ tự:

- `category`
- `categoryName`
- `metadata.category`

Đồng bộ props `conversations` từ App cũng nhận `productCategory`. Conversation được ghép với dữ liệu demo theo `id` hoặc tên khách hàng/contact. Không có category thì không suy luận category từ nội dung tin nhắn.

## Trạng thái giao diện

- Loading: “Đang tải danh mục...”.
- Error: hiển thị thông báo lỗi; không tạo danh mục fallback.
- Empty/search không có kết quả: “Không tìm thấy danh mục”; gợi ý người dùng đổi từ khóa.
- Khi bộ lọc hội thoại không có kết quả, hiển thị trạng thái rỗng thay vì giữ khung chat của hội thoại không khớp; nút “Xóa bộ lọc” đưa danh sách về tab “Của tôi” và bỏ các bộ lọc kênh/danh mục/từ khóa.
- Số bên cạnh category là số conversation gắn category tương ứng, không phải số sản phẩm.
- Số bên cạnh “Tất cả danh mục” là tổng conversation hiện trong map.

## Bảo mật và ranh giới

- Backend phải áp dụng quyền và data scope trước khi trả danh mục.
- Không dùng ẩn/hiện menu như kiểm soát truy cập.
- Không đưa Business API token xuống browser.
- Không hardcode danh mục để thay dữ liệu Live.

## Hạn chế và việc cần thống nhất

- `/api/products/categories/all` hiện trả category phẳng và không gắn middleware `requirePermission` như route products.
- Model/route conversation chưa có hợp đồng category rõ ràng. Conversation Live không có category sẽ không lọc được.
- Conversations API chưa có pagination hoặc category filter server-side.
- Dữ liệu demo khởi tạo trong `OmnichannelInbox.jsx` hiện chưa có hội thoại TikTok. Danh sách lọc đọc từ `conversationsMap`; luồng đồng bộ props hiện chỉ cập nhật category cho hội thoại khớp, không thêm conversation mới. Vì vậy, để bộ lọc trả về hội thoại thật cần tích hợp conversation TikTok vào nguồn/map này. Tùy chọn bộ lọc không đồng nghĩa TikTok messaging đã kết nối production.
- Trước khi bật Live, backend cần trả category đáng tin cậy trong conversation hoặc hỗ trợ filter server-side; không nên tăng cường suy luận ở frontend.
- Nguồn hội thoại trong component vẫn chứa demo data, cần tích hợp API riêng trong task Inbox.

## Kiến trúc chia nhỏ Module (Modular Chatbox)

Để tránh "God Object" và dễ dàng bảo trì/nâng cấp sau này, `OmnichannelInbox` đã được tách thành 5 phần độc lập:

- `src/frontend/components/inbox/inboxHelpers.js` (`window.InboxHelpers`): Thuần logic dựng cây danh mục cha/con kèm sản phẩm đính kèm (`buildCategoryTree`) và lọc hội thoại đa điều kiện (`filterConversations`).
- `src/frontend/components/inbox/InboxCategoryDrawer.jsx` (`window.InboxCategoryDrawer`): Menu 3 gạch trượt ra hiển thị cây danh mục phân cấp, danh mục con và danh sách sản phẩm đính kèm (có nút `+ Tư vấn` để chèn nhanh giá/tồn kho vào khung chat).
- `src/frontend/components/inbox/InboxConversationList.jsx` (`window.InboxConversationList`): Cột danh sách hội thoại bên trái, tích hợp bộ lọc Kênh và bộ chọn **Đa tài khoản Business / TikTok Shop**.
- `src/frontend/components/inbox/InboxCustomerPanel.jsx` (`window.InboxCustomerPanel`): Cột thông tin khách hàng 360 độ và 4 nút thao tác nhanh (`+ Tạo đơn`, `+ Báo giá`, `+ Ticket`, `+ Lịch hẹn`).
- `src/frontend/components/OmnichannelInbox.jsx` (`window.OmnichannelInbox`): Component điều phối trung tâm (~450 dòng thay vì 1.469 dòng như trước).

## Tệp liên quan

- `src/frontend/components/OmnichannelInbox.jsx`: Component điều phối Inbox.
- `src/frontend/components/inbox/*`: Các sub-components và domain helpers của Chatbox.
- `src/routes/productRoutes.js`: API `GET /api/products/categories/all` trả cây danh mục + sản phẩm con (đã gắn `requirePermission('product.read')` và lọc theo `allowedCategories`).
- `src/routes/messageRoutes.js`: API `GET /api/messages/conversations` (hỗ trợ filter `category`, `shopId`, `channelType`) và `GET /api/messages/business-accounts`.
- `src/utils/rbac.js`: Hàm `getUserDataScope(user)` chuẩn hóa hợp đồng F0 / F1 / F2 để tự động lọc danh mục và shop ngay khi Nam hoàn thiện DB Account.

## Nhật ký kiểm tra

- 2026-11-26: Đã sửa lỗi cú pháp tại `src/frontend/utils/mockData.js:550`.
- 2026-11-26: `npm test` đạt 10/10 test cases (bao gồm test cây danh mục, sản phẩm đính kèm, lọc đa shop TikTok và phân quyền F0/F1/F2).
- 2026-11-26: Đã kiểm tra giao diện Inbox trên desktop/mobile qua trình duyệt; danh sách ↔ chat và mở/đóng hồ sơ khách hàng hoạt động.
- 2026-11-26: Đã bổ sung TikTok vào bộ lọc kênh theo phản hồi. Khi chưa có conversation TikTok, hiển thị trạng thái rỗng và nút xóa bộ lọc thay vì để lại nội dung chat không khớp.
- 2026-11-26: Trình duyệt xác nhận chọn TikTok hiển thị trạng thái rỗng đúng, nút “Xóa bộ lọc” khôi phục danh sách; không có hội thoại TikTok demo trong map hiện tại.
