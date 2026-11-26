# Rà soát phạm vi task và công nghệ

## Nguồn đối chiếu

- `plan_24-11.docx`
- `Requirment_Ver1.0.xlsx`
- `Common_rule.docx`
- Bảng phân công trong `Estimate.docx`

## Phân công task và phần đã thực hiện

| Task | PIC / phạm vi | Tình trạng hiện tại |
|---|---|---|
| 1. Chatbox theo danh mục sản phẩm | Hải — Fullstack | Có giao diện tìm/chọn/lọc danh mục trong Inbox. Đang dùng API category sẵn có; backend chưa có hợp đồng category-filter cho conversation. |
| 2. Nhiều tài khoản TikTok Shop | Hải — Backend + QA | Có registry cấu hình theo ENV, định tuyến webhook theo shop và test Node.js. Đây là task có chủ đích tập trung backend. |
| 3. Sidebar dạng trượt | Hải — Frontend | Nút thu/mở ở Header và trạng thái compact/expanded ở Sidebar. |
| 4–6. Account DB, chia task, quản trị tài khoản | Nam | Không thuộc phạm vi Hải. |
| 7. Dashboard theo account | Hải — Fullstack | Chưa triển khai; đang chờ Nam thống nhất role, scope và API/DTO do phụ thuộc task 4/6. |

Do đó, các task của Hải không phải toàn bộ đều tập trung backend: task 1 có phần giao diện, task 3 là frontend, task 2 là backend theo đúng bảng phân công, task 7 cần cả backend lẫn frontend sau khi có hợp đồng quyền.

## Công nghệ yêu cầu trong Common_rule

- Frontend: TypeScript 5.8+, React 19, Vite 6, React Router DOM v7, Tailwind CSS v4, Lucide; TypeScript `strict` và không dùng `any`.
- Backend: Node.js 22.12+ ESM, Zod, Native HTTP/Fast Dispatcher.
- Database: SQLite WAL cho dev, PostgreSQL cho staging/production, migration SQL append-only.
- Kiểm thử/chất lượng: Vitest 4, React Testing Library, jsdom, ESLint 9 Flat Config, Prettier; format 2 spaces, không dấu chấm phẩy.
- Kiến trúc: Modular Monolith/Vertical Slice; module độc lập; giữ ranh giới App Shell và backend core theo Common_rule.

## Công nghệ repository hiện tại

- Backend: JavaScript ESM với Express 4, Firebase Admin/Firestore và dữ liệu demo/in-memory.
- Frontend: React 18 UMD, JSX được Babel Standalone biên dịch trên trình duyệt, Tailwind CDN; chưa dùng TypeScript, Vite hoặc React Router.
- Kiểm thử: script hiện tại dùng Node built-in `node --test`; chưa cấu hình Vitest, React Testing Library, ESLint hoặc Prettier.
- Chưa có nền tảng `server/modules`, SQLite WAL/PostgreSQL hay hệ thống migration mô tả trong Common_rule.

## Đánh giá và ranh giới

Các thay đổi task 1–3 hiện được viết bằng stack legacy của repository, không chuyển sang stack mục tiêu trong Common_rule. Đây là khác biệt đáng kể giữa tiêu chuẩn kiến trúc và mã nguồn thực tế; không nên âm thầm trộn thêm TypeScript/Vite hoặc đổi backend chỉ trong một task nhỏ vì sẽ thành migration diện rộng, vượt phạm vi phân công và có thể xung đột với module của thành viên khác.

Task 7 cần backend áp dụng quyền/scope và frontend chỉ trình bày dữ liệu đã scope. Không thay thế kiểm soát backend bằng lọc UI. Task này tiếp tục chờ API/scope F0/F1/F2 do Nam thống nhất.

## Quyết định đã thống nhất

- Hải chọn tiếp tục các task được giao trên stack hiện có; không migrate công nghệ trong các task nhỏ.
- Các thay đổi mới vẫn phải đối chiếu `Common_rule.docx` và nêu rõ khi có khác biệt với stack mục tiêu hoặc phát sinh phụ thuộc.
- Không có migration công nghệ nào được thực hiện trong lần rà soát này.
