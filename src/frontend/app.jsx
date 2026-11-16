/**
 * SmartSales Suite - Main Application Component (React SPA)
 * ──────────────────────────────────────────────────────────
 * Implements the unified modern layout matching Image 01, Image 02, and Image 03:
 * - Left: Unified Sidebar with SmartSales logo & vertical navigation
 * - Top: Unified Header with global search, notifications, greeting, user profile
 * - Center Views:
 *   1. 'overview'  -> OverviewView (Image 01: Welcome, 4 KPI cards, wave curve chart, to-do list)
 *   2. 'inbox'     -> OmnichannelInbox (Image 03: 3 columns, channel filter, AI reply suggestion, customer 360 sidebar)
 *   3. 'customers' -> CustomerProfileView (Image 02: Hero profile, Gold badge, interaction timeline, care schedule)
 *   4. 'orders'    -> Orders & Fulfillment tracking view
 *   5. 'products'  -> Products & Financial Quotation snapshots
 *   6. 'care'      -> Customer Care Tickets with SLAs & Follow-ups
 *   7. 'reports'   -> AI Trend Research, forecasting & Conversion funnel
 *   8. 'settings'  -> Settings & RBAC permission matrix
 * - Interactive Modal: OrderModal for creating orders, quotes, tickets, and follow-ups.
 */

(function () {
  'use strict';

  const { useState, useEffect, useCallback, useContext, createContext, useMemo } = window.React;
  const { createRoot } = window.ReactDOM;

  const AuthContext = createContext(null);
  const AppContext = createContext(null);

  window.AuthContext = AuthContext;
  window.AppContext = AppContext;

  const DEFAULT_USER = {
    uid: 'EMP001',
    name: 'Nam',
    role: 'admin',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
  };

  function App() {
    // Current Active Navigation View
    // 'overview' | 'inbox' | 'customers' | 'orders' | 'products' | 'care' | 'reports' | 'settings'
    const [activeNav, setActiveNav] = useState('overview');

    const [currentUser, setCurrentUser] = useState(DEFAULT_USER);
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

    return (
      <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased select-none">
        {/* 1. Left Unified Sidebar (SmartSales Navigation) */}
        {SidebarComp && (
          <SidebarComp
            activeNav={activeNav}
            onNavigate={(navId) => setActiveNav(navId)}
            unreadCount={18}
            currentUser={currentUser}
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
                  // If searching phone or customer, navigate to customer view
                  if (/^[0-9+]+$/.test(term.trim())) {
                    setActiveNav('customers');
                  }
                }
              }}
            />
          )}

          {/* Dynamic Content Views */}
          <main className="flex-1 overflow-hidden flex flex-col">
            {/* View 1: 01. Tổng quan (Image 01) */}
            {activeNav === 'overview' && OverviewViewComp && (
              <OverviewViewComp
                currentUser={currentUser}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                onNavigate={(navId) => setActiveNav(navId)}
              />
            )}

            {/* View 2: 02. Hồ sơ khách hàng (Image 02) */}
            {activeNav === 'customers' && CustomerProfileViewComp && (
              <CustomerProfileViewComp
                customer={selectedCustomer}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                onScheduleCare={() => handleOpenScheduleCare()}
                onTriggerCall={() => handleTriggerCall()}
                showToast={showToast}
              />
            )}

            {/* View 3: SMARTSALES • HỘP THƯ ĐA KÊNH (Image 03) */}
            {activeNav === 'inbox' && OmnichannelInboxComp && (
              <OmnichannelInboxComp
                currentUser={currentUser}
                conversations={conversations}
                onSelectCustomerProfile={() => setActiveNav('customers')}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                onOpenCreateQuote={() => handleOpenCreateQuote()}
                onOpenCreateTicket={() => handleOpenCreateTicket()}
                onOpenScheduleCare={() => handleOpenScheduleCare()}
                showToast={showToast}
              />
            )}

            {/* View 4: Đơn hàng (Orders) */}
            {activeNav === 'orders' && OrdersViewComp && (
              <OrdersViewComp
                currentUser={currentUser}
                onOpenCreateOrder={() => handleOpenCreateOrder()}
                showToast={showToast}
              />
            )}

            {/* View 5: Sản phẩm & Báo giá (Products / Quotations) */}
            {activeNav === 'products' && CRMViewComp && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <CRMViewComp
                  currentUser={currentUser}
                  activeTab="quotations"
                  hideNavBar={true}
                  showToast={showToast}
                />
              </div>
            )}

            {/* View 6: Chăm sóc (Care / Tickets / Follow-ups) */}
            {activeNav === 'care' && CareViewComp && (
              <CareViewComp
                currentUser={currentUser}
                onOpenCreateTicket={() => handleOpenCreateTicket()}
                onScheduleCare={() => handleOpenScheduleCare()}
                onTriggerCall={(cus) => handleTriggerCall(cus)}
                showToast={showToast}
              />
            )}

            {/* View 7: Báo cáo & Xu hướng AI (Reports & Trends) */}
            {activeNav === 'reports' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {TrendDashboardComp ? (
                  <TrendDashboardComp
                    trendsData={window.MockData?.trends}
                    showToast={showToast}
                    onOpenChat={() => setActiveNav('inbox')}
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

            {/* View 8: Cài đặt (Settings) */}
            {activeNav === 'settings' && CRMViewComp && (
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

        {/* 3. Global Order / Quote / Ticket / Care Modal */}
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
