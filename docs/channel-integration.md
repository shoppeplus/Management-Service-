# Kết nối nguồn tin nhắn, đồng bộ và phân tích đơn hàng

## Phạm vi

Frontend có Shopee, Lazada, TikTok Shop, Messenger, Instagram, WhatsApp, Telegram, Zalo OA, Live Chat và Email. SQLite backend có các route quản lý kết nối nhưng hiện từ chối thao tác provider với lỗi rõ ràng vì chưa có OAuth/API credentials hoặc channel adapter. Demo không đăng nhập, kết nối shop/page, gọi API nhà cung cấp hay nhận dữ liệu thật. Danh sách nền tảng thể hiện UI có hỗ trợ kênh; không khẳng định mọi tài khoản, thị trường hay loại tin nhắn đã được nhà cung cấp cho phép.

Nhà cung cấp có thể giới hạn hội thoại được nhập hoặc trả lời theo quyền ứng dụng, vị trí địa lý, trạng thái cuộc trò chuyện, người đã cấp quyền hay cửa sổ gửi tin. Backend chỉ đăng ký khả năng được cấp thật. Trả trạng thái `unavailable` khi nhà cung cấp không cho nhắn tin hoặc đồng bộ hội thoại đó.

## Kết nối và đồng bộ

### Telegram demo (Bot API)

Telegram dùng long polling tự động dành cho demo local. Thu hồi token đã bị lộ và tạo token mới trong BotFather; chỉ đặt token mới trong biến môi trường server `TELEGRAM_BOT_TOKEN`. Không nhập token vào trình duyệt, `.env` phía Vite, mã nguồn, hoặc cuộc trò chuyện. Node không tự nạp `.env`; cần khởi động lại API server sau khi đặt biến. Poller chạy trong API server, đợi tối đa 20 giây mỗi lần hỏi Telegram và thử lại với khoảng nghỉ tăng dần khi gặp lỗi. Inbox Live tự làm mới dữ liệu mỗi 5 giây khi tab đang mở.

Trong Live Mode, chọn **Liên kết tài khoản** tại Telegram để xác thực bot với `getMe` và mở cuộc trò chuyện bot. Khách cần chủ động mở bot và gửi `/start` hoặc tin nhắn. Sau khi kết nối, cập nhật được nhập tự động; nút **Đồng bộ** vẫn có thể dùng để yêu cầu đồng bộ ngay. Adapter chỉ lưu tin nhắn văn bản/caption từ chat riêng; bỏ qua nhóm và các loại cập nhật khác. Có thể gửi trả lời dạng văn bản qua `sendMessage` trên hội thoại Telegram; ảnh/tệp đính kèm chưa hỗ trợ. Chỉ một tenant được gắn với bot cấu hình trên cùng server.

Không thể dùng đồng thời webhook Telegram hoặc một tiến trình polling khác cho cùng bot. Nếu Telegram trả lỗi xung đột, dừng webhook/tiến trình còn lại rồi thử đồng bộ lại. Nếu khách chưa bấm **Start** hoặc bot token/quyền chat không hợp lệ, Telegram sẽ từ chối gửi và Inbox sẽ báo lỗi; chỉ lưu tin gửi đi sau khi Telegram xác nhận thành công. Không thể dùng đồng thời webhook Telegram hoặc một tiến trình polling khác cho cùng bot. Nếu Telegram trả lỗi xung đột, dừng webhook/tiến trình còn lại rồi thử đồng bộ lại.

| Method | Path                                        | Thành công                                |
| ------ | ------------------------------------------- | ----------------------------------------- |
| GET    | `/integrations/channels`                    | `ChannelConnection[]`                     |
| POST   | `/integrations/channels/:channel/authorize` | `{ "authorizationUrl": "https://…" }`     |
| POST   | `/integrations/channels/:connectionId/sync` | `{ connection, inbox, importedMessages }` |

Mỗi `ChannelConnection` chứa ID, kênh, tên shop/page, trạng thái (`connected`, `disconnected`, `expired`, `error`, `unavailable`), lần đồng bộ gần nhất và thông tin lỗi hữu ích. Một tenant có thể có nhiều shop/page trên cùng kênh. Access token và refresh token chỉ lưu mã hóa ở backend, không đưa vào `InboxData`, trình duyệt, URL callback hoặc `VITE_*`. Backend kiểm tra OAuth state dùng một lần, PKCE khi hỗ trợ, redirect URI cố định, quyền tối thiểu và allowlist endpoint xác thực của nhà cung cấp. Không nhận URL tùy ý do frontend truyền.

`POST .../:connectionId/sync` yêu cầu `{ "requestId": "uuid" }` để retry idempotent khi timeout chưa rõ kết quả. Backend upsert theo provider conversation ID và message ID, chống webhook/đồng bộ trùng, phân trang bằng cursor và lưu các message mới cùng cursor trong transaction. Chỉ cập nhật lần đồng bộ cuối sau khi commit. Trả số message thực sự mới và `InboxData` hợp lệ; lỗi provider, token hết hạn, timeout hoặc quyền thiếu phải hiện rõ, không được đánh dấu đồng bộ thành công hoặc thay bằng Demo. Webhook xác minh chữ ký, chống replay, áp rate limit và ghi audit log.

Gắn `connectionId` và `externalId` vào hội thoại để lưu nguồn và trả lời về đúng shop/page; không đoán tài khoản từ tên kênh. Mỗi nhân viên chỉ truy cập kết nối trong tenant của mình.

## Phân tích nhu cầu

Demo dùng quy tắc cục bộ để so khớp tin nhắn khách với danh mục sản phẩm. Bỏ qua tin nhân viên và ghi chú; không thêm sản phẩm ngoài catalog; mỗi đề xuất hiển thị tin nhắn nguồn. Phân biệt quan tâm với lời chốt mua, theo dõi hoặc trả hàng. Số lượng không rõ thì yêu cầu nhân viên nhập. Kết quả gắn nhãn Demo, không phải AI model.

Live gọi `POST /conversations/:conversationId/purchase-analysis` trên server. Server tải hội thoại thuộc tenant và snapshot sản phẩm tương ứng, sau đó mới gọi model đã cấu hình. Không gửi tên/số điện thoại/địa chỉ hay toàn bộ hội thoại cho dịch vụ bên ngoài nếu tenant chưa phê duyệt dịch vụ, quyền xử lý và lưu trữ dữ liệu. Giảm nội dung đưa vào model, giữ thời gian lưu tối thiểu, che thông tin định danh không cần thiết. Nội dung khách gửi là input không tin cậy, không thể thay đổi hướng dẫn của model hoặc gọi công cụ. Phân tích luôn là gợi ý, không tạo đơn, giữ kho hay nhắn lại khách.

Response `PurchaseAnalysis` gồm `conversationId`, `revision`, `source: "model"`, intent, summary và tối đa 50 dòng gồm ID sản phẩm đã có trong snapshot, số lượng nullable, `messageId` cùng `quote` trích nguyên văn. Số điện thoại và địa chỉ trích xuất cũng phải nêu `messageId`. Client kiểm tra customer/conversation/revision, ID catalog, số lượng, quote có trong tin khách và định dạng số điện thoại trước khi cho điền đơn. Quote không chứng minh khách đã chốt mua.

## Lên đơn trong Inbox

Khi mở tạo đơn từ hội thoại, client đưa danh mục, số lượng nhận diện và thông tin khách sang form để nhân viên xem lại. Giá, tồn kho, phí và tổng tiền do operations service tính. Số lượng chưa rõ phải nhập trước khi lưu. Client gửi optional `conversationId` và UUID `clientRequestId` trong `CreateOrderInput`; server kiểm tra tenant, customer và conversation trong cùng transaction. Lưu payload hash theo idempotency key, từ chối dùng lại key cho thông tin đơn khác và trả bản nháp gốc khi retry. Đơn nháp không giữ kho, không tự xác nhận và không chuyển dữ liệu sang sàn/thanh toán.

## Thử trên Demo

Trong Hộp thư, mở **Quản lý nguồn tin nhắn** và nhập hội thoại mẫu. Mở hội thoại, chọn **Lên đơn tại hội thoại**, phân tích nhu cầu, kiểm tra trích dẫn, sản phẩm và tồn kho, rồi điền đơn. Xác nhận số lượng, người nhận, số điện thoại và địa chỉ trước khi lưu. Đơn liên kết về hội thoại nguồn; xác nhận và giữ kho là bước riêng. Demo lưu trong trình duyệt, không dùng cho dữ liệu khách hàng thật.
