# API kho Giai đoạn 1 — hướng dẫn vận hành

Backend mới tách khỏi các adapter Inbox/Orders Demo. Không tự import localStorage hoặc tạo dữ liệu kho mẫu khi khởi động. Mọi nghiệp vụ thay đổi tồn phải qua command có chứng từ/kiểm kê. Nhân viên dùng tài khoản doanh nghiệp và vai trò; không cần mã truy cập riêng. Xem [thiết kế kho](INVENTORY_MODULE.md) và [phân tích hệ thống](SYSTEM_ANALYSIS.md).

## Khởi động local

Node >=22.12, npm. Scripts bật `--experimental-sqlite` để tương thích Node 22.12 theo [tài liệu Node.js](https://nodejs.org/download/release/v22.12.0/docs/api/sqlite.html).

1. `npm install`.
2. `npm run server:inventory` (mặc định 127.0.0.1:3001; lưu `var/inventory.sqlite`).
3. Terminal khác: `npm run dev`; mở `/inventory` hoặc `/products`. Nếu chưa đăng nhập, ứng dụng tự chuyển tới `/login`. Chọn **Tạo tài khoản doanh nghiệp** để mở `/register` và tạo tài khoản chủ cùng kho mặc định.
4. Vào **Quản trị → Tài khoản & phân quyền** (`/admin/team`) để tạo tài khoản theo vai trò. Nhân viên gửi yêu cầu bổ sung trong tab **Đơn mua hàng** của Kho; quản lý lập đơn mua; kế toán duyệt; quản lý nhận hàng sau khi đơn đã duyệt.

Mật khẩu cần 10–128 ký tự; server lưu hash scrypt, không lưu mật khẩu rõ. Phiên cookie HttpOnly hết hạn sau 8 giờ. Vai trò `staff` gửi yêu cầu thiếu hàng; `manager` lập đơn mua và nhận theo đơn đã được duyệt; `accountant` duyệt đơn mua trong workspace `/accounting` và xem sổ kế toán nhưng mặc định không tạo/nhận đơn, không vào giao diện kho. Vai trò receiver (Nhân viên kho) có thể thêm/sửa SKU và xử lý chứng từ kho được cấp quyền, nhưng không được nhận đơn mua trực tiếp, xuất/điều chỉnh tồn hoặc đổi cấu hình. Phiếu nhập không liên kết đơn mua chỉ cho owner/admin; hàng mua bổ sung phải được lập thành đơn mua, kế toán duyệt rồi quản lý kho mới nhận. Owner/admin dùng các trang quản trị riêng: `/admin` (tổng quan), `/admin/sales`, `/admin/care`, `/admin/work`; quản lý tài khoản tại `/admin/team`. Các màn hình quản trị chỉ theo dõi, không đưa người quản trị vào thao tác tuyến đầu của nhân viên.

### Cấu hình AI phân tích thị trường

Tạo `.env` cục bộ từ `.env.example`, điền `GEMINI_API_KEY`, sau đó khởi động lại `npm run server:inventory`. Tùy chọn đổi model qua `GEMINI_MODEL` (mặc định `gemini-3.8-flash`). Trang `/market-intelligence` hiển thị trạng thái Gemini và chỉ gọi dịch vụ khi owner/admin gửi câu hỏi. Gemini tự tìm kiếm web bằng Google Search grounding và trả về bản phân tích ngắn; giao diện không liệt kê bài viết. Không đưa khóa vào `VITE_*`, frontend hoặc source control. Chưa có usage/quota, cấu hình provider theo tenant hoặc lịch tự động.

CLI `npm run inventory:admin` vẫn dành cho bootstrap/vận hành trực tiếp có quyền filesystem database. Nếu dùng CLI tạo tenant/user cho môi trường cũ, đặt `INVENTORY_BOOTSTRAP_TOKEN` như trước; không đưa token vào VITE_* hoặc source control. CLI không thay thế luồng tài khoản nhân viên trong giao diện.

Production: đặt INVENTORY_DB_PATH trên ổ bền vững được sao lưu; chạy API sau TLS reverse proxy cùng origin và proxy toàn bộ `/api/v1`. Đặt `NODE_ENV=production` để cookie Secure và INVENTORY_ALLOWED_ORIGINS là origin chính xác của frontend. Vite dev proxy không phải cấu hình reverse proxy production. Không triển khai WAL trên network filesystem hoặc nhiều replica ghi độc lập. Live Inbox/CRM/Orders/Logistics dùng cùng API SQLite và catalog kho; shipment chỉ là ghi nhận nội bộ, còn tích hợp nhà cung cấp vẫn chưa cấu hình.

## Xác thực và lỗi

- `POST /api/v1/auth/session` `{token}` → cookie `inventory_session`, HttpOnly, SameSite=Strict, thời hạn 8h; chỉ hash token lưu database. Cookie session là token mới, không lưu lại token gốc trong trình duyệt.
- `POST /api/v1/auth/register` `{companyName,name,email,password}` tạo tenant, owner và kho mặc định; `POST /api/v1/auth/login` `{email,password}` đăng nhập tài khoản.
- `GET /api/v1/auth/me` xác minh phiên và trả về người dùng, doanh nghiệp cùng quyền quản lý tài khoản.
- `POST /api/v1/auth/password` nhận `{currentPassword,newPassword}`; server xác minh mật khẩu hiện tại, lưu hash mới, thu hồi các phiên cũ và cấp lại cookie cho phiên hiện tại.
- `GET /api/v1/auth/users`, `POST /api/v1/auth/users` và `PATCH /api/v1/auth/users/:id` quản lý nhân viên, chỉ owner/admin được phép. Danh sách trả `lastActivityAt` và `isOnline`; online nghĩa là tài khoản chưa khóa, còn phiên hợp lệ và có yêu cầu API trong 5 phút gần nhất.
- `GET /api/v1/auth/users/:id/activity` trả tối đa 100 lần đăng nhập và thao tác đã ghi vào audit log của đúng nhân viên; chỉ owner/admin cùng tenant được phép. Tài khoản khác tenant trả 404.
- `GET /api/v1/auth/permissions` trả danh mục thao tác và quyền mặc định theo vai trò cho owner/admin; `PATCH /api/v1/auth/users/:id/permissions` nhận `{overrides:[{permission,granted}]}` với `granted` là `true`, `false` hoặc `null` để khôi phục mặc định vai trò. Quyền tùy chỉnh được kiểm tra trong API và thay đổi sẽ thu hồi phiên cũ.
- `POST /api/v1/auth/users/:id/password` cho owner/admin đặt mật khẩu mới cho nhân viên; hệ thống lưu hash scrypt và thu hồi phiên cũ. Không thể đặt lại mật khẩu owner hoặc tài khoản admin khác.
- `GET /api/v1/auth/login-events` trả tối đa 100 lần đăng nhập gần nhất của tenant cho owner/admin. Email thử đăng nhập được lưu dưới dạng SHA-256; địa chỉ mạng và User-Agent được giới hạn độ dài.
- `DELETE /api/v1/auth/session` → thu hồi phiên hiện tại. Mutation dùng cookie yêu cầu Origin hợp lệ. API/service integration có thể dùng `Authorization: Bearer <token>`.
- `GET /api/v1/health` chỉ trả trạng thái module, không trả dữ liệu doanh nghiệp.
- Không cho client chọn tenant/role bằng header/body/query. Đổi doanh nghiệp bằng phiên khác được cấp quyền.
- Mọi phản hồi `Cache-Control: no-store`. Lỗi `{error:{code,message}}`; không gửi SQL/stack/secret tới client. Validation nghiệp vụ có thể trả 422; tranh chấp trả 409. Body tối đa 256 KiB; login giới hạn 10 lần/phút/IP trong một process.

## Đọc dữ liệu

`GET /api/v1/inventory/snapshot` → `{tenant,actor,permissions,warehouses,locations,suppliers,skus,balances,documents,purchaseRequests,purchaseOrders,ledger,reservations,counts,serials,warranties,auditEvents,metrics,pagination}`. Staff chỉ nhận các yêu cầu do mình tạo; quản lý xem yêu cầu cùng tenant; kế toán xem đề xuất dưới dạng đơn mua chờ duyệt.

Query `warehouseId`, `skuId`, `ledgerLimit` (1–1000, mặc định 200), `beforeSequence` (nguyên dương) **chỉ lọc/phân trang ledger**. Dùng `pagination.nextBeforeSequence` cho trang sau; không lặp tham số. Snapshot master/balance và metrics vẫn toàn doanh nghiệp. Bộ lọc kho/nhóm/tìm kiếm/thời gian trong UI lọc cục bộ các bảng đã nạp; thời gian không biến tồn hiện tại thành tồn lịch sử. Biểu đồ/gợi ý toàn doanh nghiệp có kỳ cố định 30 ngày UTC, không nhận bộ lọc bảng và không suy ra doanh số từ xuất kho vật lý.

Balance ghi nhận onHand, reserved, damaged, warranty, available (`onHand-reserved-damaged-warranty`), inventoryValue. Giá trị tồn từ chi phí nhập thực tế và bình quân theo vị trí, không dùng giá bán. Transfer đang đi có quantity/value riêng; chưa nằm trong tồn kho đích. Ledger mặc định 200 dòng mới nhất; audit 100 dòng mới nhất. Analytics backend tổng hợp toàn bộ ledger, không dùng 200 dòng hiển thị để tính tốc độ xuất. Dữ liệu UI này chưa phải báo cáo lịch sử đầy đủ hoặc API export.

## Ghi nghiệp vụ

`POST /api/v1/inventory/commands` body `{action,input}`, header `Idempotency-Key` chuỗi 8–128 ký tự. Cùng key + cùng user/action/payload không thực thi lại; dùng key khác cho một nghiệp vụ mới. Khi timeout/mất kết nối, thử lại **cùng key**, không tự đổi key. Cùng key khác nội dung trả 409. Kết quả là full snapshot và `result.id` của thực thể vừa thao tác.

| Action                                        | Input chính                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| warehouse.create/update                       | code, name, address?, active?; update cần id                                                                                  |
| location.create                               | warehouseId, code, name                                                                                                       |
| supplier.create/update                        | code, name, phone?, email?, address?, active?; update cần id                                                                  |
| sku.create/update                             | sku, name, category?, unit?, price?, serialTracked?, reorderPoint?, maxStock?, leadTimeDays?, cost?, metadata?; update cần id |
| sku.import                                    | warehouseId, rows (1–500 sản phẩm; quantity/cost tùy chọn)                                                                    |
| document.create                               | type, warehouseId, targetWarehouseId? (transfer), supplierId?, reference?, reason?, returnToStock?, sourceDocumentId?, lines  |
| document.approve/post/cancel/transfer_receive | id                                                                                                                            |
| reservation.create                            | warehouseId, locationId?, skuId, quantity, reference                                                                          |
| reservation.release                           | id                                                                                                                            |
| purchaseRequest.create                        | warehouseId, sourceReference?, note?, lines: `{skuId,requestedQuantity}`                                                      |
| purchaseOrder.create                          | warehouseId, supplierId, reference?, note?, lines: `{skuId,quantity,unitCost,locationId?}`, restockRequestId?                  |
| purchaseOrder.approve/cancel                  | id; chỉ accountant mặc định được approve                                                                                      |
| purchaseOrder.receive                         | id, lines: `{purchaseOrderLineId,quantity,serialNumbers?}`; manager chỉ nhận đơn đã duyệt                                     |
| count.create                                  | warehouseId, name                                                                                                             |
| count.record                                  | id, lines: skuId, locationId?, countedQuantity, unitCost?                                                                     |
| count.approve                                 | id                                                                                                                            |
| warranty.create                               | serialId, customerName, issue                                                                                                 |
| warranty.transition                           | id, status, note                                                                                                              |
| quality.reclassify                            | warehouseId, locationId?, skuId, from, to, quantity, reason, serialNumbers?                                                   |
| salesOrder.create                             | warehouseId, customerReference, reference?, note?, lines: `{skuId,quantity,locationId?}`                                      |
| salesOrder.confirm/cancel/fulfill/return      | id; cancel/return cần reason; fulfill/return nhận lines theo nghiệp vụ                                                        |
| config.update                                 | config (chỉ owner/admin; chỉ cấu hình backend hỗ trợ)                                                                         |

`document.create.lines`: `{skuId,quantity,unitCost?,locationId?,targetLocationId?,serialNumbers?}`. Quantity nguyên dương; adjustment cho phép âm, cần lý do. Receipt/adjustment tăng bắt buộc unitCost được nhập rõ; 0 là giá vốn miễn phí được nhập có chủ đích. Bỏ locationId dùng vị trí mặc định của kho. SKU quản serial cần đúng số serial riêng biệt cho từng thiết bị, không suy đoán serial khi kiểm kê.

Luồng thiếu hàng: nhân viên tạo yêu cầu tại tab **Đơn mua hàng** trong Kho, không tạo từ hội thoại. `purchaseRequest.create` chỉ nhận SKU thuộc tenant và chỉ khi tồn khả dụng tại kho thấp hơn tổng số lượng cần có đã nhập. Manager tạo `purchaseOrder.create` với `restockRequestId`; đơn phải cùng kho và bao gồm đủ các mặt hàng/số lượng được yêu cầu, kèm nhà cung cấp và giá vốn. Accountant duyệt bản nháp; người lập không thể tự duyệt. Manager chỉ tạo phiếu nhận sau khi đơn đã duyệt; lượng tồn chỉ tăng khi phiếu nhận được duyệt và ghi sổ. Đơn mua tạo độc lập vẫn được phép cho quản lý.

Trang Sản phẩm cho phép tạo một SKU kèm tồn đầu kỳ hoặc nhập danh sách bằng mẫu XLSX. `sku.import` tạo SKU và ghi tồn đầu kỳ qua phiếu nhập đã duyệt/ghi sổ trong cùng transaction; lỗi một dòng sẽ rollback toàn bộ. Giá vốn bắt buộc nếu quantity lớn hơn 0. Mẫu Excel giới hạn 500 dòng, từ chối SKU trùng, không ghi đè SKU hiện có.

Đơn bán ở `/orders` và tạo nhanh từ Inbox dùng SKU đang kinh doanh có giá bán đã thiết lập trong danh mục kho. `salesOrder.create` lấy giá trực tiếp từ database theo tenant; client không được quyết định giá. Nếu payload cũ có `unitPrice`, giá phải khớp giá kho hiện tại nếu không API trả `PRICE_MISMATCH`; không có giá bán trả `PRICE_NOT_SET`. Đơn tạo ở trạng thái nháp, xác nhận giữ toàn bộ lượng hàng trong transaction, hủy giải phóng lượng giữ, xuất kho ghi phiếu issue và nhận trả gắn với chứng từ xuất gốc. Đơn bán chưa lưu thông tin thanh toán/vận đơn của adapter Orders Demo cũ.

Hàng trả: receipt bật `returnToStock:true`, bắt buộc `sourceDocumentId` là phiếu issue đã posted cùng tenant, `reference` và `reason`. Backend đối chiếu lượng còn được nhận trả và giá vốn gốc; unitCost phải khớp giá vốn xuất, không nhập theo giá bán hiện tại. Serial phải thuộc phiếu xuất đó và chưa nhập trả; không dùng nghiệp vụ này để hồi sinh serial đã thanh lý qua adjustment âm. Migration 003 giữ provenance từng serial và liên kết receipt → issue.

`quality.reclassify` chuyển giữa `available`, `damaged`, `warranty`, không đổi tổng onHand/giá trị; append ledger có quantity=0 và qualityQuantity/from/to cùng audit lý do. Hàng giữ chỗ không thể chuyển thành lỗi/bảo hành. SKU serial cần danh sách serial chính xác. Bảo hành thiết bị đang trong kho chỉ được tiếp nhận sau khi cách ly sang warranty; tiếp nhận hồ sơ không tự đổi hàng lỗi thành hàng bán được.

`config.update` chỉ chấp nhận `inventoryEnabled` boolean, `multiWarehouseEnabled` boolean, `staleDays` nguyên 1–3650. Defaults true/true/90. Không chấp nhận cấu hình âm kho chưa hỗ trợ. Khi module tắt chỉ owner/admin đọc snapshot và bật lại; thao tác kho bị chặn. Tắt nhiều kho bị chặn nếu còn nhiều kho hoạt động hoặc chuyển kho chưa xong. Chưa có version/config UI và bộ quy trình tùy biến hoàn chỉnh.

Ví dụ nhập (ID lấy từ snapshot, không dùng ID minh họa cho yêu cầu thật):

```json
{
  "action": "document.create",
  "input": {
    "type": "receipt",
    "warehouseId": "<warehouse-id>",
    "reference": "PO-2026-001",
    "lines": [{ "skuId": "<sku-id>", "quantity": 10, "unitCost": 100000 }]
  }
}
```

Luồng: tạo draft → document.approve → document.post. Transfer post xuất nguồn và giữ transit; transfer_receive mới tăng kho đích. Không hủy phiếu đã ghi sổ. Chứng từ bù/adjustment phải có lý do và reference tới nghiệp vụ gốc. Reservation thông thường không phải phiếu xuất và không làm giảm onHand. Đơn bán là workflow riêng: fulfillment tiêu thụ lượng giữ, tạo/ghi sổ phiếu xuất và cập nhật trạng thái trong transaction.

## Kiểm tra và giới hạn

`npm run test:inventory`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Không gọi dữ liệu thao tác thử là số liệu Lumi/market thật. Theo dõi các yêu cầu chưa hoàn thành trong [roadmap](IMPLEMENTATION_ROADMAP.md), không dùng bản này để xác nhận đã hoàn tất toàn bộ Giai đoạn 1.
