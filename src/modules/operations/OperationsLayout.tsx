import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Calculator,
  ClipboardList,
  Headphones,
  HelpCircle,
  LayoutDashboard,
  Menu,
  MessageSquare,
  ShoppingBag,
  ShieldCheck,
  Package,
  Settings,
  Truck,
  TrendingUp,
  Users,
  X,
  Zap,
  Warehouse,
} from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { MainSidebar } from '../../components/Navigation'
import { useI18n } from '../../i18n'
import { APP_MODE } from '../../services/inboxService'
import OperationsProvider from './OperationsProvider'
import { MODULE_ROUTES, OPERATIONS_MODULES } from './registry'
import { Modal } from '../../components/shared'
import IntegrationSettingsPanel from '../settings/IntegrationSettingsPanel'
import { useOperations } from './context'
import { canAccessModule, getDefaultRoute, isAdministrator, useAppAccess } from './access'

const icons = {
  Admin: ShieldCheck,
  Dashboard: LayoutDashboard,
  CRM: Users,
  'Customer Care': Headphones,
  Orders: ShoppingBag,
  Logistics: Truck,
  Inventory: Warehouse,
  Products: Package,
  'Market Intelligence': TrendingUp,
  Reports: BarChart3,
  Accounting: Calculator,
}
export default function OperationsLayout() {
  const { t, label, locale, setLocale } = useI18n()
  const access = useAppAccess()
  const location = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState<string | null>(null)
  const current =
    OPERATIONS_MODULES.find((module) => location.pathname.startsWith(module.path)) ||
    OPERATIONS_MODULES[0]
  const currentName = current.name
  const allowed = canAccessModule(currentName, access)
  const inventoryRoute = currentName === 'Inventory'
  const marketRoute = currentName === 'Market Intelligence'
  const accountingRoute = currentName === 'Accounting'
  const adminWorkspace = ['Admin', 'Market Intelligence'].includes(currentName)
  const plannedRoute = currentName === 'Products'
  useEffect(() => {
    document.title = `${label(currentName)} · SmartSales Suite`
  }, [currentName, label])
  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false)
    }
    document.addEventListener('keydown', closeMenu)
    return () => document.removeEventListener('keydown', closeMenu)
  }, [])
  const isTestEnv = import.meta.env.MODE === 'test' || import.meta.env.VITEST === true
  const navigateModule = (name: string) => {
    const path = MODULE_ROUTES[name]
    if (path) navigate(path)
    else setDialog(name)
  }
  if (!allowed) return <Navigate to={getDefaultRoute(access)} replace />
  return (
    <div className={`app-shell ops-shell ${isAdministrator(access) ? 'admin-navigation' : ''}`}>
      <MainSidebar
        activeModule={currentName}
        onModule={navigateModule}
        onHelp={() => setDialog('help')}
        mode={APP_MODE}
        adminMode={adminWorkspace}
        topbarNavigation={!adminWorkspace}
      />
      <div className="main-area">
        <header className="ops-topbar">
          <div className="ops-brand">
            <button
              className="icon-button ops-mobile-toggle"
              aria-label={t('Mở điều hướng', 'Open navigation')}
              aria-expanded={menu}
              aria-controls="operations-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <Zap size={20} />
            <Link to={adminWorkspace ? '/admin' : getDefaultRoute(access)}>
              smartsales<span>.</span>
            </Link>
            <span className="ops-top-divider" />
            <span className="ops-top-context">
              {adminWorkspace
                ? t('Trung tâm quản trị', 'Administration center')
                : accountingRoute
                  ? t('Trung tâm kế toán', 'Accounting workspace')
                  : t('Trung tâm vận hành', 'Operations workspace')}
            </span>
            {isTestEnv && !adminWorkspace && (
              <nav
                className="ops-top-module-links"
                aria-label={t('Điều hướng nhanh', 'Quick navigation')}
              >
                {canAccessModule('Reports', access) && (
                  <NavLink to="/reports" end>
                    <BarChart3 size={16} />
                    {t('Báo cáo', 'Reports')}
                  </NavLink>
                )}
                {canAccessModule('Admin', access) && (
                  <NavLink to="/admin" end>
                    <ShieldCheck size={16} />
                    {t('Quản trị', 'Administration')}
                  </NavLink>
                )}
              </nav>
            )}
          </div>
          <div className="ops-top-actions">
            <span
              className="ops-demo-mode"
              title={
                inventoryRoute
                  ? t('Kho · API độc lập', 'Inventory · independent API')
                  : marketRoute
                    ? t('AI thị trường · Gemini Search', 'Market AI · Gemini Search')
                    : accountingRoute
                      ? t('Kế toán · sổ sách & duyệt mua', 'Accounting · books & purchase review')
                      : plannedRoute
                        ? t('Đang chờ triển khai', 'Awaiting implementation')
                        : APP_MODE === 'demo'
                          ? t('Demo · dữ liệu cục bộ', 'Demo · local data')
                          : t('Trực tiếp · qua API', 'Live · API adapter')
              }
            >
              <span aria-hidden="true" />
              <span className="ops-mode-full">
                {inventoryRoute
                  ? t('Kho · API độc lập', 'Inventory · independent API')
                  : marketRoute
                    ? t('AI thị trường · Gemini Search', 'Market AI · Gemini Search')
                    : accountingRoute
                      ? t('Kế toán · sổ sách & duyệt mua', 'Accounting · books & purchase review')
                      : plannedRoute
                        ? t('Đang chờ triển khai', 'Awaiting implementation')
                        : APP_MODE === 'demo'
                          ? t('Demo · dữ liệu cục bộ', 'Demo · local data')
                          : t('Trực tiếp · qua API', 'Live · API adapter')}
              </span>
              <span className="ops-mode-short">
                {inventoryRoute
                  ? 'API'
                  : marketRoute
                    ? 'AI'
                    : accountingRoute
                      ? t('KT', 'Acct')
                      : plannedRoute
                        ? t('Kế hoạch', 'Planned')
                        : APP_MODE === 'demo'
                          ? 'Demo'
                          : 'Live'}
              </span>
            </span>
            <div
              className="language-switch"
              role="group"
              aria-label={t('Ngôn ngữ giao diện', 'Interface language')}
            >
              <button
                lang="vi"
                aria-label="Tiếng Việt"
                aria-pressed={locale === 'vi'}
                onClick={() => setLocale('vi')}
              >
                VI
              </button>
              <button
                lang="en"
                aria-label="English"
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>
            {currentName !== 'Admin' && canAccessModule('Inbox', access) && (
              <Link to="/inbox" className="ops-open-inbox">
                <MessageSquare size={14} />
                {t('Hộp thư', 'Inbox')}
                <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        </header>
        {menu && (
          <nav
            id="operations-navigation"
            className="ops-mobile-navigation"
            aria-label={t('Các phân hệ vận hành', 'Operations modules')}
          >
            <div className="ops-module-links">
              {OPERATIONS_MODULES.filter(
                (module) => currentName !== 'Admin' && canAccessModule(module.name, access),
              ).map((module) => {
                const Icon = icons[module.name as keyof typeof icons]
                return (
                  <NavLink key={module.path} to={module.path} onClick={() => setMenu(false)}>
                    <Icon size={16} />
                    {label(module.name)}
                  </NavLink>
                )
              })}
              {currentName === 'Admin' &&
                [
                  {
                    path: '/admin',
                    label: t('Tổng quan quản trị', 'Admin overview'),
                    icon: BarChart3,
                  },
                  {
                    path: '/admin/sales',
                    label: t('Báo cáo bán hàng', 'Sales reports'),
                    icon: ShoppingBag,
                  },
                  {
                    path: '/admin/care',
                    label: t('Tin nhắn & chăm sóc', 'Messages & care'),
                    icon: Headphones,
                  },
                  {
                    path: '/admin/work',
                    label: t('Công việc & nhân sự', 'Work & staffing'),
                    icon: ClipboardList,
                  },
                  ...(APP_MODE === 'live'
                    ? [
                        {
                          path: '/admin/team',
                          label: t('Tài khoản & phân quyền', 'Accounts & permissions'),
                          icon: Users,
                        },
                      ]
                    : []),
                ].map(({ path, label: itemLabel, icon: Icon }) => (
                  <NavLink key={path} to={path} end onClick={() => setMenu(false)}>
                    <Icon size={16} />
                    {itemLabel}
                  </NavLink>
                ))}
              {currentName !== 'Admin' && canAccessModule('Inbox', access) && (
                <Link to="/inbox">
                  <MessageSquare size={16} />
                  {label('Inbox')}
                </Link>
              )}
              {canAccessModule('Admin', access) && (
                <button
                  className="ops-mobile-action"
                  onClick={() => {
                    setMenu(false)
                    setDialog('Settings')
                  }}
                >
                  <Settings size={16} />
                  {label('Settings')}
                </button>
              )}
              <button
                className="ops-mobile-action"
                onClick={() => {
                  setMenu(false)
                  setDialog('help')
                }}
              >
                <HelpCircle size={16} />
                {t('Trợ giúp', 'Help')}
              </button>
            </div>
            <button
              className="icon-button ops-mobile-close"
              aria-label={t('Đóng điều hướng', 'Close navigation')}
              onClick={() => setMenu(false)}
            >
              <X size={18} />
            </button>
          </nav>
        )}
        <div className="ops-content">
          {inventoryRoute || plannedRoute || marketRoute || accountingRoute ? (
            <>
              <Outlet />
              {dialog && (
                <Modal
                  title={
                    dialog === 'Settings'
                      ? t('Cài đặt vận hành', 'Operations settings')
                      : dialog === 'help'
                        ? t('Các phân hệ SmartSales', 'SmartSales modules')
                        : marketRoute
                          ? t('Phân tích thị trường bằng AI', 'AI market intelligence')
                          : plannedRoute
                            ? t('Lộ trình triển khai', 'Implementation roadmap')
                            : t('Quản lý kho', 'Inventory management')
                  }
                  wide={dialog === 'Settings'}
                  onClose={() => setDialog(null)}
                >
                  <div className="modal-body">
                    {dialog === 'Settings' ? (
                      <IntegrationSettingsPanel />
                    ) : (
                      <>
                        <p>
                          {dialog === 'help'
                            ? accountingRoute
                              ? t(
                                  'Đối chiếu nhà cung cấp, mặt hàng, số lượng và giá vốn trước khi duyệt. Quản lý kho chỉ nhận hàng sau khi đơn được duyệt; sổ kế toán chỉ ghi nhận bút toán đã ghi sổ.',
                                  'Verify supplier, items, quantities and costs before approval. The warehouse manager can receive goods only after approval; the ledger includes posted entries only.',
                                )
                              : t(
                                  'Bắt đầu từ hồ sơ khách hàng, tạo đơn hàng, xác nhận và đóng gói, sau đó tạo vận đơn. Mọi yêu cầu chăm sóc đều có thể liên kết khách hàng, đơn hàng và hội thoại.',
                                  'Start with a customer profile, create an order, confirm and pack it, then create a shipment. Support requests can be linked to customers, orders and conversations.',
                                )
                            : marketRoute
                              ? t(
                                  'Phân tích thị trường cần API ở chế độ Live, phiên owner/admin và GEMINI_API_KEY được cấu hình trên máy chủ. Gemini tự tìm thông tin công khai trên web và trả về bản phân tích ngắn.',
                                  'Market intelligence requires the Live API, an owner/admin session, and GEMINI_API_KEY configured on the server. Gemini searches public web information and returns a concise analysis.',
                                )
                              : plannedRoute
                                ? t(
                                    'Hoàn thiện và nghiệm thu kho trước, sau đó triển khai phân tích thị trường, sản phẩm và tích hợp toàn hệ thống theo thứ tự. Báo cáo đã hoạt động và cập nhật theo dữ liệu vận hành.',
                                    'Complete and accept inventory first, then implement market intelligence, products and system integration in order. Reports are available and use current operations data.',
                                  )
                                : t(
                                    'Kho sử dụng API và phiên đăng nhập riêng. Tạo doanh nghiệp và quyền truy cập bằng công cụ quản trị server; mọi thay đổi tồn phải qua chứng từ. Xem docs/inventory-api.md để cấu hình.',
                                    'Inventory uses its own API and login session. Provision a tenant and access through the server administration tool; all stock changes require documents. See docs/inventory-api.md for setup.',
                                  )}
                        </p>
                        <button className="button button-primary" onClick={() => setDialog(null)}>
                          {t('Đóng', 'Close')}
                        </button>
                      </>
                    )}
                  </div>
                </Modal>
              )}
            </>
          ) : (
            <OperationsProvider>
              <Outlet />
              {dialog && <WorkspaceDialog name={dialog} onClose={() => setDialog(null)} />}
            </OperationsProvider>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkspaceDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { t, label } = useI18n()
  const { service, run, busy } = useOperations()
  const [confirming, setConfirming] = useState(false)
  const reset = async () => {
    try {
      await run(
        () => service.reset(),
        t('Đã khôi phục dữ liệu vận hành Demo.', 'Demo operations restored.'),
      )
      onClose()
    } catch {
      /* Provider displays errors. */
    }
  }
  return (
    <Modal
      title={
        name === 'help'
          ? t('Các phân hệ SmartSales', 'SmartSales modules')
          : name === 'Settings'
            ? t('Cài đặt vận hành', 'Operations settings')
            : `${label(name)} · SmartSales`
      }
      wide={name === 'Settings'}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="modal-body">
        {name === 'help' ? (
          <>
            <p>
              {t(
                'Bắt đầu từ hồ sơ khách hàng, tạo đơn hàng, xác nhận và đóng gói, sau đó tạo vận đơn. Mọi yêu cầu chăm sóc đều có thể liên kết khách hàng, đơn hàng và hội thoại.',
                'Start with a customer profile, create an order, confirm and pack it, then create a shipment. Support requests can be linked to customers, orders and conversations.',
              )}
            </p>
            <p className="ops-form-hint">
              {t(
                'Mọi kênh và hãng vận chuyển trong chế độ Demo đều là mô phỏng; dữ liệu chỉ lưu trong trình duyệt.',
                'All Demo channels and carriers are simulated; data is saved only in your browser.',
              )}
            </p>
          </>
        ) : name === 'Settings' ? (
          <>
            <IntegrationSettingsPanel />
            {APP_MODE === 'demo' && (
              <div className="ops-form-section">
                {confirming ? (
                  <>
                    <p>
                      {t(
                        'Đặt lại đơn hàng, tồn kho, vận đơn, ticket và thông tin chăm sóc về dữ liệu mẫu? Hồ sơ liên hệ và hội thoại vẫn được giữ.',
                        'Reset orders, stock, shipments, tickets and care profiles to seed data? Contact records and conversations will be preserved.',
                      )}
                    </p>
                    <div className="ops-record-actions">
                      <button
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() => setConfirming(false)}
                      >
                        {t('Hủy', 'Cancel')}
                      </button>
                      <button
                        className="button button-danger"
                        disabled={busy}
                        onClick={() => void reset()}
                      >
                        {t('Xác nhận khôi phục', 'Confirm restore')}
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="button button-secondary" onClick={() => setConfirming(true)}>
                    {t('Khôi phục dữ liệu vận hành Demo', 'Restore Demo operations')}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <p>
            {t(
              'Phân hệ này sẽ được bổ sung trong giai đoạn tiếp theo. Khách hàng, chăm sóc khách hàng, đơn hàng và vận chuyển hiện đã có thể sử dụng.',
              'This module is planned for a future release. Customers, Customer Care, Orders and Logistics are available now.',
            )}
          </p>
        )}
        <div className="ops-record-actions">
          <button className="button button-primary" disabled={busy} onClick={onClose}>
            {t('Đóng', 'Close')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
