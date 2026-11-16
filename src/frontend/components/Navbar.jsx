const { useState, useEffect, useRef, useMemo } = React;

/**
 * Navbar Component
 * Top application navigation bar for Mini Pancake Sales Management SPA.
 * CDN-loaded React (window.React) - No import statements.
 */
(function () {
  'use strict';

  function Navbar({ currentUser, unreadTotal, unreadCount, onLogout, activeTab, setActiveTab, viewMode = 'main', setViewMode }) {
    // Determine badge count from props with fallback
    const effectiveUnread = unreadTotal !== undefined ? unreadTotal : (unreadCount !== undefined ? unreadCount : 0);

    // Local state
    const [selectedPage, setSelectedPage] = useState('all');
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const notifRef = useRef(null);

    // Mock notification items from window.MockData or fallback
    const [notificationsList, setNotificationsList] = useState([]);

    useEffect(() => {
      if (window.MockData && window.MockData.notifications) {
        setNotificationsList(window.MockData.notifications);
      } else {
        setNotificationsList([
          {
            id: 'notif-1',
            type: 'order',
            title: 'Đơn hàng mới #MP-001',
            message: 'Đơn hàng mới #MP-001 từ Nguyen Van A',
            time: '10 phút trước',
            read: false,
          },
          {
            id: 'notif-2',
            type: 'message',
            title: 'Tin nhắn mới',
            message: 'Tin nhắn mới từ Tran Thi B',
            time: '25 phút trước',
            read: false,
          },
          {
            id: 'notif-3',
            type: 'order',
            title: 'Đơn hàng đã giao',
            message: 'Đơn hàng #MP-20261114-004 đã được giao thành công',
            time: '1 giờ trước',
            read: true,
          },
          {
            id: 'notif-4',
            type: 'message',
            title: 'Tin nhắn mới từ Pham Minh D',
            message: 'Khách hàng quan tâm kính mát và đồng hồ dây da',
            time: '2 giờ trước',
            read: true,
          },
        ]);
      }
    }, []);

    // Close notifications dropdown when clicking outside
    useEffect(() => {
      function handleClickOutside(event) {
        if (notifRef.current && !notifRef.current.contains(event.target)) {
          setIsNotifOpen(false);
        }
      }
      if (isNotifOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isNotifOpen]);

    // Handle logout action
    const handleLogoutClick = () => {
      if (onLogout && typeof onLogout === 'function') {
        onLogout();
      } else {
        if (window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
          alert('Đã đăng xuất!');
        }
      }
    };

    // Calculate user initials
    const userInitials = useMemo(() => {
      if (!currentUser?.name) return 'MP';
      const parts = currentUser.name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }, [currentUser?.name]);

    // Mark single notification as read
    const markAsRead = (id) => {
      setNotificationsList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
    };

    // Mark all notifications as read
    const markAllAsRead = () => {
      setNotificationsList((prev) => prev.map((item) => ({ ...item, read: true })));
    };

    return (
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs select-none">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          {/* 1. Left: Brand & Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-400 flex items-center justify-center text-white text-lg shadow-sm transform hover:scale-105 transition-transform cursor-pointer">
              🥞
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-xl text-slate-800 tracking-tight hover:text-indigo-600 transition-colors cursor-pointer">
                Mini Pancake
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                SaaS
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Bán hàng vs Xu hướng) */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/90 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode && setViewMode('main')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'main'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <span>💬</span>
              <span>Bán hàng</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode && setViewMode('trends')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'trends'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-xs shadow-indigo-200'
                  : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-200/50'
              }`}
            >
              <span>📊</span>
              <span>Xu hướng</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode && setViewMode('crm')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'crm'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs shadow-purple-200'
                  : 'text-slate-600 hover:text-purple-600 hover:bg-slate-200/50'
              }`}
            >
              <span>💼</span>
              <span>SmartSales CRM</span>
              <span className="px-1.5 py-0.2 text-[9px] rounded-full bg-purple-100 text-purple-700 font-extrabold">A</span>
            </button>
          </div>

          {/* 2. Center: Page selector dropdown "Chọn trang" (Desktop) */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-xs mx-4">
            <label htmlFor="page-selector" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              Chọn trang:
            </label>
            <div className="relative w-full">
              <select
                id="page-selector"
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 hover:border-indigo-400 focus:border-indigo-600 focus:bg-white focus:outline-none transition-colors appearance-none cursor-pointer pr-7"
              >
                <option value="all">Tất cả</option>
                <option value="fanpage_abc">Fanpage ABC</option>
                <option value="tiktok_xyz">TikTok Shop XYZ</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* 3. Right: Notifications, User Avatar & Name, Logout button */}
          <div className="hidden md:flex items-center gap-3">
            {/* Notification Bell with Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen((prev) => !prev)}
                className="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none"
                title="Thông báo"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>

                {effectiveUnread > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center pulse-badge shadow-xs">
                    {effectiveUnread > 99 ? '99+' : effectiveUnread}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-fadeIn">
                  <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-800">Thông báo gần đây</span>
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                        {notificationsList.filter((n) => !n.read).length} mới
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      Đọc tất cả
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 scrollbar-thin">
                    {notificationsList.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">Không có thông báo mới</div>
                    ) : (
                      notificationsList.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => markAsRead(notif.id)}
                          className={`p-3 text-xs flex items-start gap-2.5 hover:bg-slate-50 cursor-pointer transition-colors ${
                            !notif.read ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <span className="text-base flex-shrink-0 mt-0.5">
                            {notif.type === 'order' ? '📦' : '💬'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{notif.title}</p>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{notif.message}</p>
                            <span className="text-[10px] text-slate-400 block mt-1">{notif.time}</span>
                          </div>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200"></div>

            {/* User Avatar + Name */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-indigo-100">
                {userInitials}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800 leading-tight">
                  {currentUser?.name || 'Nguyen Van A'}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  {currentUser?.role || 'admin'}
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200"></div>

            {/* Logout button (icon) */}
            <button
              type="button"
              onClick={handleLogoutClick}
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors focus:outline-none"
              title="Đăng xuất"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>

          {/* 4. Mobile Quick Switcher & Hamburger Button */}
          <div className="flex items-center gap-1.5 md:hidden">
            {/* Quick Mobile Trend Tab */}
            <button
              type="button"
              onClick={() => setViewMode && setViewMode(viewMode === 'trends' ? 'main' : 'trends')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                viewMode === 'trends'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{viewMode === 'trends' ? '💬 Chat' : '📊 Xu hướng'}</span>
            </button>

            {/* Mobile notification badge icon */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="relative p-2 text-slate-600 hover:text-indigo-600 focus:outline-none rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {effectiveUnread > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white"></span>
              )}
            </button>

            {/* Hamburger toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="p-2 text-slate-700 hover:text-indigo-600 hover:bg-slate-100 rounded-lg focus:outline-none transition-colors"
              aria-label="Menu"
            >
              {isMobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 5. Mobile Drawer / Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-3 shadow-lg animate-fadeIn">
            {/* Mobile Navigation Mode Switcher */}
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  if (setViewMode) setViewMode('main');
                  setIsMobileMenuOpen(false);
                }}
                className={`flex-1 py-2 text-center rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'main'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                💬 Bán hàng đa kênh
              </button>
              <button
                type="button"
                onClick={() => {
                  if (setViewMode) setViewMode('trends');
                  setIsMobileMenuOpen(false);
                }}
                className={`flex-1 py-2 text-center rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'trends'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 Xu hướng
              </button>
            </div>

            {/* Mobile Page selector */}
            <div>
              <label htmlFor="mobile-page-selector" className="text-xs font-semibold text-slate-500 block mb-1">
                Chọn trang:
              </label>
              <select
                id="mobile-page-selector"
                value={selectedPage}
                onChange={(e) => setSelectedPage(e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:border-indigo-600"
              >
                <option value="all">Tất cả</option>
                <option value="fanpage_abc">Fanpage ABC</option>
                <option value="tiktok_xyz">TikTok Shop XYZ</option>
              </select>
            </div>

            {/* Mobile User Profile Info & Logout */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                  {userInitials}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{currentUser?.name || 'Nguyen Van A'}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{currentUser?.role || 'admin'}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogoutClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>Đăng xuất</span>
              </button>
            </div>

            {/* Recent Notifications Quick List */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Thông báo gần đây</span>
                {effectiveUnread > 0 && (
                  <span className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.2 rounded-full">
                    {effectiveUnread}
                  </span>
                )}
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                {notificationsList.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    className="p-2 bg-slate-50 rounded-lg text-xs flex items-start gap-2"
                  >
                    <span>{item.type === 'order' ? '📦' : '💬'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
    );
  }

  // Assign to window object
  if (typeof window !== 'undefined') {
    window.Navbar = Navbar;
  }
})();
