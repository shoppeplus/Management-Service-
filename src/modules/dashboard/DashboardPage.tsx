import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Headphones,
  Inbox,
  ListChecks,
  MessageSquare,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChannelIcon } from '../../components/shared'
import { useI18n } from '../../i18n'
import { CHANNELS } from '../../lib/inbox'
import { useOperations } from '../operations/context'
import { dateTime, money } from '../operations/domain'
import { operationLabel } from '../operations/labels'
import { operationsErrorMessage } from '../operations/service'
import { StatusBadge } from '../operations/ui'
import { canAccessModule, useAppAccess } from '../operations/access'
import { buildDashboard } from './metrics'
import type { DashboardPeriod } from './metrics'
import {
  PRODUCT_CATEGORY_TREE,
  formatVndInteger,
  matchesCategoryFilter,
} from '../../lib/productCategories'
import './dashboard.css'

type Dashboard = ReturnType<typeof buildDashboard>

function Panel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const headingId = useId()
  return (
    <section className={`dashboard-panel ${className}`} aria-labelledby={headingId}>
      <header className="dashboard-panel-heading">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function NoData({ children, icon: Icon = BarChart3 }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="dashboard-empty">
      <Icon size={25} />
      <p>{children}</p>
    </div>
  )
}

function Comparison({
  current,
  previous,
  formatter,
}: {
  current: number
  previous: number
  formatter: (value: number) => string
}) {
  const { t, locale } = useI18n()
  const delta = current - previous
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus
  const percentage = previous
    ? new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
        maximumFractionDigits: 1,
      }).format(Math.abs(delta / previous) * 100)
    : ''
  return (
    <span
      className={`dashboard-comparison ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}
      title={`${t('Kỳ trước', 'Previous period')}: ${formatter(previous)}`}
    >
      <Icon size={13} />
      <strong>
        {previous
          ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${percentage}%`
          : current
            ? t('Mới trong kỳ', 'New this period')
            : t('Không đổi', 'No change')}
      </strong>
      <span>{t('so với kỳ trước', 'vs previous period')}</span>
    </span>
  )
}

function TrendChart({ trend, days }: { trend: Dashboard['trend']; days: DashboardPeriod }) {
  const { t, locale } = useI18n()
  const [metric, setMetric] = useState<'orderValue' | 'orderCount'>('orderValue')
  const [tableOpen, setTableOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const gradientId = useId().replaceAll(':', '')
  const tableId = useId()
  const selected = trend.find((point) => point.date === selectedDate) ?? trend[trend.length - 1]
  const format = (value: number) =>
    metric === 'orderValue' ? money(value, locale) : value.toLocaleString(locale)
  const compact = (value: number) =>
    new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  const shortDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
    })
  const maximum = Math.max(1, ...trend.map((point) => point[metric]))
  const chartTop = 16
  const chartBottom = 205
  const chartLeft = 54
  const chartRight = 746
  const x = (index: number) =>
    chartLeft + (index / Math.max(1, trend.length - 1)) * (chartRight - chartLeft)
  const y = (value: number) => chartBottom - (value / maximum) * (chartBottom - chartTop)
  const points = trend.map((point, index) => `${x(index)},${y(point[metric])}`).join(' ')
  const activeIndex = Math.max(0, trend.indexOf(selected))
  const hasData = trend.some((point) => point[metric] > 0)
  const labelIndices = [
    ...new Set([
      0,
      Math.floor((trend.length - 1) / 3),
      Math.floor(((trend.length - 1) * 2) / 3),
      trend.length - 1,
    ]),
  ]
  return (
    <Panel
      title={t('Nhịp bán hàng', 'Sales activity')}
      description={t(
        'Theo ngày tạo đơn trong khoảng thời gian đã chọn.',
        'By order creation date in the selected period.',
      )}
      className="dashboard-trend"
      action={
        <div
          className="dashboard-segmented"
          role="group"
          aria-label={t('Chỉ số biểu đồ', 'Chart metric')}
        >
          <button
            type="button"
            aria-pressed={metric === 'orderValue'}
            onClick={() => setMetric('orderValue')}
          >
            {t('Giá trị đơn', 'Order value')}
          </button>
          <button
            type="button"
            aria-pressed={metric === 'orderCount'}
            onClick={() => setMetric('orderCount')}
          >
            {t('Số đơn', 'Orders')}
          </button>
        </div>
      }
    >
      <div className="dashboard-chart-summary">
        <span className="dashboard-chart-key" />
        {metric === 'orderValue'
          ? t('Giá trị đơn hợp lệ (₫)', 'Eligible order value (₫)')
          : t('Tất cả đơn được tạo', 'All orders created')}
        <span className="dashboard-chart-period">
          {days} {t('ngày', 'days')}
        </span>
      </div>
      {hasData ? (
        <div className="dashboard-chart">
          <svg
            viewBox="0 0 770 245"
            role="img"
            aria-label={t(
              'Biểu đồ hoạt động bán hàng theo ngày; xem bảng số liệu bên dưới để đọc chi tiết.',
              'Daily sales activity chart; use the data table below for details.',
            )}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8b72d7" stopOpacity=".22" />
                <stop offset="100%" stopColor="#8b72d7" stopOpacity=".015" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((tick) => (
              <g key={tick}>
                <line
                  x1={chartLeft}
                  x2={chartRight}
                  y1={y((maximum * tick) / 4)}
                  y2={y((maximum * tick) / 4)}
                  stroke="#ececf4"
                  strokeDasharray="4 5"
                />
                <text
                  x={chartLeft - 10}
                  y={y((maximum * tick) / 4) + 3}
                  textAnchor="end"
                  className="dashboard-chart-label"
                >
                  {metric === 'orderCount'
                    ? ((maximum * tick) / 4) % 1 === 0
                      ? (maximum * tick) / 4
                      : ''
                    : compact((maximum * tick) / 4)}
                </text>
              </g>
            ))}
            <polygon
              points={`${chartLeft},${chartBottom} ${points} ${chartRight},${chartBottom}`}
              fill={`url(#${gradientId})`}
            />
            <polyline
              points={points}
              fill="none"
              stroke="#9275d8"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={chartTop}
              y2={chartBottom}
              stroke="#b7a7df"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(activeIndex)}
              cy={y(selected?.[metric] ?? 0)}
              r="5"
              fill="#9275d8"
              stroke="#fff"
              strokeWidth="3"
            />
            {labelIndices.map((index) => (
              <text
                key={index}
                x={x(index)}
                y="234"
                textAnchor={index === 0 ? 'start' : index === trend.length - 1 ? 'end' : 'middle'}
                className="dashboard-chart-label"
              >
                {shortDate(trend[index].date)}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <NoData>
          {t(
            'Chưa có dữ liệu cho chỉ số này trong kỳ đã chọn.',
            'No data for this metric in the selected period.',
          )}
        </NoData>
      )}
      <div className="dashboard-chart-controls">
        <label>
          <CalendarDays size={14} />
          <span className="visually-hidden">{t('Chi tiết ngày', 'Daily detail')}</span>
          <select
            aria-label={t('Chi tiết ngày', 'Daily detail')}
            value={selected?.date ?? ''}
            onChange={(event) => setSelectedDate(event.target.value)}
          >
            {trend.map((point) => (
              <option key={point.date} value={point.date}>
                {shortDate(point.date)}
              </option>
            ))}
          </select>
        </label>
        <strong>{format(selected?.[metric] ?? 0)}</strong>
        <button
          type="button"
          aria-expanded={tableOpen}
          aria-controls={tableId}
          onClick={() => setTableOpen(!tableOpen)}
        >
          {tableOpen ? t('Ẩn số liệu', 'Hide data') : t('Xem số liệu', 'View data')}
          <ChevronRight size={14} />
        </button>
      </div>
      {tableOpen && (
        <div className="dashboard-table-scroll dashboard-chart-table" id={tableId}>
          <table>
            <caption className="visually-hidden">
              {t('Số liệu hoạt động từng ngày', 'Daily activity data')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('Ngày', 'Date')}</th>
                <th scope="col">{t('Giá trị đơn hợp lệ', 'Eligible order value')}</th>
                <th scope="col">{t('Số đơn', 'Orders')}</th>
                <th scope="col">{t('Tin nhắn đến', 'Incoming messages')}</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{shortDate(point.date)}</th>
                  <td>{money(point.orderValue, locale)}</td>
                  <td>{point.orderCount}</td>
                  <td>{point.incomingMessages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dashboard-panel-note">
        {t(
          'Giá trị đơn gồm bản nháp, loại đơn hủy/hoàn; không phải số tiền đã thu.',
          'Order value includes drafts and excludes cancelled/returned orders; it is not collected revenue.',
        )}
      </p>
    </Panel>
  )
}

export default function DashboardPage() {
  const { inbox, data, refresh, notify, busy } = useOperations()
  const { t, locale, label } = useI18n()
  const access = useAppAccess()
  const [days, setDays] = useState<DashboardPeriod>(30)
  const [now, setNow] = useState(() => new Date())
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const refreshLock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [])
  const overview = useMemo(() => buildDashboard(inbox, data, days, now), [inbox, data, days, now])
  const count = (value: number) => value.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')
  const displayDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  const customers = new Map(inbox.customers.map((customer) => [customer.id, customer]))
  const reload = async () => {
    if (refreshLock.current || busy) return
    refreshLock.current = true
    setRefreshing(true)
    setRefreshError('')
    try {
      await refresh()
      if (mounted.current) {
        const current = new Date()
        setNow(current)
        setUpdatedAt(current)
        notify(t('Đã cập nhật số liệu tổng quan.', 'Overview updated.'))
      }
    } catch (cause) {
      if (mounted.current) {
        const message = operationsErrorMessage(cause, locale)
        setRefreshError(message)
        notify(message, 'error')
      }
    } finally {
      refreshLock.current = false
      if (mounted.current) setRefreshing(false)
    }
  }
  const metrics = [
    {
      key: 'orderValue' as const,
      title: t('Giá trị đơn hợp lệ', 'Eligible order value'),
      hint: t('Không gồm đơn hủy hoặc hoàn', 'Excludes cancelled / returned'),
      icon: Wallet,
      tone: 'purple',
      formatter: (value: number) => money(value, locale),
    },
    {
      key: 'orderCount' as const,
      title: t('Đơn hàng được tạo', 'Orders created'),
      hint: t('Tất cả trạng thái trong kỳ', 'All statuses in the period'),
      icon: ShoppingBag,
      tone: 'blue',
      formatter: count,
    },
    {
      key: 'incomingMessages' as const,
      title: t('Tin nhắn đến', 'Incoming messages'),
      hint: t('Chỉ tin nhắn từ khách hàng', 'Customer messages only'),
      icon: MessageSquare,
      tone: 'amber',
      formatter: count,
    },
    {
      key: 'activeCustomers' as const,
      title: t('Khách hàng tương tác', 'Engaged customers'),
      hint: t('Có gửi tin nhắn trong kỳ', 'Sent a message in the period'),
      icon: Users,
      tone: 'green',
      formatter: count,
    },
  ]
  const workload = [
    {
      label: t('Hội thoại đang mở', 'Active conversations'),
      value: overview.workload.openConversations,
      detail: t(
        `${overview.workload.unreadConversations} chưa đọc · ${overview.workload.unassignedConversations} chưa phân công`,
        `${overview.workload.unreadConversations} unread · ${overview.workload.unassignedConversations} unassigned`,
      ),
      icon: Inbox,
      href: '/inbox',
      module: 'Inbox',
      tone: 'purple',
    },
    {
      label: t('Đơn cần xử lý', 'Orders to process'),
      value: overview.workload.ordersToProcess,
      detail: t('Nháp, xác nhận và đóng gói', 'Draft, confirmed and packing'),
      icon: ShoppingBag,
      href: '/orders',
      module: 'Orders',
      tone: 'blue',
    },
    {
      label: t('Yêu cầu chăm sóc', 'Open support requests'),
      value: overview.workload.openTickets,
      detail: t(
        `${overview.workload.overdueTickets} yêu cầu quá hạn`,
        `${overview.workload.overdueTickets} overdue requests`,
      ),
      icon: Headphones,
      href: '/care',
      module: 'Customer Care',
      tone: 'amber',
    },
    {
      label: t('Vận chuyển gặp sự cố', 'Delivery exceptions'),
      value: overview.workload.shipmentExceptions,
      detail: t('Cần kiểm tra và liên hệ khách', 'Review and contact the customer'),
      icon: Truck,
      href: '/logistics',
      module: 'Logistics',
      tone: 'red',
    },
  ]
  const visibleWorkload = workload.filter(({ module }) => canAccessModule(module, access))
  const visibleAttention = overview.attention.filter((item) =>
    canAccessModule(
      item.kind === 'conversation'
        ? 'Inbox'
        : item.kind === 'ticket'
          ? 'Customer Care'
          : 'Logistics',
      access,
    ),
  )
  const attentionLabels = {
    overdue: t('Quá hạn', 'Overdue'),
    urgent: t('Khẩn cấp', 'Urgent'),
    unread: t('Chưa đọc', 'Unread'),
    exception: t('Sự cố giao hàng', 'Delivery exception'),
  }
  const attentionIcons = { conversation: MessageSquare, ticket: Headphones, shipment: Truck }
  const channelTotal = overview.channels.reduce((sum, channel) => sum + channel.messages, 0)
  const orderStatusTotal = overview.orderStatuses.reduce((sum, item) => sum + item.count, 0)
  const maximumQuantity = Math.max(1, ...overview.topProducts.map((product) => product.quantity))
  const maximumWork = Math.max(1, ...overview.agents.map((agent) => agent.open))

  return (
    <main className="dashboard-page" aria-label={t('Tổng quan kinh doanh', 'Business overview')}>
      <header className="dashboard-heading">
        <div>
          <span className="dashboard-eyebrow">
            <span />
            {t('KHÔNG GIAN KINH DOANH', 'BUSINESS WORKSPACE')}
          </span>
          <h1>
            {t('Tổng quan', 'Overview')}
            <span className="dashboard-heading-dot">.</span>
          </h1>
          <p>
            {t(
              'Một góc nhìn rõ ràng để bắt đầu ngày làm việc.',
              'A clear view of your business, ready for the day ahead.',
            )}
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <button
            type="button"
            className="dashboard-refresh"
            disabled={refreshing || busy}
            onClick={() => void reload()}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            {refreshing ? t('Đang cập nhật', 'Refreshing') : t('Làm mới', 'Refresh')}
          </button>
          {canAccessModule('Orders', access) && (
            <Link to="/orders?create=1" className="button button-primary">
              <Plus size={16} />
              {t('Tạo đơn hàng', 'Create order')}
            </Link>
          )}
        </div>
      </header>
      <div className="dashboard-filter-bar">
        <div
          className="dashboard-period-filter"
          role="group"
          aria-label={t('Khoảng thời gian tổng quan', 'Overview period')}
        >
          {([7, 30, 90] as const).map((period) => (
            <button
              type="button"
              key={period}
              aria-pressed={period === days}
              onClick={() => setDays(period)}
            >
              {period} {t('ngày', 'days')}
            </button>
          ))}
        </div>
        <span className="dashboard-date-range">
          <CalendarDays size={14} />
          {displayDate(overview.period.start)}
          <span>–</span>
          {displayDate(overview.period.end)}
        </span>
        <span className="dashboard-updated">
          {t('Cập nhật', 'Updated')}{' '}
          <time dateTime={updatedAt.toISOString()}>
            {updatedAt.toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </span>
      </div>
      {refreshError && (
        <div className="dashboard-refresh-error" role="alert">
          <CircleAlert size={18} />
          <div>
            <strong>{t('Chưa cập nhật được số liệu', 'Unable to refresh data')}</strong>
            <p>
              {refreshError}{' '}
              {t(
                'Đang hiển thị dữ liệu của lần tải thành công gần nhất.',
                'Showing the last successfully loaded data.',
              )}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Đóng lỗi cập nhật', 'Dismiss refresh error')}
            onClick={() => setRefreshError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="dashboard-metrics" aria-label={t('Chỉ số trong kỳ', 'Period metrics')}>
        {metrics.map(({ key, title, hint, icon: Icon, tone, formatter }) => (
          <article className="dashboard-metric" key={key}>
            <div className="dashboard-metric-heading">
              <span>{title}</span>
              <span className={`dashboard-icon dashboard-tone-${tone}`}>
                <Icon size={18} />
              </span>
            </div>
            <strong className="dashboard-metric-value">{formatter(overview.summary[key])}</strong>
            <p>{hint}</p>
            <Comparison
              current={overview.summary[key]}
              previous={overview.previous[key]}
              formatter={formatter}
            />
          </article>
        ))}
      </section>
      <div className="dashboard-period-footnote">
        <span>
          {t('So sánh', 'Comparing with')} {displayDate(overview.period.previousStart)} –{' '}
          {displayDate(overview.period.previousEnd)}
        </span>
        <span>
          <CheckCheck size={14} />
          {t('Giá trị đã giao của đơn tạo trong kỳ', 'Delivered value of orders created in period')}
          : <strong>{money(overview.summary.deliveredValue, locale)}</strong>
        </span>
      </div>
      <section className="dashboard-work-section" aria-labelledby="dashboard-current-work">
        <header>
          <h2 id="dashboard-current-work">
            <ListChecks size={16} />
            {t('Cần xử lý hiện tại', 'Current workload')}
          </h2>
          <span>
            {t(
              'Toàn bộ dữ liệu · không theo bộ lọc ngày',
              'All records · independent of date filter',
            )}
          </span>
        </header>
        <div className="dashboard-work-grid">
          {visibleWorkload.map(({ label: title, value, detail, icon: Icon, href, tone }) => (
            <Link to={href} key={href} className="dashboard-work-item">
              <span className={`dashboard-icon dashboard-tone-${tone}`}>
                <Icon size={18} />
              </span>
              <div>
                <span>{title}</span>
                <strong>{count(value)}</strong>
                <small>{detail}</small>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      </section>
      <div className="dashboard-main-grid">
        <TrendChart trend={overview.trend} days={days} />
        <Panel
          title={t('Ưu tiên hôm nay', 'Needs your attention')}
          description={t(
            'Quá hạn, khẩn cấp và phản hồi đang chờ.',
            'Overdue work, urgent issues and unread messages.',
          )}
          className="dashboard-attention"
          action={
            <span className="dashboard-section-icon">
              <Sparkles size={17} />
            </span>
          }
        >
          {visibleAttention.length ? (
            <ul className="dashboard-attention-list">
              {visibleAttention.map((item) => {
                const Icon = attentionIcons[item.kind]
                return (
                  <li key={`${item.kind}:${item.id}`}>
                    <Link to={item.href}>
                      <span className={`dashboard-attention-icon is-${item.reason}`}>
                        <Icon size={16} />
                      </span>
                      <span className="dashboard-attention-copy">
                        <span>
                          <strong>{item.customerName || item.title}</strong>
                          <span className={`dashboard-reason is-${item.reason}`}>
                            {attentionLabels[item.reason]}
                          </span>
                        </span>
                        <small>{item.title}</small>
                      </span>
                      <ChevronRight size={15} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <NoData icon={CheckCheck}>
              {t(
                'Mọi việc đã gọn gàng. Chưa có mục cần ưu tiên.',
                'All caught up. No priority items right now.',
              )}
            </NoData>
          )}
          <footer className="dashboard-attention-footer">
            <Clock3 size={14} />
            {overview.workload.overdueConversations}{' '}
            {t('hội thoại quá hạn đang mở', 'active overdue conversations')}
          </footer>
        </Panel>
      </div>
      {canAccessModule('Orders', access) && (
        <div className="dashboard-orders-grid">
          <Panel
            title={t('Đơn hàng gần đây', 'Recent orders')}
            description={t(
              'Những đơn mới nhất trong kỳ đã chọn.',
              'The latest orders created in the selected period.',
            )}
            className="dashboard-orders"
            action={
              <Link className="dashboard-text-link" to="/orders">
                {t('Tất cả đơn', 'All orders')}
                <ArrowRight size={14} />
              </Link>
            }
          >
            {overview.orders.length ? (
              <div className="dashboard-table-scroll">
                <table>
                  <caption className="visually-hidden">
                    {t('Đơn hàng gần đây trong kỳ', 'Recent orders in this period')}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('Đơn hàng / Khách hàng', 'Order / Customer')}</th>
                      <th scope="col">{t('Ngày tạo', 'Created')}</th>
                      <th scope="col">{t('Trạng thái', 'Status')}</th>
                      <th scope="col">{t('Thanh toán', 'Payment')}</th>
                      <th scope="col">{t('Tổng tiền', 'Total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <Link
                            className="dashboard-order-number"
                            to={`/orders?id=${encodeURIComponent(order.id)}`}
                          >
                            {order.number}
                            <ArrowUpRight size={12} />
                          </Link>
                          {canAccessModule('CRM', access) ? (
                            <Link
                              className="dashboard-order-customer"
                              to={`/customers?id=${encodeURIComponent(order.customerId)}`}
                            >
                              {customers.get(order.customerId)?.name || order.recipientName}
                            </Link>
                          ) : (
                            <span className="dashboard-order-customer">
                              {customers.get(order.customerId)?.name || order.recipientName}
                            </span>
                          )}
                        </td>
                        <td className="dashboard-nowrap">
                          <time dateTime={order.createdAt}>
                            {dateTime(order.createdAt, locale)}
                          </time>
                        </td>
                        <td>
                          <StatusBadge value={order.status} />
                        </td>
                        <td>
                          <span className={`dashboard-payment is-${order.paymentStatus}`}>
                            {operationLabel(order.paymentStatus, locale)}
                          </span>
                        </td>
                        <td className="dashboard-order-total">{money(order.total, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <NoData icon={ShoppingBag}>
                {t('Chưa có đơn hàng trong kỳ này.', 'No orders created in this period.')}
              </NoData>
            )}
          </Panel>
          <Panel
            title={t('Trạng thái đơn hàng', 'Order breakdown')}
            description={t('Các đơn được tạo trong kỳ.', 'Orders created in the selected period.')}
            className="dashboard-order-status"
          >
            {orderStatusTotal ? (
              <>
                <div className="dashboard-status-total">
                  <strong>{count(orderStatusTotal)}</strong>
                  <span>{t('đơn hàng', 'orders')}</span>
                </div>
                <div className="dashboard-status-stack" aria-hidden="true">
                  {overview.orderStatuses
                    .filter((item) => item.count)
                    .map((item) => (
                      <span
                        key={item.status}
                        className={`dashboard-status-color status-${item.status}`}
                        style={{ flexGrow: item.count }}
                      />
                    ))}
                </div>
                <ul className="dashboard-status-list">
                  {overview.orderStatuses
                    .filter((item) => item.count)
                    .map((item) => (
                      <li key={item.status}>
                        <span>
                          <i className={`dashboard-status-color status-${item.status}`} />
                          {operationLabel(item.status, locale)}
                        </span>
                        <strong>{count(item.count)}</strong>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <NoData icon={ShoppingBag}>
                {t('Chưa có trạng thái đơn để tổng hợp.', 'No orders to break down yet.')}
              </NoData>
            )}
          </Panel>
        </div>
      )}
      <Panel
        title={t(
          'Cây danh mục mặt hàng & Sản phẩm kinh doanh (Ver 1.0)',
          'Product category tree & items (Ver 1.0)',
        )}
        description={t(
          'Toàn bộ danh mục mặt hàng đang kinh doanh kèm các sản phẩm con đã phân loại và số lượng hội thoại theo từng danh mục.',
          'All active product categories with classified sub-items and conversation breakdown per category.',
        )}
        className="dashboard-category-tree"
        action={
          <Link className="dashboard-text-link" to="/inbox">
            {t('Lọc trong Chatbox', 'Filter in Chatbox')}
            <ArrowRight size={14} />
          </Link>
        }
      >
        <div className="dashboard-stock-grid">
          {PRODUCT_CATEGORY_TREE.map((cat) => {
            const catConvCount = inbox.conversations.filter((conv) =>
              matchesCategoryFilter(conv, cat.name),
            ).length
            return (
              <article key={cat.id}>
                <span className="dashboard-stock-indicator">
                  <Package size={18} />
                </span>
                <div>
                  <strong>{locale === 'vi' ? cat.name : cat.englishName}</strong>
                  <small>
                    {cat.children
                      .map((sub) => (locale === 'vi' ? sub.name : sub.englishName))
                      .join(' · ')}
                  </small>
                  <small style={{ display: 'block', marginTop: 4 }}>
                    {cat.products
                      .map((p) => `${p.name} (${formatVndInteger(p.priceVnd)})`)
                      .join(', ')}
                  </small>
                </div>
                <span className="dashboard-stock-value">
                  {cat.products.length} {t('SP', 'SKUs')} · {catConvCount} {t('chat', 'chats')}
                </span>
              </article>
            )
          })}
        </div>
      </Panel>
      <div className="dashboard-bottom-grid">
        {canAccessModule('Inbox', access) && (
          <Panel
            title={t('Khách đang nhắn ở đâu?', 'Where customers message')}
            description={t(
              'Tin nhắn đến theo kênh trong kỳ.',
              'Incoming messages by channel in this period.',
            )}
            className="dashboard-channels"
          >
            {overview.channels.length ? (
              <>
                <div className="dashboard-channel-total">
                  <strong>{count(channelTotal)}</strong>
                  <span>{t('tin nhắn đến', 'incoming messages')}</span>
                </div>
                <ul className="dashboard-channel-list">
                  {overview.channels.map((channel) => {
                    const info = CHANNELS.find((item) => item.id === channel.channel)!
                    return (
                      <li key={channel.channel}>
                        <div className="dashboard-channel-label">
                          <span>
                            <ChannelIcon channel={channel.channel} size={18} />
                            {label(info.label)}
                          </span>
                          <strong>
                            {count(channel.messages)}
                            <small>{Math.round((channel.messages / channelTotal) * 100)}%</small>
                          </strong>
                        </div>
                        <div className="dashboard-progress" aria-hidden="true">
                          <span
                            style={{
                              width: `${(channel.messages / channelTotal) * 100}%`,
                              background: info.color,
                            }}
                          />
                        </div>
                        <small>
                          {channel.conversations}{' '}
                          {t('hội thoại có tin nhắn', 'conversations with messages')}
                        </small>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <NoData icon={MessageSquare}>
                {t('Chưa có tin nhắn đến trong kỳ này.', 'No incoming messages in this period.')}
              </NoData>
            )}
          </Panel>
        )}
        {canAccessModule('Products', access) && (
          <Panel
            title={t('Sản phẩm được đặt nhiều', 'Most ordered products')}
            description={t(
              'Theo số lượng trong đơn hợp lệ; giá trị trước giảm giá và phí giao.',
              'By quantity in eligible orders; value before discounts and shipping.',
            )}
            className="dashboard-top-products"
          >
            {overview.topProducts.length ? (
              <ol className="dashboard-product-list">
                {overview.topProducts.map((product, index) => (
                  <li key={product.productId}>
                    <span className="dashboard-product-rank">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <strong>{product.name}</strong>
                      <small>{product.sku}</small>
                      <div className="dashboard-progress" aria-hidden="true">
                        <span style={{ width: `${(product.quantity / maximumQuantity) * 100}%` }} />
                      </div>
                      <span className="dashboard-product-amount">
                        <b>
                          {product.quantity} {t('sản phẩm', 'units')}
                        </b>
                        <span>{money(product.value, locale)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <NoData icon={Package}>
                {t(
                  'Chưa có sản phẩm trong đơn hợp lệ của kỳ này.',
                  'No products in eligible orders this period.',
                )}
              </NoData>
            )}
          </Panel>
        )}
        {canAccessModule('Inbox', access) && (
          <Panel
            title={t('Phân bổ hội thoại', 'Conversation workload')}
            description={t(
              'Hội thoại đang mở của từng người phụ trách.',
              'Current active conversations by assignee.',
            )}
            className="dashboard-team"
          >
            {overview.agents.some((agent) => agent.open) ? (
              <ul className="dashboard-team-list">
                {overview.agents
                  .filter((agent) => agent.open)
                  .slice(0, 6)
                  .map((agent) => (
                    <li key={agent.id}>
                      <span
                        className={`dashboard-team-avatar ${agent.id === 'unassigned' ? 'is-unassigned' : ''}`}
                      >
                        {agent.id === 'unassigned' ? (
                          <Users size={16} />
                        ) : (
                          agent.name
                            .split(/\s+/)
                            .slice(-2)
                            .map((part) => part.charAt(0))
                            .join('')
                        )}
                      </span>
                      <div>
                        <span>
                          <strong>
                            {agent.id === 'unassigned'
                              ? t('Chưa phân công', 'Unassigned')
                              : agent.name}
                          </strong>
                          <b>{agent.open}</b>
                        </span>
                        <div className="dashboard-progress" aria-hidden="true">
                          <span style={{ width: `${(agent.open / maximumWork) * 100}%` }} />
                        </div>
                        <small>
                          {agent.unread} {t('hội thoại chưa đọc', 'unread conversations')}
                        </small>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <NoData icon={Users}>
                {t(
                  'Chưa có hội thoại đang mở cần phân công.',
                  'No active conversations to assign.',
                )}
              </NoData>
            )}
            <Link to="/inbox" className="dashboard-team-link">
              {t('Mở hộp thư', 'Open Inbox')}
              <ArrowRight size={14} />
            </Link>
          </Panel>
        )}
      </div>
      {canAccessModule('Inventory', access) && (
        <Panel
          title={t('Lưu ý tồn kho', 'Stock watch')}
          description={t(
            'Sản phẩm còn tối đa 10 đơn vị ở thời điểm hiện tại.',
            'Products with 10 or fewer units currently in stock.',
          )}
          className="dashboard-stock"
          action={
            <span
              className={`dashboard-stock-count ${overview.workload.lowStockProducts.length ? 'has-items' : ''}`}
            >
              <Package size={15} />
              {overview.workload.lowStockProducts.length} {t('sản phẩm', 'products')}
            </span>
          }
        >
          {overview.workload.lowStockProducts.length ? (
            <>
              <div className="dashboard-stock-grid">
                {overview.workload.lowStockProducts.slice(0, 6).map((product) => (
                  <article key={product.id}>
                    <span
                      className={`dashboard-stock-indicator ${product.stock === 0 ? 'is-empty' : ''}`}
                    >
                      <Package size={18} />
                    </span>
                    <div>
                      <strong>{product.name}</strong>
                      <small>{product.sku}</small>
                    </div>
                    <span
                      className={`dashboard-stock-value ${product.stock === 0 ? 'is-empty' : ''}`}
                    >
                      {product.stock === 0
                        ? t('Hết hàng', 'Out of stock')
                        : `${product.stock} ${product.unit || t('đơn vị', 'units')}`}
                    </span>
                  </article>
                ))}
              </div>
              {overview.workload.lowStockProducts.length > 6 && (
                <p className="dashboard-panel-note">
                  {t(
                    `Và ${overview.workload.lowStockProducts.length - 6} sản phẩm khác cần kiểm tra tồn kho.`,
                    `And ${overview.workload.lowStockProducts.length - 6} more products need a stock check.`,
                  )}
                </p>
              )}
            </>
          ) : (
            <div className="dashboard-stock-clear">
              <CheckCheck size={19} />
              <span>
                {t(
                  'Tồn kho đang ổn định. Chưa có sản phẩm ở mức cảnh báo.',
                  'Stock looks healthy. No products are below the alert threshold.',
                )}
              </span>
            </div>
          )}
        </Panel>
      )}
      <footer className="dashboard-page-footer">
        <span>
          <span />
          {t(
            'Số liệu được tổng hợp từ dữ liệu hiện có của hệ thống.',
            'Metrics are calculated from the data currently available in your workspace.',
          )}
        </span>
        {canAccessModule('Customer Care', access) && (
          <Link to="/care?create=1">
            {t('Tạo yêu cầu chăm sóc', 'Create support request')}
            <ArrowUpRight size={13} />
          </Link>
        )}
      </footer>
    </main>
  )
}
