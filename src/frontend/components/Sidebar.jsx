/**
 * Sidebar Component (SmartSales Unified Navigation)
 * ────────────────────────────────────────────────
 * Supports 3 Role Tiers:
 * - F0: admin (Full system access: all 8 items)
 * - F1: lead (Full access EXCEPT Overview / Tổng quan: 7 items)
 * - F2: member (ONLY allowed: Bán hàng & Khách hàng: 2 items)
 */

(function () {
  'use strict';

  const { useMemo } = window.React;

  function Sidebar({ activeNav = 'overview', onNavigate, unreadCount = 18, currentUser, onOpenSwitchAccount }) {
    const rawNavItems = useMemo(
      () => [
        { id: 'overview', label: 'Tổng quan', icon: 'home' },
        { id: 'inbox', label: 'Bán hàng', icon: 'chat', badge: unreadCount },
        { id: 'customers', label: 'Khách hàng', icon: 'users' },
        { id: 'orders', label: 'Đơn hàng', icon: 'box' },
        { id: 'products', label: 'Sản phẩm', icon: 'tag' },
        { id: 'care', label: 'Chăm sóc', icon: 'heart' },
        { id: 'reports', label: 'Báo cáo', icon: 'chart' },
        { id: 'settings', label: 'Cài đặt', icon: 'cog' },
      ],
      [unreadCount]
    );

    // Filter nav items according to the 3-tier permissions
    const navItems = useMemo(() => {
      if (Array.isArray(currentUser?.allowedNavs)) {
        return rawNavItems.filter((item) => currentUser.allowedNavs.includes(item.id));
      }
      const role = String(currentUser?.role || '').toUpperCase();
      if (role === 'F1_LEAD' || role === 'LEAD') {
        // F1: Lead -> Full trừ phần tổng quan
        return rawNavItems.filter((item) => item.id !== 'overview');
      }
      if (role === 'F2_MEMBER' || role === 'MEMBER') {
        // F2: Member -> Chỉ được phép truy cập vào bán hàng và khách hàng
        return rawNavItems.filter((item) => item.id === 'inbox' || item.id === 'customers');
      }
      // F0: Admin -> Full quyền
      return rawNavItems;
    }, [currentUser, rawNavItems]);

    // Role tier label and badge
    const tierInfo = useMemo(() => {
      const role = String(currentUser?.role || '').toUpperCase();
      if (role === 'F1_LEAD' || role === 'LEAD') {
        return {
          tier: 'F1',
          label: 'F1 • Trưởng nhóm',
          badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
          avatarBg: 'bg-blue-600',
        };
      }
      if (role === 'F2_MEMBER' || role === 'MEMBER') {
        return {
          tier: 'F2',
          label: 'F2 • Thành viên',
          badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          avatarBg: 'bg-emerald-600',
        };
      }
      return {
        tier: 'F0',
        label: 'F0 • Quản trị viên',
        badgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
        avatarBg: 'bg-purple-600',
      };
    }, [currentUser]);

    const renderIcon = (iconName) => {
      switch (iconName) {
        case 'home':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          );
        case 'users':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          );
        case 'chat':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          );
        case 'box':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          );
        case 'tag':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          );
        case 'heart':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          );
        case 'chart':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          );
        case 'cog':
          return (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          );
        default:
          return null;
      }
    };

    return (
      <aside className="w-56 h-screen bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 select-none shadow-xs z-30">
        {/* Top: Logo & Nav items */}
        <div className="overflow-y-auto">
          {/* Logo Brand Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-200">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6a4 4 0 0 0-4-2H9a4 4 0 0 0-4 4 4 4 0 0 0 4 4h6a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-5a4 4 0 0 1-4-2" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900 text-lg tracking-tight leading-tight">
                  SmartSales
                </span>
                <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">
                  Suite 2.0
                </span>
              </div>
            </div>

            {/* Quick Tier Pill */}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${tierInfo.badgeClass}`}>
              {tierInfo.tier}
            </span>
          </div>

          {/* Navigation Items List */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate && onNavigate(item.id)}
                  type="button"
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}>
                      {renderIcon(item.icon)}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold leading-tight ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: User Profile Card & Switch Account button */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div
            onClick={onOpenSwitchAccount}
            className="flex items-center justify-between p-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-xs transition-all cursor-pointer group"
            title="Bấm để chuyển đổi tài khoản F0 / F1 / F2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl ${tierInfo.avatarBg} text-white flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0`}
              >
                {tierInfo.tier}
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                  {currentUser?.name || 'Nguyễn Nam'}
                </p>
                <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                  {tierInfo.label}
                </p>
              </div>
            </div>
            <div className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 flex items-center justify-center text-slate-400 flex-shrink-0 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  window.Sidebar = Sidebar;
})();
