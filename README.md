# 🚀 SmartSales Suite – Nền Tảng Bán Hàng Đa Kênh, CRM & Phân Tích Thị Trường

> **SmartSales Suite** là hệ thống phần mềm quản trị toàn diện dành cho doanh nghiệp bán lẻ và thương mại điện tử hiện đại. Nền tảng kết hợp giữa **Hộp thư bán hàng đa kênh (Omnichannel Inbox)**, **Hệ thống Quản lý quan hệ khách hàng (CRM 360°)**, **Quy trình Quản lý Đơn hàng & Vận chuyển (Logistics GHTK)**, **Chăm sóc sau bán & Ticket hỗ trợ (Customer Care & SLA)**, và **Bảng điều khiển Xu hướng thị trường (Market Intelligence)** với sự hỗ trợ của trí tuệ nhân tạo (AI).

---

## 📌 Bảng Mục Lục

1. [Tổng Quan Dự Án](#-tổng-quan-dự-án)
2. [Kiến Trúc & Ngăn Xếp Công Nghệ (Tech Stack)](#-kiến-trúc--ngăn-xếp-công-nghệ-tech-stack)
3. [Các Tính Năng Trọng Tâm](#-các-tính-năng-trọng-tâm)
   - [1. Hộp Thư Bán Hàng Đa Kênh (Omnichannel Inbox)](#1-hộp-thư-bán-hàng-đa-kênh-omnichannel-inbox)
   - [2. Quản Trị Khách Hàng CRM 360°](#2-quản-trị-khách-hàng-crm-360)
   - [3. Quản Lý Đơn Hàng & Logistics (GHTK)](#3-quản-lý-đơn-hàng--logistics-ghtk)
   - [4. Trung Tâm Chăm Sóc Khách Hàng & Giám Sát SLA](#4-trung-tâm-chăm-sóc-khách-hàng--giám-sát-sla)
   - [5. Giả Lập Cuộc Gọi VoIP & Tương Tác Thời Gian Thực](#5-giả-lập-cuộc-gọi-voip--tương-tác-thời-gian-thực)
   - [6. Phân Tích Xu Hướng Thị Trường & Trợ Lý AI](#6-phân-tích-xu-hướng-thị-trường--trợ-lý-ai)
4. [Bảo Mật, Phân Quyền (RBAC) & Phạm Vi Dữ Liệu](#-bảo-mật-phân-quyền-rbac--phạm-vi-dữ-liệu)
5. [Cấu Trúc Thư Mục Dự Án](#-cấu-trúc-thư-mục-dự-án)
6. [Hướng Dẫn Khởi Chạy Nhanh (Quick Start)](#-hướng-dẫn-khởi-chạy-nhanh-quick-start)
7. [Tài Liệu Kỹ Thuật Đính Kèm](#-tài-liệu-kỹ-thuật-đính-kèm)

---

## 🌟 Tổng Quan Dự Án

Trong bối cảnh kinh doanh đa nền tảng, doanh nghiệp thường xuyên đối mặt với các vấn đề:
* Tin nhắn khách hàng phân mảnh giữa Facebook, Zalo, Website, TikTok, Email dẫn đến sót đơn, phản hồi chậm.
* Thiếu hồ sơ khách hàng tập trung để cá nhân hóa tư vấn và theo dõi giá trị vòng đời (LTV).
* Quy trình tạo đơn, tính phí vận chuyển và đẩy đơn sang bưu cục logistics tốn nhiều thao tác thủ công.
* Dịch vụ sau bán hàng (bảo hành, khiếu nại) không có cam kết thời gian xử lý (SLA) rõ ràng.

**SmartSales Suite** giải quyết toàn bộ các điểm nghẽn trên bằng một giao diện đĩa đơn (SPA) trực quan, tốc độ cao, hỗ trợ tự động hóa thông minh từ khâu tiếp cận khách hàng đến chăm sóc sau bán.

---

## 🛠 Kiến Trúc & Ngăn Xếp Công Nghệ (Tech Stack)

### Backend:
* **Ngôn ngữ & Runtime**: Node.js (v18+ LTS), Express.js.
* **Cơ sở dữ liệu**: Google Firebase Cloud Firestore & Realtime Database.
* **Bảo mật & Xác thực**: JSON Web Tokens (JWT) với cơ chế Token Family Rotation, HttpOnly Cookies, CORS, Helmet, Rate Limiter.
* **Tích hợp bên thứ ba**: Giao Hàng Tiết Kiệm (GHTK API v2), Facebook Graph API, Zalo OA API, Google Gemini AI.

### Frontend:
* **Giao diện**: Single Page Application (SPA) phát triển trên nền **React 18** và **Babel Standalone**.
* **Styling**: **Tailwind CSS 3** với giao diện thiết kế phẳng hiện đại, chuẩn SaaS cao cấp.
* **Biểu tượng**: Lucide Icons.
* **Chế độ hoạt động kép**: Tự động chuyển đổi giữa **Live API Mode** (kết nối Backend thật) và **Interactive Demo Simulation Mode** (giả lập đầy đủ luồng chat, gõ phím, gọi điện và tạo đơn).

---

## 🎯 Các Tính Năng Trọng Tâm

### 1. Hộp Thư Bán Hàng Đa Kênh (Omnichannel Inbox)
* **Bố cục 3 cột thông minh**:
  * **Cột 1**: Danh sách hội thoại phân loại theo kênh (Zalo OA, Facebook Messenger, Website LiveChat, WhatsApp, Email, TikTok Shop), hỗ trợ lọc "Của tôi" / "Chưa phân công" và đếm số tin chưa đọc.
  * **Cột 2**: Luồng tin nhắn thời gian thực. Hỗ trợ gửi tin nhắn, đính kèm file, mẫu trả lời nhanh (Quick Responses), và **Gợi ý câu trả lời tự động bằng AI**.
  * **Cột 3**: Thẻ tóm tắt thông tin khách hàng, đơn hàng gần nhất, và các nút **Thao tác nhanh**: *+ Tạo đơn*, *+ Báo giá*, *+ Ticket*, *+ Lịch hẹn*.
* **Cơ chế giả lập khách hàng thật**: Tích hợp trình giả lập gõ phím (`Nguyễn Minh Anh đang soạn tin...`) và tự động phản hồi ngữ cảnh thông minh khi người dùng gõ tin nhắn thử nghiệm.

### 2. Quản Trị Khách Hàng CRM 360°
* **Hồ sơ 360 độ**: Quản lý đầy đủ họ tên, số điện thoại, email, địa chỉ hành chính 3 cấp (Tỉnh/Thành, Quận/Huyện, Phường/Xã).
* **Phân khúc & Hạng thành viên**: Tự động xếp hạng theo tổng chi tiêu: **Bronze** (<5tr), **Silver** (5-15tr), **Gold** (15-50tr), **Diamond** (>50tr).
* **Dòng thời gian (Activity Timeline)**: Tự động ghi nhận mọi sự kiện phát sinh: cuộc gọi, tin nhắn, đơn hàng tạo mới, báo giá gửi qua email, giải quyết khiếu nại.

### 3. Quản Lý Đơn Hàng & Logistics (GHTK)
* **Quản trị vòng đời đơn hàng**: Kiểm soát trạng thái chặt chẽ theo Máy trạng thái hữu hạn (FSM): `DRAFT` ➔ `CONFIRMED` ➔ `PROCESSING` ➔ `SHIPPING` ➔ `DELIVERED` (hoặc `CANCELLED`, `RETURNED`).
* **Tự động tính phí vận chuyển GHTK**: Tính toán chính xác cước phí dựa theo địa chỉ giao hàng và khối lượng hàng hóa.
* **Tra cứu vận đơn thời gian thực**: Bảng quản lý đơn hàng hiển thị trực tiếp mã vận đơn GHTK, trạng thái hành trình bưu cục và nút in phiếu giao hàng.

### 4. Trung Tâm Chăm Sóc Khách Hàng & Giám Sát SLA
* **Quản lý Ticket hỗ trợ**: Phân loại theo nguồn tiếp nhận, mức độ ưu tiên (Thấp, Trung bình, Cao, Khẩn cấp).
* **Đồng hồ đếm ngược SLA**: Cảnh báo vi phạm SLA với 3 mốc tiêu chuẩn: **4 giờ** (ticket khẩn cấp), **8 giờ** (khiếu nại sản phẩm), **24 giờ** (yêu cầu chung).
* **Nhắc lịch chăm sóc sau bán**: Lịch hẹn gọi điện hỏi thăm trải nghiệm khách hàng sau khi nhận đơn với nút gọi tức thì `[ 📞 Gọi ngay ]`.

### 5. Giả Lập Cuộc Gọi VoIP & Tương Tác Thời Gian Thực
* **Modal gọi điện VoIP tích hợp**: Giả lập cuộc gọi thoại trực tiếp trên giao diện với đầy đủ hiệu ứng đổ chuông, đếm thời gian thoại, phím Mute Micro và Loa ngoài.
* **Tự động lưu lịch sử**: Kết thúc cuộc gọi tự động đẩy bản ghi "Đã gọi tư vấn/chăm sóc" vào dòng thời gian của khách hàng.

### 6. Phân Tích Xu Hướng Thị Trường & Trợ Lý AI
* **Trend Intelligence**: Thu thập từ khóa thịnh hành trên TikTok Shop, Shopee và Google Trends.
* **AI Analyst**: Đánh giá độ khả thi của sản phẩm, dự báo dung lượng thị trường và gợi ý chiến lược định giá & quảng cáo.

---

## 🔒 Bảo Mật, Phân Quyền (RBAC) & Phạm Vi Dữ Liệu

Hệ thống được thiết kế theo các tiêu chuẩn phân quyền nghiêm ngặt của doanh nghiệp:

### 1. Bảng ma trận phân quyền 4 vai trò:
| Phân hệ / Quyền hạn | ADMIN | MANAGER | SALES | CUSTOMER_CARE |
| :--- | :---: | :---: | :---: | :---: |
| **Xem khách hàng (`customer.read`)** | Toàn bộ | Toàn bộ | Của mình + Chưa gán | Toàn bộ |
| **Cập nhật khách hàng (`customer.update`)** | Toàn bộ | Toàn bộ | Của mình | Chỉ sửa liên hệ |
| **Bán hàng & Chát (`conversation.reply`)** | Toàn bộ | Toàn bộ | Của mình | Của mình |
| **Tạo & Duyệt đơn (`order.update_status`)** | Toàn bộ | Toàn bộ | Của mình (đến SHIPPING) | Chỉ xem |
| **Quản trị Ticket (`ticket.update`)** | Toàn bộ | Toàn bộ | Chỉ xem | Toàn quyền xử lý |
| **Báo cáo & Dashboard (`dashboard.read`)** | Toàn công ty | Toàn công ty | Chỉ số cá nhân | Chỉ số cá nhân |
| **Cấu hình hệ thống & Audit Log** | Có | Không | Không | Không |

### 2. Phạm vi dữ liệu (Data Scoping):
* Mọi truy vấn từ phía nhân viên kinh doanh đều được giới hạn tự động bằng điều kiện `assignedSalesUserId == currentUser.uid` ngay tại tầng cơ sở dữ liệu.
* Khi cố tình truy cập vào bản ghi của nhân viên khác bằng ID trực tiếp, hệ thống trả về mã lỗi **404 Not Found** (không làm lộ sự tồn tại của dữ liệu) thay vì chỉ trả 403.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```
business/
├── .env.example               # Mẫu cấu hình biến môi trường
├── .gitignore                  # Cấu hình bỏ qua file nhạy cảm và node_modules
├── package.json               # Danh sách thư viện và dependencies
├── firestore.rules            # Quy tắc bảo mật Firestore Security Rules
│
├── README.md                  # Tài liệu tổng quan toàn bộ dự án
│
└── src/
    ├── index.js               # Điểm khởi chạy chính của Express Server
    ├── config/                # Cấu hình Firebase, Shipping, Crawlers
    ├── data/                  # Mock data, 63 tỉnh thành, seed dữ liệu mẫu
    ├── middleware/            # Middleware kiểm tra JWT Auth, RBAC, Scoped Query
    ├── models/                # Schema & Business logic cho Khách hàng, Đơn hàng, Ticket...
    ├── routes/                # Các Router REST API (orders, customers, chat, shipping...)
    ├── services/              # Dịch vụ ngoài: GHTK API, Webhook, AI Gemini, Email
    ├── utils/                 # Bộ tính tiền tệ VND, FSM State Machines, Security helpers
    │
    └── frontend/              # Ứng dụng giao diện người dùng (Single Page Application)
        ├── index.html         # HTML root với React 18, Babel & Tailwind CSS
        ├── app.jsx            # Điều hướng chính và quản lý trạng thái toàn cục
        ├── styles.css         # Tuỳ biến thanh cuộn, hiệu ứng badge và animation
        ├── utils/             # Tầng gọi API và bộ dữ liệu giả lập phong phú
        └── components/        # Thư viện component giao diện người dùng
            ├── Sidebar.jsx            # Thanh điều hướng trái (Tổng quan, Bán hàng, Khách...)
            ├── Header.jsx             # Thanh tìm kiếm toàn cục, chuông thông báo & avatar
            ├── OverviewView.jsx       # Bảng điều khiển tổng quan KPI & biểu đồ
            ├── OmnichannelInbox.jsx   # Hộp thư đa kênh 3 cột với giả lập tương tác
            ├── CustomerProfileView.jsx# Màn hình chi tiết hồ sơ khách hàng 360°
            ├── OrdersView.jsx         # Quản lý danh sách đơn hàng & vận đơn GHTK
            ├── CareView.jsx           # Quản lý Ticket chăm sóc khách hàng & đồng hồ SLA
            ├── CallModal.jsx          # Cửa sổ gọi điện thoại giả lập VoIP
            ├── OrderForm.jsx          # Form lên đơn nhanh và tính cước vận chuyển
            └── TrendDashboard.jsx     # Bảng phân tích xu hướng sản phẩm thị trường
```

---

## ⚡ Hướng Dẫn Khởi Chạy Nhanh (Quick Start)

### 1. Cài đặt thư viện:
```bash
npm install
```

### 2. Cấu hình môi trường:
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```
*(Nếu muốn chạy thử nghiệm ngay mà chưa có Firebase hay GHTK Token, hệ thống sẽ tự động bật Mock Service để bạn trải nghiệm toàn bộ tính năng)*.

### 3. Chạy ứng dụng:
```bash
npm start
```
Truy cập trình duyệt tại địa chỉ: **`http://localhost:3000`**

---

*Phát triển bởi đội ngũ dự án SmartSales · Cập nhật tháng 11/2026.*
