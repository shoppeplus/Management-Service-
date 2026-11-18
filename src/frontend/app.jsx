/**
 * SmartSales Suite - Main Application Component (React SPA)
 * ──────────────────────────────────────────────────────────
 * Implements 3 Role Tiers:
 * - F0: admin (Full system permissions: Overview, Inbox, Customers, Orders, Products, Care, Reports, Settings)
 * - F1: lead (Full permissions EXCEPT Overview / Tổng quan)
 * - F2: member (ONLY allowed: Bán hàng / inbox and Khách hàng / customers)
 */

(function () {
  'use strict';

  const { useState, useEffect, useCallback, createContext, useMemo } = window.React;
  const { createRoot } = window.ReactDOM;

  const AuthContext = createContext(null);
  const AppContext = createContext(null);

  window.AuthContext = AuthContext;
  window.AppContext = AppContext;

  // Default accounts reference
  const DEFAULT_ACCOUNTS = window.SYSTEM_ACCOUNTS || [
    {
      uid: 'ACC-F0-001',
      name: 'Nguyễn Nam',
      email: 'admin@smartsales.vn',
      role: 'F0_ADMIN',
      tier: 'F0',
      roleLabel: 'F0: Admin (Quản trị viên)',
      allowedNavs: ['overview', 'inbox', 'customers', 'orders', 'products', 'care', 'reports', 'settings'],
    },
    {
      uid: 'ACC-F1-002',
      name: 'Trần Hoàng',
      email: 'lead@smartsales.vn',
      role: 'F1_LEAD',
      tier: 'F1',
      roleLabel: 'F1: Lead (Trưởng nhóm)',
      allowedNavs: ['inbox', 'customers', 'orders', 'products', 'care', 'reports', 'settings'],
    },
    {
      uid: 'ACC-F2-003',
      name: 'Lê Thu Hà',
      email: 'member@smartsales.vn',
      role: 'F2_MEMBER',
      tier: 'F2',
      roleLabel: 'F2: Member (Thành viên)',
      allowedNavs: ['inbox', 'customers'],
    },
  ];

  function getInitialUser() {
    try {
      const stored = localStorage.getItem('smartsales_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.uid) return parsed;
      }
    } catch (e) {
      console.warn('Error reading stored user', e);
    }
    return DEFAULT_ACCOUNTS[0]; // F0 Admin default
  }

  function App() {
    const [currentUser, setCurrentUser] = useState(getInitialUser);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    // Current Active Navigation View
    // Initial activeNav depends on user role (F1 and F2 cannot access 'overview')
    const [activeNav, setActiveNav] = useState(() => {
      const user = getInitialUser();
      if (user?.role === 'F1_LEAD' || user?.role === 'F2_MEMBER') {
        return 'inbox';
      }
      return 'overview';
    });

    const [conversations, setConversations] = useState([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // Modal state for creating Order / Quote / Ticket / Follow-up
    const [modalState, setModalState] = useState({
      isOpen: false,
      type: 'order', // 'order' | 'quote' | 'ticket' | 'followup'
      customer: null,
    });

    // Simulated VoIP Call Modal state
    const [isCallOpen, setIsCallOpen] = useState(false);
    const [callCustomer, setCallCustomer] = useState(null);

    // Global Toast notification
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success') => {
      setToast({ message, type, id: Date.now() });
      setTimeout(() => {
        setToast((curr) => (curr && curr.message === message ? null : curr));
      }, 3500);
    }, []);

    // Check if a view is allowed for the current user
    const isNavAllowed = useCallback(
      (navId, user = currentUser) => {
        if (!user) return false;
        if (Array.isArray(user.allowedNavs)) {
          return user.allowedNavs.includes(navId);
        }
        const role = String(user.role || '').toUpperCase();
        if (role === 'F0_ADMIN' || role === 'ADMIN') return true;
        if (role === 'F1_LEAD' || role === 'LEAD') return navId !== 'overview';
        if (role === 'F2_MEMBER' || role === 'MEMBER') return navId === 'inbox' || navId === 'customers';
        return false;
      },
      [currentUser]
    );

    // Handle role switching / login success
    const handleSwitchAccount = useCallback(
      (account) => {
        setCurrentUser(account);
        try {
          localStorage.setItem('smartsales_user', JSON.stringify(account));
        } catch (e) {
          console.warn(e);
        }

        // Auto-redirect if the current view is not allowed for the new role
        if (!isNavAllowed(activeNav, account)) {
          setActiveNav('inbox');
        }

        showToast(`Đã chuyển sang tài khoản ${account.name} (${account.roleLabel})`, 'success');
      },
      [activeNav, isNavAllowed, showToast]
    );

    const handleLogout = useCallback(() => {
      setCurrentUser(null);
      try {
        localStorage.removeItem('smartsales_user');
      } catch (e) {
        console.warn(e);
      }
      setIsLoginModalOpen(true);
      showToast('Đã đăng xuất khỏi hệ thống. Vui lòng chọn tài khoản đăng nhập.', 'info');
    }, [showToast]);

    // Guarded navigation
    const handleNavigate = useCallback(
      (navId) => {
        if (!isNavAllowed(navId)) {
          const roleTitle = currentUser?.roleLabel || currentUser?.name || 'Tài khoản của bạn';
          showToast(`Tài khoản ${roleTitle} không có quyền truy cập mục "${navId}".`, 'error');
          return;
        }
        setActiveNav(navId);
      },
      [currentUser, isNavAllowed, showToast]
    );

    // Load initial conversation and customer data
    useEffect(() => {
      let isMounted = true;

      async function initData() {
        setLoadingConversations(true);
        try {
          const api = window.Api;
          const convList = api && api.getConversations ? await api.getConversations() : [];
          if (isMounted) {
            setConversations(convList);
          }
        } catch (error) {
          console.warn('[App] Could not load API conversations, using mock fallback:', error);
          if (isMounted && window.MockData?.conversations) {
            setConversations(window.MockData.conversations);
          }
        } finally {
          if (isMounted) setLoadingConversations(false);
        }
      }

      initData();
      return () => {
        isMounted = false;
      };
    }, []);

    // Ensure activeNav is always permitted when currentUser changes
    useEffect(() => {
      if (currentUser && !isNavAllowed(activeNav)) {
        setActiveNav('inbox');
      }
    }, [currentUser, activeNav, isNavAllowed]);

    // Modal openers
    const handleOpenCreateOrder = useCallback((cus) => {
      setModalState({ isOpen: true, type: 'order', customer: cus || selectedCustomer });
    }, [selectedCustomer]);

    const handleOpenCreateQuote = useCallback((cus) => {
      setModalState({ isOpen: true, type: 'quote', customer: cus || selectedCustomer });
    }, [selectedCustomer]);

    const handleOpenCreateTicket = useCallback((cus) => {
      setModalState({ isOpen: true, type: 'ticket', customer: cus || selectedCustomer });
    }, [selectedCustomer]);

    const handleOpenScheduleCare = useCallback((cus) => {
      setModalState({ isOpen: true, type: 'followup', customer: cus || selectedCustomer });
    }, [selectedCustomer]);

    const handleTriggerCall = useCallback((cus) => {
      setCallCustomer(cus || selectedCustomer);
      setIsCallOpen(true);
    }, [selectedCustomer]);

    const handleCloseModal = useCallback(() => {
      setModalState((prev) => ({ ...prev, isOpen: false }));
    }, []);

    // Components resolution with fallbacks
    const SidebarComp = window.Sidebar;
    const HeaderComp = window.Header;
    const OverviewViewComp = window.OverviewView;
    const CustomerProfileViewComp = window.CustomerProfileView;
    const OmnichannelInboxComp = window.OmnichannelInbox;
    const OrderModalComp = window.OrderModal;
    const CallModalComp = window.CallModal;
    const OrdersViewComp = window.OrdersView;
    const CareViewComp = window.CareView;
    const CRMViewComp = window.CRMView;
    const TrendDashboardComp = window.TrendDashboard;
    const LoginModalComp = window.LoginModal;

    return (
      <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased select-none">
        {/* 1. Left Unified Sidebar (SmartSales Navigation with 3-tier Role Filtering) */}
        {SidebarComp && (
          <SidebarComp
            activeNav={activeNav}
            onNavigate={handleNavigate}
            unreadCount={18}
            currentUser={currentUser}
            onOpenSwitchAccount={() => setIsLoginModalOpen(true)}
          />
        )}

        {/* 2. Right Main Layout Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Header */}
          {HeaderComp && (
            <HeaderComp
              currentUser={currentUser}
              onSearch={(term) => {
                if (term) {
                  if (/^[0-9+]+$/.test(term.trim())) {
                    handleNavigate('customers');
                  }
                }
              }}
              onOpenSwitchAccount={() => setIsLoginModalOpen(true)}
              onSwitchAccount={handleSwitchAccount}
              onLogout={handleLogout}
            />
          )}

          {/* Dynamic Content Views with Access Control Guard */}
          <main className="flex-1 overflow-hidden flex flex-col relative">
            {/* 403 Forbidden Access Denied fallback if unauthorized */}
            {!isNavAllowed(activeNav) && (
              <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
                <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-200 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Quyền truy cập bị hạn chế</h3>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Tài khoản hiện tại của bạn là{' '}
                    <strong className="text-slate-800">{currentUser?.roleLabel || currentUser?.name}</strong>, không có quyền
                    xem mục <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 font-bold">{activeNav}</code>.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveNav('inbox')}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                    >
                      ← Quay lại Hộp thư Bán hàng
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLoginModalOpen(true)}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                    >
                      🔄 Chuyển sang tài khoản F0 (Admin) / F1 (Lead)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View 1: 01. Tổng quan (Image 01) - CHỈ F0 ADMIN */}
            {isNavAllowed('overview') && activeNav === 'overview' && OverviewViewComp && (
              <OverviewViewComp
                currentUser={currentUser}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                onNavigate={handleNavigate}
              />
            )}

            {/* View 2: 02. Hồ sơ khách hàng (Image 02) - Cả F0, F1, F2 */}
            {isNavAllowed('customers') && activeNav === 'customers' && CustomerProfileViewComp && (
              <CustomerProfileViewComp
                customer={selectedCustomer}
                currentUser={currentUser}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                onScheduleCare={() => handleOpenScheduleCare()}
                onTriggerCall={() => handleTriggerCall()}
                showToast={showToast}
              />
            )}

            {/* View 3: SMARTSALES • HỘP THƯ ĐA KÊNH (Image 03) - Cả F0, F1, F2 */}
            {isNavAllowed('inbox') && activeNav === 'inbox' && OmnichannelInboxComp && (
              <OmnichannelInboxComp
                currentUser={currentUser}
                conversations={conversations}
                onSelectCustomerProfile={() => handleNavigate('customers')}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                onOpenCreateQuote={() => handleOpenCreateQuote()}
                onOpenCreateTicket={() => handleOpenCreateTicket()}
                onOpenScheduleCare={() => handleOpenScheduleCare()}
                showToast={showToast}
              />
            )}

            {/* View 4: Đơn hàng (Orders) - F0 và F1 */}
            {isNavAllowed('orders') && activeNav === 'orders' && OrdersViewComp && (
              <OrdersViewComp
                currentUser={currentUser}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                showToast={showToast}
              />
            )}

            {/* View 5: Sản phẩm & Báo giá (Products / Quotations) - F0 và F1 */}
            {isNavAllowed('products') && activeNav === 'products' && CRMViewComp && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <CRMViewComp
                  currentUser={currentUser}
                  activeTab="quotations"
                  hideNavBar={true}
                  showToast={showToast}
                />
              </div>
            )}

            {/* View 6: Chăm sóc (Care / Tickets / Follow-ups) - F0 và F1 */}
            {isNavAllowed('care') && activeNav === 'care' && CareViewComp && (
              <CareViewComp
                currentUser={currentUser}
                onOpenCreateTicket={() => handleOpenCreateTicket()}
                onScheduleCare={() => handleOpenScheduleCare()}
                onTriggerCall={(cus) => handleTriggerCall(cus)}
                showToast={showToast}
              />
            )}

            {/* View 7: Báo cáo & Xu hướng AI (Reports & Trends) - F0 và F1 */}
            {isNavAllowed('reports') && activeNav === 'reports' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {TrendDashboardComp ? (
                  <TrendDashboardComp
                    trendsData={window.MockData?.trends}
                    showToast={showToast}
                    onOpenChat={() => handleNavigate('inbox')}
                    onAddToCatalog={(p) => {
                      showToast(`Đã thêm sản phẩm "${p.name}" vào danh mục kho hàng!`, 'success');
                    }}
                  />
                ) : CRMViewComp ? (
                  <CRMViewComp
                    currentUser={currentUser}
                    activeTab="reports"
                    showToast={showToast}
                  />
                ) : null}
              </div>
            )}

            {/* View 8: Cài đặt (Settings) - F0 và F1 */}
            {isNavAllowed('settings') && activeNav === 'settings' && CRMViewComp && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <CRMViewComp
                  currentUser={currentUser}
                  activeTab="settings"
                  hideNavBar={true}
                  showToast={showToast}
                />
              </div>
            )}
          </main>
        </div>

        {/* 3a. Interactive Modal for Order / Quote / Ticket / Follow-up */}
        {OrderModalComp && (
          <OrderModalComp
            isOpen={modalState.isOpen}
            type={modalState.type}
            customer={modalState.customer}
            onClose={handleCloseModal}
            showToast={showToast}
          />
        )}

        {/* 3b. Simulated VoIP Call Modal */}
        {CallModalComp && (
          <CallModalComp
            isOpen={isCallOpen}
            customer={callCustomer}
            onClose={() => setIsCallOpen(false)}
            showToast={showToast}
          />
        )}

        {/* 3c. Login & Account Switcher Modal (F0 / F1 / F2) */}
        {LoginModalComp && (
          <LoginModalComp
            isOpen={isLoginModalOpen || !currentUser}
            onClose={currentUser ? () => setIsLoginModalOpen(false) : null}
            onLoginSuccess={handleSwitchAccount}
            currentUserId={currentUser?.uid}
          />
        )}

        {/* 4. Global Toast Notification Popup */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-bounce">
            <div
              className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold ${
                toast.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : toast.type === 'info'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <span>{toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✓'}</span>
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  window.App = App;

  // Mount into #root
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(window.React.createElement(App));
  }
})();
