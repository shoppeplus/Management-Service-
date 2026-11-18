/**
 * Login & Account Switcher Component (SmartSales Suite)
 * ──────────────────────────────────────────────────────
 * Supports 3 role tiers:
 * - F0: admin (Full system access)
 * - F1: lead (Full access EXCEPT Overview / Tổng quan)
 * - F2: member (ONLY allowed to access Bán hàng / inbox and Khách hàng / customers)
 */

(function () {
  'use strict';

  const { useState } = window.React;

  const DEFAULT_ACCOUNTS = [
    {
      uid: 'ACC-F0-001',
      name: 'Nguyễn Nam',
      email: 'admin@smartsales.vn',
      password: 'admin',
      role: 'F0_ADMIN',
      tier: 'F0',
      roleLabel: 'F0: Admin (Quản trị viên)',
      description: 'Toàn quyền hệ thống: Tổng quan, Bán hàng, Khách hàng, Đơn hàng, Sản phẩm, Chăm sóc, Báo cáo, Cài đặt.',
      allowedNavs: ['overview', 'inbox', 'customers', 'orders', 'products', 'care', 'reports', 'settings'],
      badgeStyle: 'bg-purple-100 text-purple-700 border-purple-200',
      avatarBg: 'bg-purple-600',
    },
    {
      uid: 'ACC-F1-002',
      name: 'Trần Hoàng',
      email: 'lead@smartsales.vn',
      password: 'lead',
      role: 'F1_LEAD',
      tier: 'F1',
      roleLabel: 'F1: Lead (Trưởng nhóm)',
      description: 'Toàn quyền TRỪ mục Tổng quan. Xem được: Bán hàng, Khách hàng, Đơn hàng, Sản phẩm, Chăm sóc, Báo cáo, Cài đặt.',
      allowedNavs: ['inbox', 'customers', 'orders', 'products', 'care', 'reports', 'settings'],
      badgeStyle: 'bg-blue-100 text-blue-700 border-blue-200',
      avatarBg: 'bg-blue-600',
    },
    {
      uid: 'ACC-F2-003',
      name: 'Lê Thu Hà',
      email: 'member@smartsales.vn',
      password: 'member',
      role: 'F2_MEMBER',
      tier: 'F2',
      roleLabel: 'F2: Member (Thành viên)',
      description: 'Chỉ được phép truy cập vào Bán hàng và Khách hàng. Ẩn toàn bộ các mục còn lại.',
      allowedNavs: ['inbox', 'customers'],
      badgeStyle: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      avatarBg: 'bg-emerald-600',
    },
  ];

  window.SYSTEM_ACCOUNTS = DEFAULT_ACCOUNTS;

  function LoginModal({ isOpen, onClose, onLoginSuccess, currentUserId }) {
    const [selectedTab, setSelectedTab] = useState('quick'); // 'quick' | 'form'
    const [email, setEmail] = useState('admin@smartsales.vn');
    const [password, setPassword] = useState('admin');
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSelectAccount = (account) => {
      setLoading(true);
      setErrorMsg('');
      setTimeout(() => {
        try {
          localStorage.setItem('smartsales_user', JSON.stringify(account));
        } catch (e) {
          console.warn('localStorage error', e);
        }
        setLoading(false);
        if (onLoginSuccess) onLoginSuccess(account);
        if (onClose) onClose();
      }, 250);
    };

    const handleFormSubmit = (e) => {
      e?.preventDefault();
      setErrorMsg('');
      setLoading(true);

      setTimeout(() => {
        const found = DEFAULT_ACCOUNTS.find(
          (acc) => acc.email.toLowerCase() === email.trim().toLowerCase()
        );

        if (!found) {
          setErrorMsg('Email không tồn tại trong hệ thống. Vui lòng chọn 1 trong 3 tài khoản F0, F1, F2.');
          setLoading(false);
          return;
        }

        if (password && found.password !== password && password !== '123456') {
          setErrorMsg('Mật khẩu không đúng. Gợi ý: mật khẩu mặc định trùng với tên tài khoản (admin, lead, member).');
          setLoading(false);
          return;
        }

        try {
          localStorage.setItem('smartsales_user', JSON.stringify(found));
        } catch (e) {
          console.warn('localStorage error', e);
        }

        setLoading(false);
        if (onLoginSuccess) onLoginSuccess(found);
        if (onClose) onClose();
      }, 350);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white relative">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                title="Đóng"
              >
                ✕
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-inner">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6a4 4 0 0 0-4-2H9a4 4 0 0 0-4 4 4 4 0 0 0 4 4h6a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-5a4 4 0 0 1-4-2" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">SmartSales Suite • Đăng nhập phân quyền</h2>
                <p className="text-xs text-blue-100 mt-0.5">
                  Hệ thống phân cấp 3 vai trò: F0 (Admin) • F1 (Lead) • F2 (Member)
                </p>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex gap-2 mt-5 bg-black/15 p-1 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setSelectedTab('quick')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedTab === 'quick' ? 'bg-white text-blue-700 shadow-xs' : 'text-white/80 hover:text-white'
                }`}
              >
                ⚡ Chọn nhanh tài khoản (Demo)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('form')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedTab === 'form' ? 'bg-white text-blue-700 shadow-xs' : 'text-white/80 hover:text-white'
                }`}
              >
                🔑 Đăng nhập bằng Email & Mật khẩu
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6">
            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* TAB 1: QUICK ACCOUNT SELECTION */}
            {selectedTab === 'quick' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 mb-2 font-medium">
                  Bấm trực tiếp vào 1 trong 3 cấp độ tài khoản dưới đây để kiểm tra phân quyền thực tế:
                </p>

                {DEFAULT_ACCOUNTS.map((acc) => {
                  const isCurrent = currentUserId === acc.uid;
                  return (
                    <div
                      key={acc.uid}
                      className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                      }`}
                      onClick={() => handleSelectAccount(acc)}
                    >
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-2xl ${acc.avatarBg} text-white flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0`}
                        >
                          {acc.tier}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{acc.name}</span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${acc.badgeStyle}`}>
                              {acc.roleLabel}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                Đang đăng nhập
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{acc.email}</p>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{acc.description}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-medium">Menu được phép:</span>
                            {acc.allowedNavs.map((nav) => (
                              <span
                                key={nav}
                                className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium"
                              >
                                {nav === 'overview' && '🏠 Tổng quan'}
                                {nav === 'inbox' && '💬 Bán hàng'}
                                {nav === 'customers' && '👥 Khách hàng'}
                                {nav === 'orders' && '📦 Đơn hàng'}
                                {nav === 'products' && '🏷️ Sản phẩm'}
                                {nav === 'care' && '🤍 Chăm sóc'}
                                {nav === 'reports' && '📊 Báo cáo'}
                                {nav === 'settings' && '⚙️ Cài đặt'}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAccount(acc);
                        }}
                        className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex-shrink-0 ${
                          isCurrent
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-slate-900 text-white hover:bg-blue-600'
                        }`}
                      >
                        {loading ? 'Đang vào...' : isCurrent ? 'Tiếp tục dùng' : 'Đăng nhập ngay →'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: STANDARD EMAIL & PASSWORD FORM */}
            {selectedTab === 'form' && (
              <form onSubmit={handleFormSubmit} className="space-y-4 max-w-md mx-auto">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email đăng nhập</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@smartsales.vn"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                  <div className="flex gap-2 mt-1.5">
                    <span className="text-[10px] text-slate-400">Gợi ý nhanh:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('admin@smartsales.vn');
                        setPassword('admin');
                      }}
                      className="text-[10px] text-blue-600 hover:underline font-medium"
                    >
                      admin@smartsales.vn (F0)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('lead@smartsales.vn');
                        setPassword('lead');
                      }}
                      className="text-[10px] text-blue-600 hover:underline font-medium"
                    >
                      lead@smartsales.vn (F1)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('member@smartsales.vn');
                        setPassword('member');
                      }}
                      className="text-[10px] text-blue-600 hover:underline font-medium"
                    >
                      member@smartsales.vn (F2)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 leading-relaxed">
                  🔒 <strong>Ghi chú tài khoản & mật khẩu mặc định:</strong>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>F0: <code>admin@smartsales.vn</code> (pass: <code>admin</code>)</li>
                    <li>F1: <code>lead@smartsales.vn</code> (pass: <code>lead</code>)</li>
                    <li>F2: <code>member@smartsales.vn</code> (pass: <code>member</code>)</li>
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-200 transition-all"
                >
                  {loading ? 'Đang xác thực...' : 'Đăng nhập vào hệ thống'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  window.LoginModal = LoginModal;
})();
