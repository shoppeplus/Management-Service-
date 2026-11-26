# Prompt triển khai Dashboard kèm Inbox đa kênh

Tài liệu này là bản mô tả yêu cầu để đưa cho AI khi bắt đầu hoặc tiếp tục làm Dashboard. Đọc phần **Bối cảnh và nguồn tham chiếu** trước, sau đó có thể sao chép nguyên khối prompt ở cuối file.

## Mục tiêu

Hoàn thiện trang **Dashboard / Tổng quan** của SmartSales Suite theo tài liệu yêu cầu đã cung cấp, đồng thời đưa **Inbox đa kênh đầy đủ** vào ngay trong trang Dashboard. Dashboard vẫn phải giữ phần tổng quan kinh doanh; Inbox là một khu vực làm việc thực sự, không phải hình minh họa hoặc vài tin nhắn tĩnh.

## Bối cảnh và nguồn tham chiếu

### Base tham khảo

Base tham khảo đang ở `C:\Users\haico\Downloads\Management-Service-`:

- `src\frontend\components\OverviewView.jsx`: tham khảo cách trình bày Dashboard, lời chào, bộ lọc thời gian, KPI, biểu đồ và nút tạo đơn. Đây là giao diện React/Babel riêng; chỉ tham khảo bố cục và ý tưởng, không chép nguyên component hoặc số liệu mẫu.
- `src\frontend\components\OmnichannelInbox.jsx`: tham khảo trải nghiệm Inbox đa kênh, chuyển hội thoại, luồng tin nhắn, gợi ý trả lời, quick replies và thông tin khách hàng.
- `src\frontend\components\ChatList.jsx` và `src\frontend\components\MessageThread.jsx`: tham khảo các phần danh sách hội thoại và nội dung chat.
- Tài liệu yêu cầu trong base: `Requirment_Ver1.0.xlsx`, `Management-Service-Common_rule.docx` và `plan_24-11.docx`. Kiểm tra các tài liệu này trước khi triển khai; nếu yêu cầu mâu thuẫn, nêu rõ điểm mâu thuẫn và hỏi người dùng, không tự suy diễn.

### Repository hiện tại

- Ứng dụng chính dùng React, TypeScript, Vite; giữ đúng kiến trúc và quy ước hiện tại.
- Route Dashboard được khai báo trong `src\App.tsx`.
- Dashboard hiện hữu ở `src\modules\dashboard\DashboardPage.tsx`, phép tính tổng hợp ở `src\modules\dashboard\metrics.ts`, và kiểu dáng ở `src\modules\dashboard\dashboard.css`.
- Inbox hiện hữu là module riêng. Tìm và dùng lại route, component, context, service, kiểu dữ liệu và hành vi đang dùng tại `src\`; không tạo Inbox/Chat service hay mô hình dữ liệu trùng lặp.
- Hướng dẫn dự án ở `AGENTS.md`, tài liệu Dashboard hiện có ở `docs\dashboard.md`.

## Yêu cầu giao diện và hành vi

1. **Giữ Dashboard là Dashboard**
   - Có tiêu đề/lời chào, bộ lọc thời gian, KPI và biểu đồ theo dữ liệu thực tế có sẵn.
   - Có các khu vực tác nghiệp phù hợp như đơn hàng, trạng thái, việc cần xử lý hoặc nội dung quy định trong tài liệu yêu cầu.
   - Không thay bằng một trang Inbox đơn thuần.

2. **Đưa toàn bộ trải nghiệm Inbox vào Dashboard**
   - Tích hợp khu vực Inbox đa kênh đầy đủ ngay trên trang Dashboard; giữ chức năng cốt lõi của Inbox hiện tại.
   - Có danh sách hội thoại, tìm kiếm/lọc theo các tiêu chí đang được module Inbox hỗ trợ, và chọn hội thoại để xem nội dung.
   - Có luồng tin nhắn, trạng thái đọc/chưa đọc và trạng thái hội thoại theo dữ liệu, cùng thông tin khách hàng liên quan nếu module hiện tại cung cấp.
   - Giữ các thao tác nhắn tin/ghi chú/quick reply hiện có của Inbox. Gửi hoặc cập nhật phải dùng đúng service hiện hữu và báo lỗi rõ ràng khi thất bại.
   - Trên màn hình rộng, sắp xếp vùng tổng quan và Inbox rõ ràng, không làm Inbox thành một widget nhỏ khó sử dụng. Trên màn hình hẹp, cho phép chuyển giữa danh sách và hội thoại, không tràn ngang.
   - Có đường dẫn/thao tác để người dùng vẫn mở được module Inbox đầy đủ hiện tại nếu kiến trúc ứng dụng hỗ trợ.

3. **Dùng dữ liệu trung thực**
   - Lấy dữ liệu từ service/context đang dùng trong ứng dụng; không hard-code KPI, hội thoại, tin nhắn, khách hàng hoặc kết quả gửi.
   - Không tự dựng phản hồi AI hoặc giả lập tích hợp thành dữ liệu thật. Nếu chức năng hiện tại chỉ là demo/rule-based, phải thể hiện đúng giới hạn đó.
   - Tách bạch Demo và Live; lỗi API phải hiện trạng thái lỗi, không âm thầm đổi sang dữ liệu Demo.
   - Thể hiện trạng thái loading, rỗng và lỗi một cách rõ ràng; thao tác gửi tin không được báo thành công nếu service chưa xác nhận.

4. **Không mở rộng phạm vi**
   - Chưa làm hoặc thay đổi phân quyền/RBAC; phần này đang do người khác phụ trách.
   - Không thay đổi luồng đơn hàng, dữ liệu nghiệp vụ hoặc module khác nếu không bắt buộc cho Dashboard/Inbox.
   - Không thêm thư viện hay backend mới khi có thể dùng lại hạ tầng hiện tại.

5. **Khả năng sử dụng**
   - Hỗ trợ tiếng Việt/tiếng Anh bằng hệ thống i18n hiện tại.
   - Dùng được bằng bàn phím, có nhãn truy cập phù hợp và focus rõ ràng.
   - Giữ thiết kế nhất quán với SmartSales Suite; chỉ mượn ý tưởng trình bày từ base.

## Tiêu chí nghiệm thu

- Dashboard mở được ở route `/dashboard`, hiển thị số liệu từ nguồn dữ liệu ứng dụng thay vì số liệu cố định.
- Inbox đa kênh hoạt động ngay trong Dashboard: tìm/chọn hội thoại, đọc luồng tin, và thực hiện các thao tác hiện có bằng đúng adapter/service.
- Các thay đổi trong Dashboard không làm hỏng route hoặc chức năng Inbox hiện tại.
- Không có dữ liệu giả được trình bày như dữ liệu Live; lỗi, loading và empty state có thông báo phù hợp.
- Giao diện dùng được ở desktop 1440px và màn hình hẹp; không tràn nội dung chat/danh sách.
- Có test tập trung cho các hành vi mới hoặc được sửa.
- Chạy các lệnh liên quan: `npm run typecheck`, `npm run lint`, test phù hợp và `npm run build`.

## Prompt có thể sao chép cho AI

```text
Hãy triển khai Dashboard cho SmartSales Suite theo file docs/dashboard-chat-prompt.md.

Trước khi sửa code:
1. Đọc AGENTS.md, docs/dashboard.md và các tài liệu yêu cầu ở base
   C:\Users\haico\Downloads\Management-Service- (Requirment_Ver1.0.xlsx,
   Management-Service-Common_rule.docx, plan_24-11.docx).
2. Đọc route Dashboard, Dashboard hiện có và module Inbox hiện có trong src/.
3. Xác nhận kiến trúc/service/state hiện hữu; không tự đoán dữ liệu hoặc tạo adapter trùng.

Yêu cầu chính:
- Giữ Dashboard gồm KPI, bộ lọc thời gian, biểu đồ và các thông tin kinh doanh theo tài liệu.
- Tích hợp Inbox đa kênh đầy đủ ngay trong trang Dashboard, không chỉ làm khung chat trang trí.
- Giữ nguyên chức năng Inbox hiện hữu; dùng lại component/context/service/model và trạng thái dữ liệu hiện có.
- Đảm bảo chọn hội thoại, xem luồng tin và dùng được các thao tác chat sẵn có.
- Giữ nguyên phân quyền/RBAC; chưa triển khai hoặc chỉnh sửa phần này.
- Không hard-code số liệu, hội thoại hay tin nhắn; không biến demo hoặc AI mô phỏng thành tích hợp thật.
- Không âm thầm fallback Live sang Demo; hiển thị loading/empty/error rõ ràng.
- Hỗ trợ tiếng Việt/tiếng Anh, bàn phím và responsive desktop/mobile.
- Chỉ sửa những file cần thiết, cập nhật tài liệu liên quan và viết test cho hành vi mới.

Sau khi làm xong, chạy typecheck, lint, test liên quan và build. Báo rõ:
- Các file đã sửa và hành vi hoàn thành.
- Những yêu cầu trong tài liệu chưa thể làm do thiếu API/dữ liệu.
- Kết quả từng lệnh kiểm tra và lỗi còn tồn tại.
```
