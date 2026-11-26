import {
  Check,
  CheckCircle2,
  CircleAlert,
  Command,
  Inbox,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import type {
  Conversation,
  ConversationPatch,
  CustomerPatch,
  InboxData,
  InboxView,
  SendMessageInput,
} from './types/inbox'
import { APP_MODE, inboxService } from './services/inboxService'
import { AUTH_SESSION_EXPIRED_EVENT } from './services/authSession'
import { InventoryApiError, inventoryService } from './modules/inventory/service'
import { operationsService } from './modules/operations/service'
import { filterConversations } from './lib/inbox'
import type { InboxFilters } from './lib/inbox'
import { clearDrafts, draftNamespace } from './lib/drafts'
import { ChannelBar, InboxSidebar, MainSidebar } from './components/Navigation'
import { ConversationList } from './components/ConversationList'
import { ConversationWorkspace } from './components/ConversationWorkspace'
import CustomerDetails from './components/CustomerDetails'
import { Modal } from './components/shared'
import IntegrationSettingsPanel from './modules/settings/IntegrationSettingsPanel'
import I18nProvider from './i18n/I18nProvider'
import { useI18n, translateMessage } from './i18n'
import { MODULE_ROUTES } from './modules/operations/registry'
import {
  AppAccessContext,
  DEMO_ACCESS,
  canAccessModule,
  getDefaultRoute,
  isAdministrator,
  useAppAccess,
} from './modules/operations/access'
import type { AppAccess } from './modules/operations/access'
import './modules/operations/operations.css'

const OperationsLayout = lazy(() => import('./modules/operations/OperationsLayout'))
const AdminPage = lazy(() => import('./modules/admin/AdminPage'))
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'))
const CustomersPage = lazy(() => import('./modules/customers/CustomersPage'))
const CarePage = lazy(() => import('./modules/care/CarePage'))
const OrdersPage = lazy(() => import('./modules/orders/OrdersPage'))
const LogisticsPage = lazy(() => import('./modules/logistics/LogisticsPage'))
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage'))
const InventoryAuthPage = lazy(() => import('./modules/inventory/InventoryAuthPage'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'))
const AccountantWorkspace = lazy(() => import('./modules/reports/AccountantWorkspace'))
const MarketIntelligencePage = lazy(
  () => import('./modules/market-intelligence/MarketIntelligencePage'),
)
const ChannelConnections = lazy(() => import('./components/ChannelConnections'))
const QuotationBuilder = lazy(() => import('./components/QuotationBuilder'))

const initialFilters: InboxFilters = {
  search: '',
  status: 'all',
  channel: 'all',
  assignee: 'all',
  view: 'all',
}
type Toast = { id: number; text: string; kind: 'success' | 'error' }
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thể thực hiện thao tác. Vui lòng thử lại.'

export default function App() {
  return (
    <I18nProvider>
      <Suspense fallback={<LoadingSkeleton />}>
        <Routes>
          <Route path="/login" element={<InventoryAuthPage />} />
          <Route path="/register" element={<InventoryAuthPage />} />
          <Route element={<RequireAuthentication />}>
            <Route
              path="/inbox"
              element={
                <RequireModuleAccess module="Inbox">
                  <InboxPage />
                </RequireModuleAccess>
              }
            />
            <Route element={<OperationsLayout />}>
              <Route path="/admin/*" element={<AdminPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/care" element={<CarePage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/logistics" element={<LogisticsPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/products" element={<InventoryPage catalogOnly />} />
              <Route path="/market-intelligence" element={<MarketIntelligencePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/accounting" element={<AccountantWorkspace />} />
            </Route>
            <Route path="/access-denied" element={<AccessDeniedPage />} />
            <Route path="*" element={<DefaultRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </I18nProvider>
  )
}

function RequireAuthentication() {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'error'>(
    APP_MODE === 'live' ? 'checking' : 'authenticated',
  )
  const [access, setAccess] = useState<AppAccess>(DEMO_ACCESS)
  const [error, setError] = useState('')
  const from = `${pathname}${search}${hash}`
  const checkSession = useCallback(async () => {
    if (APP_MODE !== 'live') {
      setAccess(DEMO_ACCESS)
      setStatus('authenticated')
      return
    }
    setStatus('checking')
    setError('')
    try {
      const session = await inventoryService.checkSession()
      setAccess({ role: session.user.role, permissions: session.permissions })
      setStatus('authenticated')
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) {
        setStatus('unauthenticated')
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể xác minh phiên đăng nhập.', 'Unable to verify the sign-in session.'),
      )
      setStatus('error')
    }
  }, [t])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    if (status === 'unauthenticated') navigate('/login', { replace: true, state: { from } })
  }, [from, navigate, status])

  useEffect(() => {
    const expire = () => navigate('/login', { replace: true, state: { from } })
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expire)
  }, [from, navigate])

  if (status === 'authenticated')
    return (
      <AppAccessContext.Provider value={access}>
        <Outlet />
      </AppAccessContext.Provider>
    )
  if (status === 'unauthenticated' || status === 'checking') return <LoadingSkeleton />
  return (
    <main className="ops-load-error" role="alert">
      <h2>{t('Không thể xác minh phiên đăng nhập', 'Unable to verify sign-in')}</h2>
      <p>{error}</p>
      <button className="button button-primary" onClick={() => void checkSession()}>
        {t('Thử lại', 'Retry')}
      </button>
    </main>
  )
}

function RequireModuleAccess({ module, children }: { module: string; children: ReactNode }) {
  const access = useAppAccess()
  return canAccessModule(module, access) ? (
    children
  ) : (
    <Navigate to={getDefaultRoute(access)} replace />
  )
}

function DefaultRoute() {
  const access = useAppAccess()
  return <Navigate to={getDefaultRoute(access)} replace />
}

function AccessDeniedPage() {
  const { t } = useI18n()
  return (
    <main className="ops-load-error">
      <h1>{t('Chưa được cấp chức năng', 'No assigned workspace')}</h1>
      <p>
        {t(
          'Tài khoản này chưa được cấp quyền vào phân hệ nào. Hãy liên hệ quản trị viên để cập nhật vai trò.',
          'This account has no assigned workspace. Contact an administrator to update its role.',
        )}
      </p>
    </main>
  )
}
function InboxPage() {
  const navigate = useNavigate()
  const { locale, t, label } = useI18n()
  const access = useAppAccess()
  const canManageInbox = access.permissions.includes('inbox.manage')
  const canMessage = access.permissions.includes('inbox.message')
  const canEditCustomer = access.permissions.includes('customers.manage')
  const canCreateOrder = access.permissions.includes('salesOrder.create')
  const canCreateQuote = canAccessModule('Products', access)
  const [data, setData] = useState<InboxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<InboxFilters>(initialFilters)
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(
    () => params.get('conversation') || 'conv-001',
  )
  const [collapsed, setCollapsed] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(() => window.innerWidth >= 1280)
  const [mobileNavigation, setMobileNavigation] = useState(false)
  const [mobileChat, setMobileChat] = useState(() => Boolean(params.get('conversation')))
  const [busy, setBusy] = useState(false)
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0)
  const [modal, setModal] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastCounter = useRef(0)
  const pendingMutation = useRef(false)
  const revisions = useRef(new Map<string, number>())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const mode = APP_MODE === 'live' ? 'live' : 'demo'
  const notify = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    const id = ++toastCounter.current
    setToasts((old) => [...old.filter((item) => item.text !== text), { id, text, kind }].slice(-3))
    timers.current.push(
      setTimeout(() => setToasts((old) => old.filter((item) => item.id !== id)), 5000),
    )
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await inboxService.load())
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('[data-conversation-search]')?.focus()
      }
      if (event.key === 'Escape') {
        setMobileNavigation(false)
        if (window.innerWidth < 1280) setDetailsOpen(false)
      }
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])
  useEffect(() => {
    const id = params.get('conversation')
    if (id) {
      setSelectedId(id)
      setMobileChat(true)
    }
  }, [params])
  const conversations = useMemo(
    () => (data ? filterConversations(data, filters) : []),
    [data, filters],
  )
  const selected = data?.conversations.find((c) => c.id === selectedId)
  const customer = data?.customers.find((c) => c.id === selected?.customerId)
  const replaceConversation = (updated: Conversation) =>
    setData((old) =>
      old
        ? {
            ...old,
            conversations: old.conversations.map((c) => (c.id === updated.id ? updated : c)),
          }
        : old,
    )
  const runMutation = async <T,>(
    action: () => Promise<T>,
    apply: (result: T) => void,
    success: string,
  ) => {
    if (pendingMutation.current)
      throw new Error('Một thao tác đang được xử lý. Vui lòng thử lại sau.')
    pendingMutation.current = true
    setBusy(true)
    try {
      const result = await action()
      apply(result)
      notify(success)
    } catch (cause) {
      notify(errorText(cause), 'error')
      throw cause
    } finally {
      pendingMutation.current = false
      setBusy(false)
    }
  }
  const updateConversation = async (patch: ConversationPatch) => {
    if (!selectedId) return
    revisions.current.set(selectedId, (revisions.current.get(selectedId) || 0) + 1)
    await runMutation(
      () => inboxService.updateConversation(selectedId, patch),
      replaceConversation,
      'Đã cập nhật hội thoại.',
    )
  }
  const updateCustomer = async (patch: CustomerPatch) => {
    if (!customer) return
    await runMutation(
      () => inboxService.updateCustomer(customer.id, patch),
      (updated) =>
        setData((old) =>
          old
            ? { ...old, customers: old.customers.map((c) => (c.id === updated.id ? updated : c)) }
            : old,
        ),
      'Đã lưu thông tin khách hàng.',
    )
  }
  const send = async (input: SendMessageInput) => {
    if (!selectedId) return
    const channel = data?.conversations.find((item) => item.id === selectedId)?.channel
    revisions.current.set(selectedId, (revisions.current.get(selectedId) || 0) + 1)
    await runMutation(
      () => inboxService.sendMessage(selectedId, input),
      replaceConversation,
      input.type === 'note'
        ? 'Đã thêm ghi chú nội bộ.'
        : mode === 'demo'
          ? 'Đã gửi tin nhắn Demo trong trình duyệt.'
          : channel === 'telegram'
            ? t('Telegram đã xác nhận gửi tin nhắn.', 'Telegram confirmed the message was sent.')
            : 'API đã tiếp nhận tin nhắn.',
    )
  }
  const selectConversation = (id: string) => {
    setSelectedId(id)
    setMobileChat(true)
    setParams({ conversation: id }, { replace: true })
    const c = data?.conversations.find((item) => item.id === id)
    if (c?.unread && canManageInbox && !pendingMutation.current) {
      const revision = revisions.current.get(id) || 0
      void inboxService.updateConversation(id, { unread: 0 }).then(
        (updated) => {
          if ((revisions.current.get(id) || 0) !== revision) return
          setData((old) =>
            old
              ? {
                  ...old,
                  conversations: old.conversations.map((item) =>
                    item.id === id ? { ...item, unread: updated.unread } : item,
                  ),
                }
              : old,
          )
        },
        (cause) => notify(errorText(cause), 'error'),
      )
    }
  }
  const setView = (view: InboxView) => {
    setFilters({ ...initialFilters, view })
    setMobileNavigation(false)
    setMobileChat(false)
  }
  const reset = async () => {
    try {
      await runMutation(
        async () => {
          if (!error && data) return inboxService.resetConversations()
          // Explicit recovery replaces both datasets so no orphan customer references remain.
          const restored = await inboxService.reset()
          setData(restored)
          await operationsService.reset()
          return restored
        },
        setData,
        'Đã khôi phục dữ liệu Demo ban đầu.',
      )
      setError('')
      setFilters(initialFilters)
      setSelectedId('conv-001')
      clearDrafts(draftNamespace(mode, import.meta.env.VITE_API_BASE_URL))
      setWorkspaceEpoch((epoch) => epoch + 1)
      setParams({}, { replace: true })
      setModal(null)
    } catch {
      /* Error toast is displayed. */
    }
  }
  const moduleClick = (name: string) => {
    if (name !== 'Inbox' && MODULE_ROUTES[name]) {
      navigate(MODULE_ROUTES[name])
      return
    }
    if (name === 'Inbox') {
      setView('all')
      setModal(null)
    } else setModal(name)
  }
  return (
    <div
      className={`app-shell ${isAdministrator(access) ? 'admin-navigation' : ''} ${collapsed ? 'sidebar-collapsed' : ''} ${detailsOpen ? 'details-visible' : ''} ${mobileChat ? 'show-mobile-chat' : ''}`}
    >
      <MainSidebar onModule={moduleClick} onHelp={() => setModal('help')} mode={mode} />
      <div className="main-area">
        <ChannelBar
          channel={filters.channel}
          onChannel={(channel) => {
            setFilters((old) => ({ ...old, channel }))
            setMobileChat(false)
          }}
          onMenu={() => setMobileNavigation(true)}
          mode={mode}
          canManageConnections={canManageInbox}
          onConnections={() => {
            if (!pendingMutation.current) setModal('connections')
          }}
        />
        {loading ? (
          <LoadingSkeleton />
        ) : error || !data ? (
          <div className="page-error">
            <div className="empty-icon">
              <CircleAlert size={30} />
            </div>
            <h2>{t('Không thể mở không gian làm việc', 'Unable to open workspace')}</h2>
            <p>
              {error
                ? translateMessage(error, locale)
                : t('Chưa tải được dữ liệu.', 'Data has not loaded yet.')}
            </p>
            <div>
              <button className="button button-primary" onClick={() => void load()}>
                {t('Thử lại', 'Try again')}
              </button>
              {mode === 'demo' && (
                <button className="button button-secondary" onClick={() => setModal('reset')}>
                  {t('Khôi phục dữ liệu Demo', 'Restore Demo data')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="inbox-layout">
            <InboxSidebar
              data={data}
              view={filters.view}
              onView={setView}
              collapsed={collapsed}
              onCollapse={() => setCollapsed(!collapsed)}
              mobileOpen={mobileNavigation}
              onMobileClose={() => setMobileNavigation(false)}
              onHelp={() => setModal('help')}
              mode={mode}
            />
            <ConversationList
              data={data}
              conversations={conversations}
              filters={filters}
              onFilters={(patch) => setFilters((old) => ({ ...old, ...patch }))}
              selectedId={selectedId}
              onSelect={selectConversation}
              onClear={() => setFilters({ ...initialFilters, view: filters.view })}
            />
            {selected && customer ? (
              <>
                <ConversationWorkspace
                  key={`${selected.id}:${workspaceEpoch}`}
                  data={data}
                  conversation={selected}
                  customer={customer}
                  detailsOpen={detailsOpen}
                  busy={busy}
                  mode={mode}
                  canManage={canManageInbox}
                  canMessage={canMessage}
                  canCreateOrder={canCreateOrder}
                  canCreateQuote={canCreateQuote}
                  onToggleDetails={() => setDetailsOpen(!detailsOpen)}
                  onBack={() => setMobileChat(false)}
                  onUpdate={updateConversation}
                  onSend={send}
                  onNotify={notify}
                  onCreateQuote={() => setModal(`quotation:${selected.id}`)}
                />
                {detailsOpen && (
                  <>
                    <div className="details-overlay" onClick={() => setDetailsOpen(false)} />
                    <CustomerDetails
                      key={customer.id}
                      customer={customer}
                      conversation={selected}
                      agents={data.agents}
                      teams={data.teams}
                      onUpdateConversation={updateConversation}
                      onUpdateCustomer={updateCustomer}
                      onClose={() => setDetailsOpen(false)}
                      onNotify={notify}
                      busy={busy}
                      mode={mode}
                      canManageConversation={canManageInbox}
                      canEditCustomer={canEditCustomer}
                    />
                  </>
                )}
              </>
            ) : (
              <main className="no-selection">
                <div className="empty-icon">
                  <Inbox size={34} />
                </div>
                <h2>{t('Sẵn sàng hỗ trợ khách hàng', 'Your next great conversation')}</h2>
                <p>
                  {t(
                    'Chọn một hội thoại để bắt đầu hỗ trợ khách hàng.',
                    'Select a conversation to start helping your customers.',
                  )}
                </p>
                {selectedId && (
                  <button
                    className="button button-secondary"
                    onClick={() => selectConversation(conversations[0]?.id || 'conv-001')}
                  >
                    {t('Mở hội thoại đầu tiên', 'Open first conversation')}
                  </button>
                )}
              </main>
            )}
          </div>
        )}
      </div>
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
            <span>{translateMessage(toast.text, locale)}</span>
            <button
              aria-label={t('Đóng thông báo', 'Dismiss notification')}
              className="icon-button"
              onClick={() => setToasts((old) => old.filter((item) => item.id !== toast.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {busy && (
        <div className="saving-indicator">
          <LoaderCircle size={12} className="spin" /> {t('Đang lưu', 'Saving')}
        </div>
      )}
      {modal &&
        (modal === `quotation:${selected?.id}` && selected && customer ? (
          <Suspense fallback={<LoadingSkeleton />}>
            <QuotationBuilder
              key={selected.id}
              customer={customer}
              conversation={selected}
              onClose={() => setModal(null)}
              onNotify={notify}
            />
          </Suspense>
        ) : modal === 'connections' ? (
          <Suspense fallback={<LoadingSkeleton />}>
            <ChannelConnections
              mode={mode}
              onClose={() => setModal(null)}
              onSynced={setData}
              onNotify={notify}
            />
          </Suspense>
        ) : (
          <Modal
            title={
              modal === 'help'
                ? t('Chào mừng đến với không gian làm việc', 'Welcome to your workspace')
                : modal === 'reset'
                  ? t('Đặt lại không gian Demo?', 'Reset Demo workspace?')
                  : modal === 'Settings'
                    ? t('Cài đặt không gian làm việc', 'Workspace settings')
                    : `${label(modal)} · SmartSales Suite`
            }
            wide={modal === 'Settings'}
            onClose={() => {
              if (!busy) setModal(null)
            }}
          >
            {modal === 'help' ? (
              <div className="help-content">
                <div className="help-symbol">
                  <Zap size={26} />
                </div>
                <h3>{t('Mọi hội thoại. Một không gian.', 'Every conversation. One workspace.')}</h3>
                <p>
                  {t(
                    'Gom tin nhắn từ sàn và mạng xã hội. Mở Nguồn tin nhắn để liên kết hoặc thử nhập mẫu; tạo đơn ngay trong hội thoại của khách.',
                    'Bring marketplace and social messages together. Open Message sources to connect or import samples, then create orders inside customer conversations.',
                  )}
                </p>
                <div className="help-item">
                  <Command size={16} />
                  <span>
                    <kbd>/</kbd> {t('Tìm kiếm hội thoại', 'Search conversations')} <br />
                    <kbd>Ctrl + Enter</kbd> {t('Gửi tin nhắn', 'Send message')}
                  </span>
                </div>
                <div className="mode-explanation">
                  <strong>
                    {mode === 'demo'
                      ? t('Bạn đang ở chế độ Demo', 'You are in Demo Mode')
                      : t('Bạn đang ở chế độ trực tiếp', 'You are in Live Mode')}
                  </strong>
                  <p>
                    {mode === 'demo'
                      ? t(
                          'Dữ liệu được lưu trên trình duyệt này. Kênh liên lạc, trạng thái gửi và Trợ lý AI đều là mô phỏng; không gửi tin đến khách hàng thực.',
                          'Data is saved in this browser. Channels, delivery status and AI Copilot are simulated; no messages are sent to real customers.',
                        )
                      : t(
                          'Dữ liệu được tải từ API đã cấu hình. Kết nối nhà cung cấp kênh phải được xác minh tại backend.',
                          'Data comes from the configured API. Channel provider connections must be verified by the backend.',
                        )}
                  </p>
                </div>
                <button className="button button-primary" onClick={() => setModal(null)}>
                  {t('Bắt đầu sử dụng', 'Let’s get started')} <Check size={15} />
                </button>
              </div>
            ) : modal === 'reset' ? (
              <div className="modal-body">
                <p>
                  {error || !data
                    ? t(
                        'Khôi phục toàn bộ dữ liệu Demo để sửa lỗi: hồ sơ khách hàng, hội thoại, đơn hàng, tồn kho, vận đơn và ticket sẽ trở về dữ liệu mẫu. Mọi thay đổi Demo sẽ bị xóa.',
                        'Recover all Demo data: customers, conversations, orders, stock, shipments and tickets will return to seed data. All Demo changes will be deleted.',
                      )
                    : t(
                        'Khôi phục 15 hội thoại ban đầu sẽ xóa tin nhắn, ghi chú hội thoại và bản nháp Demo. Hồ sơ khách hàng, đơn hàng, vận đơn và ticket được giữ nguyên.',
                        'Restoring the original 15 conversations deletes Demo messages, conversation notes and drafts. Customer profiles, orders, shipments and tickets are preserved.',
                      )}
                </p>
                <div className="modal-actions">
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    {t('Hủy', 'Cancel')}
                  </button>
                  <button
                    className="button button-danger"
                    disabled={busy}
                    onClick={() => void reset()}
                  >
                    <RotateCcw size={14} />
                    {t('Đặt lại dữ liệu Demo', 'Reset Demo data')}
                  </button>
                </div>
              </div>
            ) : modal === 'Settings' ? (
              <div className="modal-body">
                <IntegrationSettingsPanel onManageChannels={() => setModal('connections')} />
                {mode === 'demo' && (
                  <button className="button button-secondary" onClick={() => setModal('reset')}>
                    <RotateCcw size={14} /> {t('Đặt lại dữ liệu Demo', 'Reset Demo data')}
                  </button>
                )}
              </div>
            ) : (
              <div className="modal-body module-preview">
                <div className="empty-icon">
                  <MessageSquare size={28} />
                </div>
                <h3>
                  {t(`${label(modal)} nằm trong kế hoạch phát triển`, `${modal} is on the roadmap`)}
                </h3>
                <p>
                  {t(
                    'Phân hệ này sẽ được triển khai trong các giai đoạn tiếp theo. Hộp thư đa kênh hiện đã sẵn sàng để trải nghiệm ở chế độ Demo.',
                    'This module is planned for upcoming sprints. Omnichannel Inbox is available to explore in Demo Mode.',
                  )}
                </p>
                <button className="button button-primary" onClick={() => setModal(null)}>
                  {t('Quay lại hộp thư', 'Back to Inbox')}
                </button>
              </div>
            )}
          </Modal>
        ))}
    </div>
  )
}
function LoadingSkeleton() {
  const { t } = useI18n()
  return (
    <div
      className="loading-layout"
      aria-label={t('Đang tải không gian làm việc', 'Loading workspace')}
      role="status"
    >
      <span className="visually-hidden">{t('Đang tải hội thoại…', 'Loading conversations…')}</span>
      <div className="skeleton-sidebar">
        {Array.from({ length: 7 }, (_, i) => (
          <div className="skeleton-line" key={i} />
        ))}
      </div>
      <div className="skeleton-list">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="skeleton-item">
            <span />
            <div>
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          </div>
        ))}
      </div>
      <div className="skeleton-workspace">
        <div className="skeleton-line" />
        <div className="skeleton-bubble" />
        <div className="skeleton-bubble" />
        <div className="skeleton-bubble" />
      </div>
    </div>
  )
}
