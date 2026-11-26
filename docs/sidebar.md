# Sidebar — Hướng dẫn triển khai và bảo trì

## Mục đích

`src/frontend/components/Sidebar.jsx` cung cấp thanh điều hướng trái của SPA SmartSales. Component nhận view đang mở từ App shell và gọi callback điều hướng; nó không tự xử lý route, xác thực hay phân quyền.

## Trạng thái giao diện

- Mặc định thu gọn với chiều rộng `72px`; chỉ icon menu, chấm thông báo (unread dot) và avatar được hiển thị.
- **Hiệu ứng Hover Flyout (đúng yêu cầu Excel):** Khi ở trạng thái thu gọn `72px`, người dùng di chuyển chuột vào bất kỳ icon nào sẽ hiển thị một **Flyout Card** nổi bên phải icon, liệt kê tên phân hệ, số thông báo mới và **đầy đủ các mục mà thanh taskbar đang quản lý** tại phân hệ đó.
- Khi mở rộng cố định (bằng nút toggle ở Header), chiều rộng là `228px`; nhãn menu, badge tin chưa đọc và thông tin người dùng xuất hiện.
- Mở/thu cố định bằng nút biểu tượng sidebar nằm cạnh ô tìm kiếm ở Header; logo chỉ là nhận diện thương hiệu, không phải nút toggle.
- Nút toggle phát sự kiện `smartsales:sidebar-toggle` kèm trạng thái `expanded`; Sidebar đăng ký listener khi mount và hủy listener khi unmount.
- Mũi tên quay theo trạng thái; nền/viền xanh nhạt biểu thị sidebar đang mở rộng.
- Nút toggle có `aria-label`, `aria-expanded` và tooltip `title`.
- Menu hiện hành vẫn có nền xanh ở cả hai chế độ.
- Kích thước cố định của logo và icon được bảo vệ bằng `shrink-0` để không bị ép méo khi đổi chiều rộng.

## API component

```jsx
<Sidebar
  activeNav="overview"
  onNavigate={(viewId) => setActiveNav(viewId)}
  unreadCount={18}
  currentUser={currentUser}
/>
```

| Prop | Mục đích |
| --- | --- |
| `activeNav` | ID view đang chọn; mặc định `overview`. |
| `onNavigate` | Callback nhận ID menu sau khi người dùng nhấn menu. |
| `unreadCount` | Số badge ở mục Bán hàng; mặc định `18`. |
| `currentUser` | Tên hiển thị và ký tự avatar người dùng. |

## Các menu hiện có

`overview`, `inbox`, `customers`, `orders`, `products`, `care`, `reports`, `settings`.
Icon được render bằng các SVG nội bộ, không phụ thuộc icon package. Muốn thêm menu, thêm item vào `navItems`, cung cấp trường hợp render icon tương ứng và đảm bảo view có trong App shell.

## Tích hợp và ranh giới

- `src/frontend/app.jsx` là nơi sở hữu `activeNav`, truyền `onNavigate`, và điều khiển view.
- Sidebar không thực hiện kiểm tra role; menu ẩn/hiện không được dùng làm ranh giới bảo mật.
- Không thêm logic tạo tài khoản, phân quyền hoặc cấp quyền business account vào component này.

## Kiểm tra thủ công

1. Tải app: sidebar bắt đầu ở trạng thái icon-only, không có nhãn bị tràn.
2. Nhấn icon bên trái ô tìm kiếm: sidebar mở rộng; logo, nhãn và badge không chồng lấn.
3. Nhấn icon lần nữa: sidebar thu gọn, icon và avatar nằm giữa trục 72px.
4. Nhấn từng menu: view đổi và mục tương ứng giữ active style.
5. Dùng Tab/Enter/Space: nút toggle và các menu điều hướng được bằng bàn phím.

## Tệp liên quan

- Component: `src/frontend/components/Sidebar.jsx`
- Toggle control/event emitter: `src/frontend/components/Header.jsx`
- App shell/caller: `src/frontend/app.jsx`
- Style nền: `src/frontend/index.html` nạp Tailwind CDN.

