import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Headphones,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { APP_MODE } from '../../services/inboxService'
import { notifyAuthenticationExpired } from '../../services/authSession'
import EmployeeManagement from '../inventory/EmployeeManagement'
import { useOperations } from '../operations/context'
import { dateTime, money } from '../operations/domain'
import { operationLabel } from '../operations/labels'
import { useAppAccess } from '../operations/access'
import { buildDashboard } from '../dashboard/metrics'
import type { DashboardPeriod } from '../dashboard/metrics'
import '../dashboard/dashboard.css'
import '../inventory/inventory.css'
import './admin.css'
import { CustomerCareReport, SalesReport, WorkReport } from './AdminReports'

type AdminSection = 'overview' | 'sales' | 'care' | 'work' | 'team'

export default function AdminPage() {
  const { t, locale } = useI18n()
  const access = useAppAccess()
  const { pathname } = useLocation()
  const { inbox, data, refresh } = useOperations()
  const [days, setDays] = useState<DashboardPeriod>(30)
  const [now, setNow] = useState(() => new Date())
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const refreshLock = useRef(false)
  const isLive = APP_MODE === 'live'
  const sectionName = pathname.replace(/\/+$/, '').split('/').pop() || 'overview'
  const validSection = ['admin', 'overview', 'sales', 'care', 'work', 'team'].includes(sectionName)
  const section: AdminSection = ['sales', 'care', 'work', 'team'].includes(sectionName)
    ? (sectionName as AdminSection)
    : 'overview'
  const isTeamPage = section === 'team'
  const overview = useMemo(() => buildDashboard(inbox, data, days, now), [inbox, data, days, now])
  const openTickets = data.tickets.filter(
    (ticket) => ticket.status !== 'resolved' && ticket.status !== 'closed',
  )
  const activeOrders = data.orders.filter((order) =>
    ['draft', 'confirmed', 'packing'].includes(order.status),
  )
  const workloadByAssignee = new Map(
    inbox.agents.map((agent) => [
      agent.id,
      { id: agent.id, name: agent.name, open: 0, unread: 0, tickets: 0, overdueTickets: 0 },
    ]),
  )
  for (const agent of overview.agents) {
    const workload = workloadByAssignee.get(agent.id) ?? {
      id: agent.id,
      name: agent.name,
      open: 0,
      unread: 0,
      tickets: 0,
      overdueTickets: 0,
    }
    workload.open = agent.open
    workload.unread = agent.unread
    workloadByAssignee.set(agent.id, workload)
  }
  const nowTime = now.getTime()
  for (const ticket of openTickets) {
    const id = ticket.assigneeId ?? 'unassigned'
    const workload = workloadByAssignee.get(id) ?? {
      id,
      name: inbox.agents.find((agent) => agent.id === id)?.name ?? id,
      open: 0,
      unread: 0,
      tickets: 0,
      overdueTickets: 0,
    }
    workload.tickets += 1
    if (Date.parse(ticket.dueAt) < nowTime) workload.overdueTickets += 1
    workloadByAssignee.set(id, workload)
  }
  const workloadAgents = [...workloadByAssignee.values()].sort(
    (left, right) => right.open + right.tickets - (left.open + left.tickets),
  )
  const count = (value: number) => value.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')
  const translatedStatus = (status: string) => operationLabel(status, locale)
  const attention = overview.attention
  const pageTitles: Record<AdminSection, { vi: string; en: string }> = {
    overview: { vi: 'Quản trị doanh nghiệp', en: 'Business administration' },
    sales: { vi: 'Báo cáo bán hàng', en: 'Sales reports' },
    care: { vi: 'Giám sát tin nhắn & chăm sóc', en: 'Messaging & care monitoring' },
    work: { vi: 'Theo dõi công việc & nhân sự', en: 'Work & staffing overview' },
    team: { vi: 'Tài khoản & phân quyền', en: 'Accounts & permissions' },
  }
  const pageDescriptions: Record<AdminSection, { vi: string; en: string }> = {
    overview: {
      vi: 'Theo dõi tình trạng các bộ phận, công việc đang mở và kết quả bán hàng.',
      en: 'Monitor department health, active work and sales performance.',
    },
    sales: {
      vi: 'Phân tích đơn hàng, trạng thái thanh toán, giao vận và sản phẩm theo kỳ.',
      en: 'Review orders, payment status, shipping and products by period.',
    },
    care: {
      vi: 'Giám sát tải tin nhắn, hội thoại và yêu cầu chăm sóc khách hàng.',
      en: 'Monitor messaging, conversation and customer-care workload.',
    },
    work: {
      vi: 'Theo dõi phân công, hạn xử lý và nhật ký hoạt động của các bộ phận.',
      en: 'Monitor assignments, due dates and department activity.',
    },
    team: {
      vi: 'Quản lý tài khoản và cấp đúng quyền cho từng vị trí.',
      en: 'Manage accounts and assign permissions to each role.',
    },
  }
  const departmentState = (needsAttention: boolean) => (
    <span className={`admin-health-pill ${needsAttention ? 'needs-follow-up' : 'all-clear'}`}>
      {needsAttention ? t('Cần theo dõi', 'Needs follow-up') : t('Ổn định', 'On track')}
    </span>
  )
  const refreshData = useCallback(async () => {
    if (refreshLock.current) return
    refreshLock.current = true
    setRefreshing(true)
    setRefreshError('')
    try {
      await refresh()
      const current = new Date()
      setNow(current)
      setUpdatedAt(current)
    } catch (cause) {
      setRefreshError(
        cause instanceof Error
          ? cause.message
          : t('Không thể cập nhật số liệu quản trị.', 'Unable to refresh admin data.'),
      )
    } finally {
      refreshLock.current = false
      setRefreshing(false)
    }
  }, [refresh, t])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void refreshData()
    }, 30_000)
    return () => clearInterval(timer)
  }, [refreshData])

  const cards = [
    {
      title: t('Giá trị đơn hợp lệ', 'Eligible order value'),
      value: money(overview.summary.orderValue, locale),
      detail: t(
        'Đơn tạo trong kỳ; không phải doanh thu thuần',
        'Orders created in period; not net recognized revenue',
      ),
      icon: BarChart3,
      tone: 'purple',
    },
    {
      title: t('Đơn hàng trong kỳ', 'Orders in period'),
      value: count(overview.summary.orderCount),
      detail: t(`${activeOrders.length} đơn đang xử lý`, `${activeOrders.length} in progress`),
      icon: ShoppingBag,
      tone: 'blue',
    },
    {
      title: t('Hội thoại cần theo dõi', 'Conversations to monitor'),
      value: count(overview.workload.openConversations),
      detail: t(
        `${overview.workload.unreadConversations} chưa đọc · ${overview.workload.unassignedConversations} chưa phân công`,
        `${overview.workload.unreadConversations} unread · ${overview.workload.unassignedConversations} unassigned`,
      ),
      icon: MessageSquare,
      tone: 'amber',
    },
    {
      title: t('Yêu cầu chăm sóc mở', 'Open care requests'),
      value: count(openTickets.length),
      detail: t(
        `${overview.workload.overdueTickets} yêu cầu quá hạn`,
        `${overview.workload.overdueTickets} overdue`,
      ),
      icon: Headphones,
      tone: 'green',
    },
  ]

  if (!validSection || (isTeamPage && !isLive)) return <Navigate to="/admin" replace />

  return (
    <main
      className="dashboard-page admin-page"
      aria-label={t('Trung tâm quản trị', 'Admin overview')}
    >
      <header className="dashboard-heading">
        <div>
          <span className="dashboard-eyebrow">
            <span />
            {t('TRUNG TÂM QUẢN TRỊ', 'ADMIN CONTROL CENTER')}
          </span>
          <h1>
            {t(pageTitles[section].vi, pageTitles[section].en)}
            <span className="dashboard-heading-dot">.</span>
          </h1>
          <p>{t(pageDescriptions[section].vi, pageDescriptions[section].en)}</p>
        </div>
        <div className="dashboard-heading-actions">
          <button
            type="button"
            className="dashboard-refresh"
            disabled={refreshing}
            onClick={() => void refreshData()}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            {refreshing ? t('Đang cập nhật…', 'Refreshing…') : t('Làm mới', 'Refresh')}
          </button>
        </div>
      </header>
      {!isTeamPage && (
        <div className="dashboard-filter-bar admin-filter-bar">
          <div
            className="dashboard-period-filter"
            role="group"
            aria-label={t('Khoảng thời gian báo cáo', 'Report period')}
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
          <span className="dashboard-updated">
            <Clock3 size={13} />
            {t('Cập nhật', 'Updated')}{' '}
            <time dateTime={updatedAt.toISOString()}>
              {updatedAt.toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </span>
        </div>
      )}
      {refreshError && (
        <div className="dashboard-refresh-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>{t('Chưa cập nhật được số liệu', 'Unable to refresh data')}</strong>
            <p>{refreshError}</p>
          </div>
        </div>
      )}
      {isTeamPage ? (
        <EmployeeManagement
          currentRole={access.role}
          onSessionExpired={notifyAuthenticationExpired}
        />
      ) : section === 'sales' ? (
        <SalesReport inbox={inbox} data={data} overview={overview} now={now} />
      ) : section === 'care' ? (
        <CustomerCareReport inbox={inbox} data={data} overview={overview} now={now} />
      ) : section === 'work' ? (
        <WorkReport inbox={inbox} data={data} overview={overview} now={now} />
      ) : (
        <>
          <section className="dashboard-metrics" aria-label={t('Chỉ số chính', 'Key metrics')}>
            {cards.map(({ title, value, detail, icon: Icon, tone }) => (
              <article className="dashboard-metric" key={title}>
                <div className="dashboard-metric-heading">
                  <span>{title}</span>
                  <span className={`dashboard-icon dashboard-tone-${tone}`}>
                    <Icon size={18} />
                  </span>
                </div>
                <strong className="dashboard-metric-value">{value}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </section>
          <section
            className="admin-departments"
            aria-label={t('Tình hình bộ phận', 'Department status')}
          >
            <article className="admin-department-card">
              <header>
                <span className="dashboard-icon dashboard-tone-purple">
                  <MessageSquare size={18} />
                </span>
                <div>
                  <h2>{t('Tin nhắn & chăm sóc', 'Messaging & customer care')}</h2>
                  <p>{t('Trạng thái hiện tại', 'Current status')}</p>
                </div>
                {departmentState(
                  overview.workload.overdueConversations > 0 ||
                    overview.workload.unreadConversations > 0 ||
                    overview.workload.overdueTickets > 0,
                )}
              </header>
              <dl>
                <div>
                  <dt>{t('Hội thoại đang mở', 'Open conversations')}</dt>
                  <dd>{count(overview.workload.openConversations)}</dd>
                </div>
                <div>
                  <dt>{t('Tin chưa đọc', 'Unread')}</dt>
                  <dd>{count(overview.workload.unreadConversations)}</dd>
                </div>
                <div>
                  <dt>{t('Ticket quá hạn', 'Overdue care requests')}</dt>
                  <dd>{count(overview.workload.overdueTickets)}</dd>
                </div>
              </dl>
              <div
                className="admin-status-list"
                aria-label={t('Tin nhắn theo kênh', 'Messages by channel')}
              >
                {overview.channels.map((channel) => (
                  <span key={channel.channel}>
                    {translatedStatus(channel.channel)} <strong>{count(channel.messages)}</strong>
                  </span>
                ))}
                {!overview.channels.length && (
                  <span>{t('Chưa có tin nhắn trong kỳ', 'No messages in period')}</span>
                )}
              </div>
            </article>
            <article className="admin-department-card">
              <header>
                <span className="dashboard-icon dashboard-tone-blue">
                  <ShoppingBag size={18} />
                </span>
                <div>
                  <h2>{t('Bán hàng', 'Sales')}</h2>
                  <p>{t('Đơn trong kỳ và trạng thái đang làm', 'Period orders and active work')}</p>
                </div>
                {departmentState(overview.attention.some((item) => item.kind === 'shipment'))}
              </header>
              <dl>
                <div>
                  <dt>{t('Đơn đang xử lý', 'Orders in progress')}</dt>
                  <dd>{count(activeOrders.length)}</dd>
                </div>
                <div>
                  <dt>{t('Giá trị đơn trong kỳ', 'Eligible order value')}</dt>
                  <dd>{money(overview.summary.orderValue, locale)}</dd>
                </div>
                <div>
                  <dt>{t('Đơn đã giao trong kỳ', 'Delivered in period')}</dt>
                  <dd>
                    {count(
                      overview.orderStatuses.find((item) => item.status === 'delivered')?.count ??
                        0,
                    )}
                  </dd>
                </div>
              </dl>
              <div
                className="admin-status-list"
                aria-label={t('Đơn theo trạng thái', 'Orders by status')}
              >
                {overview.orderStatuses
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <span key={item.status}>
                      {translatedStatus(item.status)} <strong>{count(item.count)}</strong>
                    </span>
                  ))}
              </div>
            </article>
            <article className="admin-department-card">
              <header>
                <span className="dashboard-icon dashboard-tone-amber">
                  <Headphones size={18} />
                </span>
                <div>
                  <h2>{t('Công việc đang thực hiện', 'Work in progress')}</h2>
                  <p>{t('Phân công và hạn xử lý', 'Assignments and due dates')}</p>
                </div>
                {departmentState(
                  overview.workload.overdueTickets > 0 || overview.workload.shipmentExceptions > 0,
                )}
              </header>
              <dl>
                <div>
                  <dt>{t('Yêu cầu chăm sóc mở', 'Open care requests')}</dt>
                  <dd>{count(openTickets.length)}</dd>
                </div>
                <div>
                  <dt>{t('Đơn cần xử lý', 'Orders to process')}</dt>
                  <dd>{count(overview.workload.ordersToProcess)}</dd>
                </div>
                <div>
                  <dt>{t('Sự cố giao hàng', 'Delivery exceptions')}</dt>
                  <dd>{count(overview.workload.shipmentExceptions)}</dd>
                </div>
              </dl>
            </article>
          </section>
          <section className="admin-lower-grid">
            <article className="admin-report-panel">
              <header>
                <h2>{t('Phân bổ công việc theo nhân viên', 'Workload by teammate')}</h2>
                <p>
                  {t(
                    'Hội thoại mở và ticket đang được giao',
                    'Open conversations and assigned care requests',
                  )}
                </p>
              </header>
              <div className="admin-report-table-wrap">
                <table className="admin-report-table">
                  <thead>
                    <tr>
                      <th>{t('Nhân viên', 'Teammate')}</th>
                      <th>{t('Hội thoại', 'Conversations')}</th>
                      <th>{t('Chưa đọc', 'Unread')}</th>
                      <th>{t('Ticket mở', 'Open tickets')}</th>
                      <th>{t('Ticket quá hạn', 'Overdue tickets')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workloadAgents.map((agent) => (
                      <tr key={agent.id}>
                        <th scope="row">
                          {agent.id === 'unassigned'
                            ? t('Chưa phân công', 'Unassigned')
                            : agent.name}
                        </th>
                        <td>{count(agent.open)}</td>
                        <td>{count(agent.unread)}</td>
                        <td>{count(agent.tickets)}</td>
                        <td>{count(agent.overdueTickets)}</td>
                      </tr>
                    ))}
                    {!workloadAgents.length && (
                      <tr>
                        <td colSpan={5}>
                          {t('Chưa có dữ liệu công việc.', 'No workload data yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="admin-report-panel">
              <header>
                <h2>{t('Cần lưu ý', 'Needs attention')}</h2>
                <p>
                  {t('Việc quá hạn, chưa đọc hoặc có sự cố', 'Overdue, unread or exceptional work')}
                </p>
              </header>
              <ul className="admin-attention-list">
                {attention.map((item) => (
                  <li key={item.id}>
                    <div className="admin-attention-item">
                      <span>
                        {item.reason === 'overdue'
                          ? t('Quá hạn', 'Overdue')
                          : item.reason === 'exception'
                            ? t('Sự cố', 'Exception')
                            : item.reason === 'urgent'
                              ? t('Khẩn cấp', 'Urgent')
                              : t('Chưa đọc', 'Unread')}
                      </span>
                      <strong>{item.title}</strong>
                      <small>{item.customerName}</small>
                      <time dateTime={item.at}>{dateTime(item.at, locale)}</time>
                    </div>
                  </li>
                ))}
                {!attention.length && (
                  <li className="admin-empty-attention">
                    {t('Không có việc cần chú ý.', 'Nothing needs attention right now.')}
                  </li>
                )}
              </ul>
            </article>
          </section>
          <p className="admin-readonly-note">
            <ShieldCheck size={14} />
            {t(
              'Bảng điều khiển chỉ tổng hợp dữ liệu đã được cấp quyền. Thay đổi trạng thái và trả lời khách được thực hiện trong từng phân hệ.',
              'This dashboard only summarizes data your account can access. Update statuses and reply to customers in their assigned modules.',
            )}
          </p>
        </>
      )}
    </main>
  )
}
