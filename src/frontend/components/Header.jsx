/**
 * Header Component (SmartSales Unified Top Bar)
 * ──────────────────────────────────────────────
 * Supports:
 * - Global Search
 * - Weather & Greeting
 * - Notifications Dropdown
 * - User Profile Pill with Quick Account Switching (F0 Admin, F1 Lead, F2 Member)
 */

(function () {
  'use strict';

  const { useState, useRef, useEffect, useMemo } = window.React;

  function Header({ currentUser, onSearch, onOpenSwitchAccount, onSwitchAccount, onLogout }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const [showUserDropdown, setShowUserDropdown] = useState(false);

    const notifRef = useRef(null);
    const userRef = useRef(null);

    const notifications = [
      { id: 1, title: 'Đơn hàng mới DH009', desc: 'Nguyễn Minh Anh vừa đặt thêm phụ kiện', time: '5 phút trước', unread: true },
      { id: 2, title: 'Yêu cầu hỗ trợ quá hạn', desc: 'Ticket #TK-4001 cần xử lý gấp', time: '15 phút trước', unread: true },
      { id: 3, title: 'Báo cáo xu hướng AI', desc: 'Có 3 sản phẩm trending mới hôm nay', time: '1 giờ trước', unread: false },
    ];

    useEffect(() => {
      function handleClickOutside(event) {
        if (notifRef.current && !notifRef.current.contains(event.target)) {
          setShowNotifDropdown(false);
        }
        if (userRef.current && !userRef.current.contains(event.target)) {
          setShowUserDropdown(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearchSubmit = (e) => {
      e?.preventDefault();
      if (onSearch) onSearch(searchTerm);
    };

    const tierBadge = useMemo(() => {
      const role = String(currentUser?.role || '').toUpperCase();
      if (role === 'F1_LEAD' || role === 'LEAD') {
        return {
          tier: 'F1',
          label: 'F1: Lead (Trưởng nhóm)',
          sub: 'Full quyền trừ Tổng quan',
          color: 'bg-blue-100 text-blue-700 border-blue-200',
          avatarBg: 'bg-blue-600',
        };
      }
      if (role === 'F2_MEMBER' || role === 'MEMBER') {
        return {
          tier: 'F2',
          label: 'F2: Member (Thành viên)',
          sub: 'Chỉ Bán hàng & Khách hàng',
          color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          avatarBg: 'bg-emerald-600',
        };
      }
      return {
        tier: 'F0',
        label: 'F0: Admin (Quản trị viên)',
        sub: 'Toàn quyền hệ thống',
        color: 'bg-purple-100 text-purple-700 border-purple-200',
        avatarBg: 'bg-purple-600',
      };
    }, [currentUser]);

    const accountsList = window.SYSTEM_ACCOUNTS || [];

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
        <div className="flex items-center gap-3.5">
          {/* Quick Account Switch Pills (Visible on larger screens) */}
          <div className="hidden xl:flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-[11px] font-medium">
            <span className="px-2 text-slate-400 font-bold">Chuyển vai trò:</span>
            {accountsList.map((acc) => {
              const isActive = currentUser?.uid === acc.uid;
              return (
                <button
                  key={acc.uid}
                  type="button"
                  onClick={() => onSwitchAccount && onSwitchAccount(acc)}
                  className={`px-2 py-1 rounded-lg font-bold text-[10px] transition-all flex items-center gap-1 ${
                    isActive
                      ? `${acc.badgeStyle} bg-white shadow-xs`
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title={acc.description}
                >
                  <span>{acc.tier}</span>
                  <span className="hidden 2xl:inline">• {acc.roleLabel.split(':')[1]?.split('(')[0]?.trim()}</span>
                </button>
              );
            })}
          </div>

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors relative"
              title="Thông báo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            </button>

            {/* Notification Dropdown Menu */}
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

          {/* User Profile Pill with Switch Dropdown */}
          <div className="relative" ref={userRef}>
            <div
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2.5 pl-3 py-1 pr-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
            >
              <div
                className={`w-8 h-8 rounded-xl ${tierBadge.avatarBg} text-white flex items-center justify-center font-bold text-xs shadow-xs`}
              >
                {tierBadge.tier}
              </div>
              <div className="hidden sm:block text-left">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-slate-800 leading-tight">
                    {currentUser?.name || 'Nguyễn Nam'}
                  </p>
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${tierBadge.color}`}>
                    {tierBadge.tier}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">{tierBadge.label}</p>
              </div>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* User Dropdown Menu */}
            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 py-3 z-50 animate-fadeIn">
                <div className="px-4 pb-3 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900">{currentUser?.name}</p>
                  <p className="text-[11px] text-slate-400">{currentUser?.email}</p>
                  <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">{tierBadge.label}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tierBadge.color}`}>
                        {tierBadge.tier}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{tierBadge.sub}</p>
                  </div>
                </div>

                {/* Quick Switch List */}
                <div className="py-2 px-2">
                  <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Đổi tài khoản đăng nhập:
                  </p>
                  {accountsList.map((acc) => {
                    const isCurrent = currentUser?.uid === acc.uid;
                    return (
                      <button
                        key={acc.uid}
                        type="button"
                        onClick={() => {
                          if (onSwitchAccount) onSwitchAccount(acc);
                          setShowUserDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                          isCurrent ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-lg ${acc.avatarBg} text-white flex items-center justify-center text-[10px] font-black`}
                          >
                            {acc.tier}
                          </span>
                          <div>
                            <p className="text-xs font-semibold leading-tight">{acc.name}</p>
                            <p className="text-[10px] text-slate-400">{acc.roleLabel}</p>
                          </div>
                        </div>
                        {isCurrent && <span className="text-blue-600 font-bold text-xs">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="pt-2 px-2 border-t border-slate-100 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      if (onOpenSwitchAccount) onOpenSwitchAccount();
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span>Mở màn hình chọn tài khoản...</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      if (onLogout) onLogout();
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }

  window.Header = Header;
})();
