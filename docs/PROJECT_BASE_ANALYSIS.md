# Đánh giá base SmartSales trước khi triển khai dự án chính thức

**Ngày khảo sát:** 23/11/2026  
**Mục tiêu:** Xác định phần có thể kế thừa, phần đang trùng lặp, khoảng trống nghiệp vụ/kỹ thuật và trình tự thực tế để đưa base hiện tại thành một hệ thống có thể vận hành với dữ liệu thật.

> Đây là đánh giá mã nguồn và tài liệu trong repository, không phải chứng nhận bảo mật, nghiệm thu kế toán, kiểm thử tải hay xác nhận đã triển khai production. Chỉ những chức năng có code/API hiện tại mới được xem là đã có; bản thiết kế và UI cấu hình không chứng minh tích hợp thật.

## 1. Kết luận ngắn

Base hiện tại **không cần làm lại từ đầu**. Nó đã có một nền tảng Live khá đáng kể: React/TypeScript, API Node.js, SQLite nhiều tenant, đăng nhập/role, kho có giao dịch và ledger, yêu cầu nhập hàng/đơn mua, đơn bán liên kết kho, cùng một số API CRM/Inbox/CSKH/vận đơn.

Nhưng đây **chưa phải hệ thống sẵn sàng chạy chính thức**. Các điểm cản lớn nhất:

1. Cấu hình cổng API không thống nhất: server và Vite proxy đang dùng `3002`, trong khi `.env.example`, README và hướng dẫn API vẫn ghi `3001`.
2. Hai mô hình đơn hàng đang cùng tồn tại: đơn vận hành cũ có thanh toán/vận đơn nội bộ; đơn bán mới của Kho có giữ/xuất/trả và liên kết tồn. Chưa có một vòng đời duy nhất, đầy đủ và được đối soát.
3. Tích hợp sàn/vận chuyển còn thiếu; màn hình cấu hình hoặc kiểm tra credentials không đồng nghĩa đã đồng bộ đơn, tồn, tin nhắn hay giao hàng thật.
4. Sổ kế toán mới là nền tảng ghi/đảo bút toán thủ công; chưa tự sinh bút toán từ bán hàng, thu tiền, nhập kho, giá vốn, thuế và chi phí.
5. SQLite phù hợp môi trường thử nghiệm/pilot một máy chủ có ổ bền vững, nhưng không đáp ứng nhiều API replica ghi độc lập, HA hay tăng tải không giới hạn.
6. Các tài liệu kiến trúc/roadmap có chỗ lỗi thời hoặc mâu thuẫn với code hiện tại; cần một nguồn trạng thái được cập nhật trước khi giao việc tiếp.

**Đề xuất:** Chốt phạm vi MVP theo một quy trình kinh doanh cụ thể, hoàn thiện luồng **SKU → mua/nhập → bán/giữ → xuất/giao → thu/hoàn → đối soát**, sau đó mới đầu tư đồng bộ đa kênh và AI. Không đưa dữ liệu thật vào demo hoặc xem sổ cái hiện tại là phần mềm kế toán hoàn chỉnh.

## 2. Cái gì đang có trong base

| Phân hệ/nền tảng | Trạng thái thấy trong code | Có thể kế thừa | Chưa nên tuyên bố |
|---|---|---|---|
| Giao diện | React 19, TypeScript, Vite, router, VI/EN, nhiều trang nghiệp vụ | Component, form, phân quyền hiển thị, test UI | Rằng mọi màn đã nghiệm thu trên máy thật/mobile |
| API | Node.js built-in HTTP server, `/api/v1`, cùng server phục vụ auth, kho, vận hành, kế toán, market và integrations | Routing/service hiện có, validation, API tests | Rằng đã có hệ thống triển khai/giám sát production |
| Cơ sở dữ liệu | SQLite `node:sqlite`, migration SQL, WAL, foreign keys, `BEGIN IMMEDIATE`, checksum migration | Schema/migration làm nền cho một deployment đơn máy chủ | HA, multi-writer, nhiều API replica cùng ghi một DB |
| Tài khoản | Đăng ký tenant/owner, đăng nhập, cookie HttpOnly, quản lý nhân viên, role preset và permission override | Auth hiện có, tenant context, quyền server-side | SSO, quyền theo từng kho, workflow mời người dùng/duyệt tài khoản đầy đủ |
| Kho | Warehouse/location/SKU, chứng từ, ledger, số dư, kiểm kê, reservation, serial/quality/warranty, idempotency | Nền nghiệp vụ mạnh nhất, có server và test | Hệ thống WMS đầy đủ: lot/expiry/picking/barcode/định tuyến kho/phân quyền theo vị trí |
| Mua hàng | Supplier, yêu cầu bổ sung, đơn mua, duyệt tách vai trò, nhận từng phần theo đơn | Luồng mua-nhận cơ bản và kiểm quyền | Công nợ nhà cung cấp, điều khoản thanh toán, thuế/hóa đơn, chi phí mua phân bổ, đổi trả NCC |
| Đơn bán | `salesOrder.*` trong Kho hỗ trợ tạo/giữ/hủy/xuất/trả | Xử lý tồn nguyên tử và API giá theo SKU | Toàn bộ vòng đời bán hàng, thanh toán, hoàn tiền, thuế, nhiều phương thức giao hàng |
| CRM/Inbox/CSKH | Có API Live cho khách hàng, hội thoại, profile, ticket; Telegram có đường tích hợp riêng | Danh tính khách hàng, ghi chú, phân công/ticket cơ bản | Hộp thư đa kênh thật nếu chưa nối từng provider và xác minh quyền API |
| Vận chuyển | Có bản ghi shipment và timeline thủ công/adapter mô phỏng | Theo dõi nội bộ, trạng thái và giao diện | Tạo vận đơn, phí, tracking webhook hoặc đối soát COD từ hãng vận chuyển |
| Báo giá | Catalog kho và tạo PDF cục bộ trên trình duyệt | Quy tắc tính tiền, PDF, chọn SKU | Lưu báo giá server, gửi khách, phê duyệt, chuyển báo giá thành đơn |
| Kế toán | Chart of accounts, trial balance, journal thủ công, đảo bút toán, phê duyệt mua | Ledger kép nội bộ, quyền đọc/ghi và audit | Sổ sách tuân thủ một chế độ kế toán, hóa đơn thuế, tự động hạch toán, báo cáo kê khai |
| Phân tích thị trường | Gemini + Google Search grounding theo yêu cầu, lưu lịch sử tenant, trả tóm tắt | MVP nghiên cứu câu hỏi tự do | “Tra tất cả web”, dữ liệu thị trường đã kiểm toán, lịch chạy/quota/chi phí hoặc so sánh giá tin cậy |
| Báo cáo | Dashboard và một số số liệu vận hành; `/reports`/kế toán có phần đang mở rộng | Chỉ số hiện có nếu định nghĩa được xác nhận | Report builder, phân tích liên phân hệ chuẩn, doanh thu đã thu hay lợi nhuận kế toán |
| Triển khai | CI kiểm tra format/lint/test/build; Vercel build riêng mode Demo | Pipeline chất lượng và demo frontend | API Live production, database persistence/backup, staging, rollback và on-call |

### Phân biệt Demo và Live

- `VITE_APP_MODE=demo` dùng dữ liệu trình duyệt/localStorage; dữ liệu này chỉ phù hợp trình diễn hoặc test, không phải nguồn dữ liệu doanh nghiệp.
- Live mode gọi API; nhiều luồng cốt lõi hiện đã có API và không nên mô tả toàn bộ CRM/Orders là “chỉ Demo”.
- Vercel đang build bằng `build:vercel` với mode `demo`; triển khai Vercel hiện là frontend demo, **không phải** triển khai backend/database Live.
- Không chuyển dữ liệu Demo sang Live bằng cách đổi mode. Cần mapping, làm sạch, đối soát và nhập thử có kiểm soát.

## 3. Quy trình kinh doanh đầu-cuối: trạng thái hiện tại

| Bước | Luồng mục tiêu | Base hiện tại và khoảng trống |
|---|---|---|
| 1. Khởi tạo doanh nghiệp | Tạo tenant, tài khoản owner, kho, chính sách và người dùng | Đã có đăng ký tenant, tài khoản và một số cấu hình. Cần xác nhận ai được tự đăng ký, mời nhân viên và phê duyệt tài khoản khi vận hành thật. |
| 2. Danh mục | Import SKU, đơn vị, giá bán, giá vốn, nhà cung cấp, trạng thái | Có SKU cơ bản và nhập danh sách. Chưa có catalog sản phẩm/variants/thuộc tính động; cần chốt mã SKU, đơn vị, giá và xử lý trùng trước khi import thật. |
| 3. Số dư mở đầu | Kiểm kê thực tế, ghi nhận tồn và giá vốn ban đầu | Có nghiệp vụ nhập/điều chỉnh, nhưng cần quy trình cutover và người duyệt; không lấy tồn từ Demo hoặc `localStorage`. |
| 4. Đề nghị mua | Thiếu hàng → gửi yêu cầu → manager lập PO → accountant duyệt → manager nhận | Luồng nghiệp vụ đã có. Cần nghiệm thu quyền theo vai trò, nhà cung cấp, giá vốn, nhận thiếu/thừa, hủy và đối chiếu chứng từ thực tế. |
| 5. Bán hàng | Báo giá/đơn → kiểm tra giá → giữ hàng → xác nhận | Đơn bán trong Kho hỗ trợ giữ hàng; báo giá PDF hiện không lưu và không chuyển thành đơn. Cần thống nhất đơn nào là đơn chính. |
| 6. Xuất và giao | Soạn hàng → phiếu xuất → giao hãng → cập nhật tracking | Kho có xuất; vận đơn hiện chưa phải kết nối hãng thực. Timeline nội bộ không phải bằng chứng giao thành công. |
| 7. Thu tiền/hoàn tiền | Ghi nhận giao dịch thanh toán/refund và đối soát | Đơn vận hành cũ có trạng thái thanh toán mô phỏng; đơn bán kho chưa bao phủ giao dịch thanh toán. Cần payment ledger và đối soát thực trước khi ghi nhận doanh thu/tiền. |
| 8. Đổi trả/bảo hành | RMA, nhận trả theo đơn/phiếu xuất, phân loại chất lượng, hoàn tiền | Kho có nhận hàng trả và serial/quality; chưa có RMA toàn diện nối yêu cầu khách, tình trạng giao hàng, hoàn tiền và trách nhiệm NCC. |
| 9. Kế toán | Tự động hạch toán chứng từ đã kiểm soát và đối chiếu | Có sổ cái thủ công. Chưa có mapping nghiệp vụ → journal; chưa đối chiếu tiền, giá vốn, thuế, công nợ hay hệ thống hóa đơn. |
| 10. Báo cáo | Báo cáo đúng kỳ, quyền, tiền tệ, nguồn và thời điểm dữ liệu | Có dashboard cơ bản, nhưng thiếu read model/snapshot lịch sử và báo cáo tài chính được kế toán xác nhận. |
| 11. Kênh và AI | Nhận đơn/tin từ kênh; nghiên cứu có nguồn và kiểm soát chi phí | Telegram/Gemini có phạm vi hẹp; kết nối sàn khác chưa đồng nghĩa đồng bộ; AI là gợi ý, cần người kiểm tra. |

## 4. Cái gì nên giữ, cái gì đang dư/trùng

### Nên giữ và phát triển

- Backend kho với transaction, ledger bất biến, idempotency, kiểm quyền ở server và migration có checksum.
- Auth/tenant hiện có làm nền cho pilot; tiếp tục kiểm tra tenant isolation bằng test.
- Service boundary giữa UI và API, xử lý lỗi rõ ràng, không fallback Live sang Demo.
- Các bộ test backend/frontend và CI; giữ chúng như gate bắt buộc cho thay đổi nghiệp vụ.
- Giao diện nhập liệu, báo giá/PDF và các luồng phân quyền nếu được người dùng nghiệp vụ xác nhận.

### Đang trùng hoặc cần hợp nhất trước khi mở rộng

1. **Hai loại đơn hàng:** `operations.orders` và `inventory.salesOrders` không cùng dữ liệu/vòng đời. Có nguy cơ một đơn nằm ở một phân hệ nhưng tồn, giao hàng hoặc thanh toán nằm ở phân hệ còn lại.
2. **Hai khái niệm hàng hóa/tồn:** Product/SKU của vận hành cũ và SKU/balance/ledger của Inventory. Chỉ Inventory được là nguồn tồn chuẩn; không tiếp tục cập nhật stock ở một hệ thống thứ hai.
3. **Demo localStorage và dữ liệu Live:** hai nguồn có ID và chính sách lưu khác nhau. Không tự đồng bộ hay hợp nhất ngầm; Demo phải được cô lập khỏi tenant thật.
4. **Tài liệu trạng thái:** một số tài liệu cũ nói các module chỉ có adapter Demo hoặc Reports còn là placeholder, trong khi API Live đã mở rộng. Các tài liệu khác lại mô tả tương lai như đã chạy. Cần chuẩn hóa nhãn “đang chạy / một phần / thiết kế”.
5. **UI kết nối nhiều kênh:** danh sách kênh hoặc form nhập credentials không phải là connector hoàn chỉnh. Không quảng bá kênh chưa có OAuth/webhook/import/outbound thực như tính năng đã tích hợp.

### Có thể để sau, không làm trong MVP đầu

- Catalog động theo mọi ngành, custom-module engine và cấu hình workflow tổng quát.
- Report builder tự do, AI reporting, tự động lịch nghiên cứu, dự báo nhu cầu và tự đặt hàng.
- Mở cùng lúc nhiều hãng vận chuyển, nhiều marketplace và mọi loại chat.
- Tối ưu nhiều replica/HA trước khi chốt tải thực tế; nhưng phải chọn phương án DB/hosting trước khi dữ liệu production tăng.
- Nhập toàn bộ dữ liệu Demo/seed như dữ liệu khởi đầu của doanh nghiệp.

## 5. Các giả định chưa thực tế

1. **“Gemini tra tất cả nguồn trên web.”** Search grounding không bao phủ toàn Internet; phụ thuộc index/quyền truy cập, vùng, truy vấn và thời điểm. Kết quả là bản phân tích hỗ trợ quyết định, không phải nghiên cứu đầy đủ hay xác minh độc lập.
2. **“Kết nối sàn là đồng bộ hoàn chỉnh.”** Credentials có thể được lưu/kiểm tra nhưng OAuth, token refresh, webhook, phân trang, đối soát SKU/đơn, retry và xử lý sự cố phải có riêng cho từng provider.
3. **“Có trạng thái đã giao/đã thanh toán là tiền đã về.”** Chỉ giao dịch từ hãng/đơn vị thanh toán và đối soát mới chứng minh thu tiền; trạng thái nội bộ hoặc mock không phải sao kê.
4. **“Có sổ cái là phần mềm kế toán.”** Chưa có posting tự động, mapping tài khoản được kế toán phê chuẩn, thuế, công nợ, hóa đơn, closing/reconciliation và tuân thủ chế độ áp dụng.
5. **“SQLite + WAL là nhiều máy chủ/HA.”** WAL giúp concurrency trên cùng file/database host, không biến file DB thành cơ sở dữ liệu phân tán hoặc multi-writer.
6. **“Tồn hiện tại đủ để báo cáo lịch sử.”** Balance hiện tại không tái tạo được lịch sử nếu thiếu snapshot/ledger chính xác, valuation policy hoặc thời điểm hiệu lực. Thời điểm tạo đơn cũng không phải thời điểm ghi nhận doanh thu/giao hàng.
7. **“Multi-tenant nghĩa là đã sẵn sàng SaaS.”** Tenant scope là nền tảng quan trọng, nhưng vận hành SaaS còn cần onboarding, quota, billing, support, retention, tenant export/delete, incident response và chính sách vận hành.
8. **“Một bộ quyền dùng cho mọi kho/doanh nghiệp.”** Role preset và override theo người dùng chưa tương đương quyền theo warehouse/location, ca làm, hạn mức duyệt hay phân tách nhiệm vụ đầy đủ.
9. **“Có test là đã nghiệm thu UI và vận hành.”** CI có format/lint/test/build, nhưng không thay cho QA trên môi trường triển khai, thử restore backup, test tải, đo SLA và nghiệm thu người dùng.

## 6. Việc phải xử lý trước khi dùng dữ liệu thật

### P0 — Trước pilot với khách hàng/đơn hàng thật

- [ ] **Sửa lệch port:** [server/index.mjs](../server/index.mjs) mặc định nghe `3002`, [vite.config.ts](../vite.config.ts) proxy `3002`; `.env.example`, README và [inventory-api.md](inventory-api.md) còn ghi `3001`. Chọn một giá trị chuẩn và cập nhật toàn bộ để hướng dẫn chạy không làm frontend gọi nhầm API.
- [ ] Chốt MVP và một nguồn chuẩn cho khách hàng, SKU, tồn, đơn hàng, thanh toán, vận đơn và trạng thái trả hàng.
- [ ] Quy định onboarding: ai được tạo tenant, xác minh owner, mời/khóa nhân viên, đặt lại mật khẩu, thu hồi phiên và cấp quyền.
- [ ] Chọn nơi chạy API và dữ liệu bền vững; cấu hình HTTPS/reverse proxy, origin allowlist, secure cookie, secret storage, log và cảnh báo.
- [ ] Backup SQLite tự động, kiểm tra tính toàn vẹn và **diễn tập restore** trên môi trường riêng; xác định RPO/RTO và người chịu trách nhiệm.
- [ ] Quy trình nhập dữ liệu thật: chuẩn hóa SKU/khách/NCC, phát hiện trùng, mapping ID, kiểm tra số dư mở đầu, ký duyệt và đối soát tổng số lượng/giá trị.
- [ ] Kiểm tra RBAC theo ma trận vai trò và phân tách nhiệm vụ thực tế; xác minh API chặn đúng, không chỉ ẩn menu.
- [ ] Xác định chính sách dữ liệu cá nhân: dữ liệu nào được lưu, ai truy cập, thời hạn lưu, xử lý yêu cầu xóa/xuất, quyền gửi dữ liệu tới Gemini/Telegram.
- [ ] Xác định nghiệp vụ bán hàng thật: thu tiền, COD, hoàn tiền, thuế, chiết khấu, phí giao hàng, đổi trả và các mốc hạch toán.

### P1 — Trước khi mở rộng quy mô

- [ ] Hợp nhất đơn hàng cũ và đơn bán kho hoặc thiết kế migration/bridge có chủ sở hữu rõ.
- [ ] Hoàn thiện phân trang/filter server cho snapshot lớn, giới hạn payload, retention và export có quyền.
- [ ] Thiết kế idempotency nhất quán cho mọi command có retry, webhook và kết nối ngoài.
- [ ] Bổ sung observability: request ID, metrics, error tracking, health/readiness, log an toàn, cảnh báo DB/dung lượng/queue và hướng dẫn xử lý sự cố.
- [ ] Chạy thử tải trên quy mô dự kiến; quyết định ở lại SQLite single-writer hay chuyển PostgreSQL trước khi thêm nhiều API replica.
- [ ] Thêm migration rehearsal, backup trước migration, phương án rollback có kiểm chứng và quy trình nâng cấp không mất dữ liệu.
- [ ] Manual QA desktop/mobile, bàn phím, quyền truy cập, lỗi mạng/timeouts, browser refresh và session expiry.

### P2 — Sau khi MVP vận hành ổn định

- [ ] Tích hợp từng marketplace/carrier/payment provider bằng credential chính thức, sandbox, webhook, token refresh và đối soát.
- [ ] Catalog product/variant/attribute và import workflow theo dữ liệu ngành thực.
- [ ] Báo cáo lịch sử có định nghĩa chỉ số, snapshot/as-of, quyền và dữ liệu kế toán đã đối soát.
- [ ] Nghiên cứu thị trường/AI có quota, chi phí, giới hạn nguồn, đánh giá chất lượng, audit và quy trình người duyệt.
- [ ] SSO, quyền theo kho, tổ chức đa chi nhánh, workflow/approval nâng cao nếu quy mô thực sự yêu cầu.

## 7. Trình tự làm dự án chính thức từ đầu đến cuối

### Giai đoạn 0 — Chốt bài toán trước khi sửa code

Tổ chức workshop với chủ doanh nghiệp, kho, bán hàng, mua hàng, kế toán và người quản trị. Viết luồng hiện tại, ngoại lệ, người chịu trách nhiệm và số liệu cần xuất. Chốt phạm vi MVP, tiêu chí đạt, quy mô ban đầu, ngân sách, SLA, chính sách dữ liệu và các provider bắt buộc.

**Đầu ra:** business process map; role/permission matrix; glossary dữ liệu; danh sách tích hợp bắt buộc; bộ acceptance criteria; quyết định MVP/ngoài MVP.

### Giai đoạn 1 — Chuẩn hóa base và quyết định kiến trúc

1. Sửa lệch port, env, hướng dẫn chạy và tài liệu trạng thái.
2. Vẽ sơ đồ entity/luồng thật từ code, tập trung `operations.orders` so với `inventory.salesOrders`.
3. Chọn nguồn chuẩn cho Customer, Product/SKU, Stock, Order, Payment, Shipment, Journal.
4. Chốt deployment: một máy chủ SQLite bền vững cho pilot có điều kiện, hoặc PostgreSQL nếu cần HA/replica/tải ghi lớn.
5. Tạo môi trường dev/test/staging/prod, secrets riêng từng môi trường, seed Demo tách biệt và migration policy.

**Gate:** môi trường staging khởi động được từ hướng dẫn sạch; health check đúng API; không có cấu hình Demo vô tình dùng với tenant thật.

### Giai đoạn 2 — Dữ liệu nền và kho

1. Chuẩn hóa/import kho, location, SKU, đơn vị, giá bán, giá vốn, NCC.
2. Kiểm kê, xác nhận số dư mở đầu và giá trị tồn theo chính sách được duyệt.
3. Chạy nhập, xuất, điều chuyển, kiểm kê, serial/quality theo các trường hợp thật.
4. Chạy luồng yêu cầu bổ sung → PO → kế toán duyệt → nhận từng phần; thử thiếu quyền, sai giá, hủy, retry và lỗi giữa chừng.
5. Đối chiếu ledger, balance, audit và chứng từ nguồn sau mỗi case.

**Gate:** người phụ trách kho ký xác nhận số lượng; kế toán xác nhận chính sách giá vốn/số dư; test không âm kho/không ghi hai lần.

### Giai đoạn 3 — Bán hàng và thực hiện đơn

1. Chọn một mô hình Order chính; giữ lại hoặc archive mô hình cũ sau khi mapping và migration được kiểm thử.
2. Xác nhận catalog/giá/khuyến mãi/chiết khấu/thuế/phí và thời điểm chụp giá.
3. Hoàn chỉnh đơn nháp → xác nhận/giữ → soạn → xuất → giao; xử lý thiếu hàng/điều chuyển/partial fulfillment.
4. Thêm payment/refund event từ nhà cung cấp thực hoặc quy trình ghi nhận có chứng từ; không tự suy diễn đã thu từ trạng thái giao.
5. Hoàn thiện return/RMA nối đơn, phiếu xuất, tình trạng hàng và hoàn tiền.

**Gate:** retry không tạo đơn/phiếu/thu tiền trùng; đối soát được từng đơn từ yêu cầu đến tồn và thanh toán.

### Giai đoạn 4 — Tích hợp kênh, theo từng provider

Triển khai từng connector theo thứ tự ưu tiên kinh doanh, không bật tất cả cùng lúc. Với mỗi provider cần: app approval/quyền được cấp, OAuth/callback hoặc credential flow, token refresh/rotation, import/export, webhook signature, pagination/cursor, dedupe, retry/backoff, rate limit, mapping SKU/đơn/khách, chính sách lưu dữ liệu và dashboard sự cố.

**Gate:** test sandbox, thử giao dịch đầu-cuối có đối soát và tài liệu runbook cho token hết hạn, webhook mất, retry và sai mapping.

### Giai đoạn 5 — Kế toán và báo cáo

1. Kế toán xác nhận chế độ áp dụng, chart of accounts, kỳ, thuế, currency, phương pháp giá vốn và quy tắc cut-off.
2. Thiết kế mapping có version từ nguồn chứng từ sang journal; mỗi event có idempotency và liên kết ngược chứng từ.
3. Tích hợp bán, thu tiền, hoàn tiền, mua, nhận hàng, COGS, phí, thuế và điều chỉnh; hỗ trợ đảo bút toán, không sửa sổ đã ghi.
4. Đối soát tiền mặt/ngân hàng/COD, công nợ và tồn kho với nguồn ngoài.
5. Chỉ xây báo cáo chính thức từ ledger/read model đã đối soát; tách metric vận hành khỏi chỉ số kế toán.

**Gate:** kế toán/đơn vị tư vấn ký nghiệm thu số dư đầu kỳ, phát sinh và báo cáo mẫu; không dùng journal thủ công thay cho tích hợp khi thiếu kiểm soát.

### Giai đoạn 6 — Production readiness và phát hành

- Threat modeling/kiểm thử quyền, tenant isolation, session/cookie/CSRF/origin, rate limit, secret rotation và dependency review.
- Kiểm tra backup/restore, migration, rollback, mất DB/disk, hết dung lượng, provider outage và phục hồi sau sự cố.
- Load test theo số người dùng, SKU, orders/day, ledger growth và webhook peak đã chốt.
- Thiết lập alert, dashboard, log retention, audit review, on-call, SLA, incident response và release/rollback.
- Manual QA nghiệp vụ desktop/mobile và đào tạo role theo tài liệu thao tác.
- Pilot với một kho/nhóm người dùng và dữ liệu có đối soát; chỉ mở rộng khi chủ nghiệp vụ ký xác nhận.

### Giai đoạn 7 — Mở rộng sau pilot

Chỉ ưu tiên module dựa trên số liệu và vấn đề đã ghi nhận: nhiều kho, barcode/lot, catalog động, connector tiếp theo, report builder hoặc AI. Không làm cấu hình “mọi ngành/mọi workflow” trước khi có hai hoặc nhiều nhu cầu thực sự khác nhau.

## 8. Những quyết định nghiệp vụ còn thiếu

Trả lời các câu hỏi này trước khi thiết kế thêm schema hoặc hứa ngày hoàn thành:

- Dự án phục vụ một doanh nghiệp hay SaaS nhiều doanh nghiệp? Có chi nhánh/công ty con và dữ liệu cần tách đến mức nào?
- Loại đơn chính là đơn từ web/sàn, đơn nhân viên tạo, báo giá, hay tất cả? Đơn nào là nguồn chuẩn khi dữ liệu lệch?
- Kho có bao nhiêu kho/vị trí, cách phân quyền, kiểm kê, serial/lot/expiry và điều chuyển thực tế ra sao?
- Giá bán, giá vốn, tiền tệ, VAT/thuế, chiết khấu, COD, thanh toán một phần và hoàn tiền được tính theo quy tắc nào?
- Ai được yêu cầu mua, tạo PO, duyệt, nhận và sửa sai? Có hạn mức tiền hoặc cần nhiều cấp duyệt không?
- Hãng vận chuyển, marketplace, payment gateway nào **bắt buộc** trong MVP? Có app/API approval chưa?
- Dữ liệu khách hàng/tin nhắn nào cần lưu và bao lâu? AI/provider nào được phép nhận dữ liệu nào?
- Khối lượng ngày thường/đỉnh, số SKU, số người dùng đồng thời, uptime mục tiêu, RPO/RTO và ngân sách hosting?
- Ai chịu trách nhiệm vận hành database, backup, nâng cấp, sự cố provider, hỗ trợ người dùng và đối soát hàng ngày?

Nếu chưa có câu trả lời, nên giảm phạm vi sang pilot kho nội bộ thay vì xây đồng loạt tất cả phân hệ.

## 9. Tài liệu cần đồng bộ

Sau khi xác nhận trạng thái hệ thống, rà và cập nhật các tài liệu có nội dung lệch nhau:

- [README.md](../README.md): cổng API, lệnh chạy và ranh giới Demo/Live.
- [architecture.md](architecture.md), [SYSTEM_ANALYSIS.md](SYSTEM_ANALYSIS.md), [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md): mô tả module Live hiện tại, không giữ trạng thái cũ.
- [inventory-api.md](inventory-api.md): mặc định `INVENTORY_PORT`, ví dụ chạy và hành vi purchase/sales mới nhất.
- [DATABASE_DESIGN.md](DATABASE_DESIGN.md), [api-contract.md](api-contract.md), [operations-api.md](operations-api.md): phân biệt schema/endpoint thực thi với thiết kế tương lai và hai mô hình đơn hàng.
- [accounting-ledger.md](accounting-ledger.md), [AI_MARKET_INTELLIGENCE.md](AI_MARKET_INTELLIGENCE.md), [REPORTING_MODULE.md](REPORTING_MODULE.md): giữ rõ giới hạn chưa tích hợp/không được dùng làm số liệu đã xác minh.

Tài liệu này là đánh giá base tại ngày khảo sát, không thay thế hợp đồng API hoặc runbook triển khai.

## 10. Kết luận đề xuất

**Có thể bắt đầu dự án chính thức trên base này**, với điều kiện bắt đầu bằng chốt nghiệp vụ và một pilot giới hạn; không nên đưa ngay vào vận hành toàn bộ đa kênh/kế toán.

Thứ tự ưu tiên thực tế là: **sửa cấu hình/docs lệch → chốt nguồn dữ liệu và một vòng đời đơn → nghiệm thu kho/mua → hoàn thiện bán/giao/thu/trả → đối soát kế toán → tích hợp provider theo từng cái → production gate → mở rộng báo cáo/AI**.

Điểm mạnh của base là phần kho và giao dịch server-side đã vượt mức mockup. Điểm nguy hiểm nhất là nhìn vào nhiều menu/API rồi cho rằng toàn bộ chuỗi đã nối liền: hiện các module có mức hoàn thiện khác nhau, có mô hình cũ và mới song song, và một số trạng thái/tích hợp vẫn là mô phỏng hoặc thủ công.
