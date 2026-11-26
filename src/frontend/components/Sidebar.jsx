/**
 * Sidebar Navigation Component (SmartSales Suite Left Bar)
 * ─────────────────────────────────────────────────────────
 * Đáp ứng yêu cầu Requirment_Ver1.0.xlsx:
 * - Ở trạng thái không điều khiển (thu gọn 72px) chỉ hiển thị icon để giảm sự chiếm dụng.
 * - Khi người dùng di chuyển chuột vào icon (Hover), hiển thị Flyout Card đầy đủ các mục
 *   mà thanh taskbar đang quản lý tại phân hệ đó.
 * - Hỗ trợ đồng thời nút bấm mở rộng cố định (228px) trên Header.
 */

(function () {
  'use strict';

  const { useState, useEffect } = window.React;

  function Sidebar({ activeNav = 'overview', onNavigate, unreadCount = 18, currentUser }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [hoveredItemId, setHoveredItemId] = useState(null);

    useEffect(() => {
      const handleSidebarToggle = (event) => {
        setIsExpanded(Boolean(event.detail?.expanded));
        setHoveredItemId(null);
      };
      window.addEventListener('smartsales:sidebar-toggle', handleSidebarToggle);
      return () => window.removeEventListener('smartsales:sidebar-toggle', handleSidebarToggle);
    }, []);

    const navItems = [
      {
        id: 'overview',
        label: 'Tổng quan',
        icon: 'home',
        managedItems: ['KPI Doanh thu & Đơn hàng', 'Thống kê theo danh mục', 'Việc cần xử lý trong ngày'],
      },
      {
        id: 'inbox',
        label: 'Bán hàng',
        icon: 'chat',
        badge: unreadCount,
        managedItems: ['Hộp thư đa kênh (TikTok, Zalo, FB)', 'Lọc hội thoại theo cây danh mục', 'Gợi ý trả lời AI & Lên đơn nhanh'],
      },
      {
        id: 'customers',
        label: 'Khách hàng',
        icon: 'users',
        managedItems: ['Hồ sơ khách hàng 360°', 'Lịch sử tương tác đa kênh', 'Phân hạng thành viên (Gold/Silver)'],
      },
      {
        id: 'orders',
        label: 'Đơn hàng',
        icon: 'bag',
        managedItems: ['Theo dõi trạng thái đơn (FSM)', 'Đẩy vận đơn Giao Hàng Tiết Kiệm', 'Đối soát COD & Tồn kho'],
      },
      {
        id: 'products',
        label: 'Sản phẩm',
        icon: 'box',
        managedItems: ['Cây danh mục & Sản phẩm con', 'Quản lý báo giá (Quotations)', 'Định mức giá & Tồn kho'],
      },
      {
        id: 'care',
        label: 'Chăm sóc',
        icon: 'heart',
        managedItems: ['Ticket hỗ trợ & Khiếu nại', 'Lịch hẹn gọi lại (Follow-ups)', 'Theo dõi cam kết SLA'],
      },
      {
        id: 'reports',
        label: 'Báo cáo',
        icon: 'chart',
        managedItems: ['Phễu chuyển đổi doanh số', 'Phân tích xu hướng thị trường AI', 'Báo cáo hiệu suất theo nhân viên'],
      },
      {
        id: 'settings',
        label: 'Cài đặt',
        icon: 'settings',
        managedItems: ['Phân quyền tài khoản (F0 / F1 / F2)', 'Kết nối nhiều tài khoản TikTok Shop', 'Cấu hình Webhook & Bảo mật'],
      },
    ];

    const renderIcon = (type) => {
      switch (type) {
        case 'home':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          );
        case 'chat':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          );
        case 'users':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          );
        case 'bag':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          );
        case 'box':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          );
        case 'heart':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          );
        case 'chart':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          );
        case 'settings':
          return (
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          );
        default:
          return null;
      }
    };

    return (
      <aside
        className={`${
          isExpanded ? 'w-[228px]' : 'w-[72px]'
        } relative h-screen bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 select-none shadow-xs z-40 transition-[width] duration-200 ease-out`}
      >
        {/* Top: Logo & Nav items */}
        <div>
          {/* Logo Brand Header */}
          <div
            className={`h-16 ${
              isExpanded ? 'px-4' : 'px-3.5'
            } flex items-center ${
              isExpanded ? 'justify-start' : 'justify-center'
            } border-b border-slate-100 transition-[padding] duration-200 overflow-hidden`}
          >
            <div className={`h-16 w-full flex items-center ${isExpanded ? 'justify-start gap-3' : 'justify-center'}`}>
              <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-200">
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6a4 4 0 0 0-4-2H9a4 4 0 0 0-4 4 4 4 0 0 0 4 4h6a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-5a4 4 0 0 1-4-2" />
                </svg>
              </div>
              <div
                className={`flex flex-col whitespace-nowrap transition-opacity duration-150 ${
                  isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                <span className="font-bold text-slate-900 text-lg tracking-tight leading-tight">
                  SmartSales
                </span>
                <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">
                  Suite 2.0
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Items List */}
          <nav className={`${isExpanded ? 'px-3' : 'px-2'} py-3 space-y-1`}>
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              const isHovered = !isExpanded && hoveredItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="relative"
                  onMouseEnter={() => {
                    if (!isExpanded) setHoveredItemId(item.id);
                  }}
                  onMouseLeave={() => {
                    if (!isExpanded) setHoveredItemId(null);
                  }}
                >
                  <button
                    onClick={() => {
                      setHoveredItemId(null);
                      onNavigate && onNavigate(item.id);
                    }}
                    type="button"
                    aria-label={item.label}
                    className={`relative w-full flex items-center ${
                      isExpanded ? 'justify-between px-3.5' : 'justify-center px-2'
                    } py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`flex items-center ${isExpanded ? 'gap-3' : 'gap-0'}`}>
                      <span className={isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}>
                        {renderIcon(item.icon)}
                      </span>
                      <span
                        className={`whitespace-nowrap transition-opacity duration-150 ${
                          isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>

                    {/* Unread dot when collapsed */}
                    {!isExpanded && item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white" />
                    )}

                    {/* Full badge when expanded */}
                    {isExpanded && item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold leading-tight ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>

                  {/* Hover Flyout Popover khi ở trạng thái thu gọn (icon-only) */}
                  {isHovered && (
                    <div
                      role="tooltip"
                      className="absolute left-full top-0 ml-2.5 w-60 bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(15,23,42,0.14)] p-3.5 z-50 animate-fadeIn pointer-events-none"
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-900">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-600 text-white">
                            {item.badge} mới
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Các mục đang quản lý
                      </p>
                      <ul className="space-y-1">
                        {(item.managedItems || []).map((sub, idx) => (
                          <li key={idx} className="text-[11px] text-slate-600 flex items-start gap-1.5 leading-snug">
                            <span className="text-blue-500 font-bold">•</span>
                            <span>{sub}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom: User Profile Card */}
        <div className="p-3 border-t border-slate-100 overflow-hidden">
          <div
            className={`flex items-center ${
              isExpanded ? 'justify-between' : 'justify-center'
            } p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer`}
          >
            <div
              className={`flex items-center ${isExpanded ? 'gap-2.5' : 'gap-0'}`}
              title={!isExpanded ? currentUser?.name || 'Nam' : undefined}
            >
              <div className="w-9 h-9 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'N'}
              </div>
              <div
                className={`text-left whitespace-nowrap transition-opacity duration-150 ${
                  isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {currentUser?.name || 'Nam'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {currentUser?.roleTier || 'Quản trị viên (F0)'}
                </p>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-slate-400 ${isExpanded ? 'block' : 'hidden'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </aside>
    );
  }

  window.Sidebar = Sidebar;
})();
