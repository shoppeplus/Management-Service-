/**
 * Header Component (SmartSales Unified Top Bar)
 * ──────────────────────────────────────────────
 * Matches Image 01, Image 02, and Image 03:
 * - Search bar: "Tìm kiếm khách hàng, đơn hàng, sản phẩm..."
 * - Notification bell 🔔 with unread count
 * - Weather & current greeting: "Thứ Ba, 12/03/2024 • Chào Nam! ☀️"
 * - User pill: (Avatar 'N', Nam, Quản trị viên)
 */

(function () {
  'use strict';

  const { useState, useRef, useEffect } = window.React;

  function Header({ currentUser, onSearch, onOpenNotifications }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const dropdownRef = useRef(null);

    const notifications = [
      { id: 1, title: 'Đơn hàng mới DH009', desc: 'Nguyễn Minh Anh vừa đặt thêm phụ kiện', time: '5 phút trước', unread: true },
      { id: 2, title: 'Yêu cầu hỗ trợ quá hạn', desc: 'Ticket #TK-4001 cần xử lý gấp', time: '15 phút trước', unread: true },
      { id: 3, title: 'Báo cáo xu hướng AI', desc: 'Có 3 sản phẩm trending mới hôm nay', time: '1 giờ trước', unread: false },
    ];

    useEffect(() => {
      function handleClickOutside(event) {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setShowNotifDropdown(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearchSubmit = (e) => {
      e?.preventDefault();
      if (onSearch) onSearch(searchTerm);
    };

    return (
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-xs flex-shrink-0 z-20">
        {/* Global Search Bar */}
        <div className="w-96 max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (onSearch) onSearch(e.target.value);
              }}
              placeholder="Tìm kiếm khách hàng, đơn hàng, sản phẩm..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </form>
        </div>

        {/* Right Section: Greeting, Notification, User Pill */}
        <div className="flex items-center gap-4">
          {/* Weather / Date Greeting */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <span>Thứ Ba, 12/03/2024</span>
            <span className="text-slate-300">•</span>
            <span className="font-medium text-slate-700">Chào Nam! ☀️</span>
          </div>

          {/* Notification Bell */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors relative"
              title="Thông báo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute 1 top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            </button>

            {/* Dropdown Menu */}
            {showNotifDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-fadeIn">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">Thông báo mới</h4>
                  <span className="text-[10px] text-blue-600 font-semibold cursor-pointer hover:underline">
                    Đánh dấu đã đọc
                  </span>
                </div>
                <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs ${n.unread ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{n.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'N'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 leading-tight">
                {currentUser?.name || 'Nam'}
              </p>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">Quản trị viên</p>
            </div>
            <svg className="w-3.5 h-3.5 text-slate-400 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </header>
    );
  }

  window.Header = Header;
})();
