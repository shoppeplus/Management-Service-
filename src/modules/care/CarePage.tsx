import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Clock3, Headphones, Plus, UserRoundCheck } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useOperations } from '../operations/context'
import { dateTime, normalizeSearch, TICKET_TRANSITIONS } from '../operations/domain'
import { operationLabel } from '../operations/labels'
import { operationsErrorMessage } from '../operations/errors'
import type { Ticket, TicketPatch, TicketStatus } from '../operations/types'
import {
  ActivityTimeline,
  DetailDrawer,
  EmptyState,
  InlineNotice,
  Metrics,
  ModulePageHeader,
  RecordLink,
  SearchToolbar,
  StatusBadge,
} from '../operations/ui'
import TicketForm from './TicketForm'

export default function CarePage() {
  const { t, locale } = useI18n()
  const { data, inbox } = useOperations()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [creating, setCreating] = useState(false)
  const createOpen = creating || params.get('create') === '1'
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const selected = data.tickets.find((ticket) => ticket.id === params.get('id'))
  const open = data.tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status))
  const filtered = data.tickets
    .filter((ticket) => {
      const customer = inbox.customers.find((item) => item.id === ticket.customerId)
      return (
        (status === 'all' || ticket.status === status) &&
        (priority === 'all' || ticket.priority === priority) &&
        (assignee === 'all' ||
          (assignee === 'unassigned' ? !ticket.assigneeId : ticket.assigneeId === assignee)) &&
        normalizeSearch(
          [ticket.number, ticket.subject, ticket.description, customer?.name, customer?.phone].join(
            ' ',
          ),
        ).includes(normalizeSearch(search.trim()))
      )
    })
    .sort(
      (a, b) =>
        Number(['resolved', 'closed'].includes(a.status)) -
          Number(['resolved', 'closed'].includes(b.status)) || a.dueAt.localeCompare(b.dueAt),
    )
  const clear = () => {
    setSearch('')
    setStatus('all')
    setPriority('all')
    setAssignee('all')
  }
  const closeForm = () => {
    setCreating(false)
    setParams(
      (old) => {
        const next = new URLSearchParams(old)
        next.delete('create')
        return next
      },
      { replace: true },
    )
  }
  return (
    <div className="ops-page">
      <ModulePageHeader
        eyebrow={t('CHĂM SÓC KHÁCH HÀNG', 'CUSTOMER CARE')}
        title={t('Giải quyết trọn vẹn từng yêu cầu', 'Resolve every customer request')}
        description={t(
          'Theo dõi yêu cầu, phân công nhân viên và xử lý đúng hạn trên cùng một nơi.',
          'Track support requests, assign teammates and meet every deadline in one place.',
        )}
        action={
          <button className="button button-primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            {t('Tạo yêu cầu hỗ trợ', 'Create support ticket')}
          </button>
        }
      />
      <Metrics
        items={[
          { label: t('Đang cần xử lý', 'Active requests'), value: open.length, icon: Headphones },
          {
            label: t('SLA quá hạn', 'Overdue SLA'),
            value: open.filter((ticket) => Date.parse(ticket.dueAt) < now).length,
            icon: Clock3,
            color: 'amber',
            hint: t('Chỉ tính yêu cầu chưa giải quyết', 'Unresolved requests only'),
          },
          {
            label: t('Chưa phân công', 'Unassigned'),
            value: open.filter((ticket) => !ticket.assigneeId).length,
            icon: UserRoundCheck,
          },
          {
            label: t('Đã giải quyết / đóng', 'Resolved / closed'),
            value: data.tickets.length - open.length,
            icon: BadgeCheck,
            color: 'green',
          },
        ]}
      />
      <div className={`ops-split ${selected ? 'has-detail' : ''}`}>
        <section className="ops-card">
          <SearchToolbar
            value={search}
            onChange={setSearch}
            placeholder={t('Tìm mã, nội dung, khách hàng…', 'Search ticket, subject, customer…')}
          >
            <select
              className="ops-filter-select"
              aria-label={t('Lọc trạng thái yêu cầu', 'Filter ticket status')}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">{t('Tất cả trạng thái', 'All statuses')}</option>
              {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
            <select
              className="ops-filter-select"
              aria-label={t('Lọc ưu tiên yêu cầu', 'Filter ticket priority')}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="all">{t('Tất cả ưu tiên', 'All priorities')}</option>
              {['low', 'normal', 'high', 'urgent'].map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
            <select
              className="ops-filter-select"
              aria-label={t('Lọc nhân viên xử lý', 'Filter ticket assignee')}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="all">{t('Tất cả nhân viên', 'All teammates')}</option>
              <option value="unassigned">{t('Chưa phân công', 'Unassigned')}</option>
              {inbox.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </SearchToolbar>
          <div className="ops-record-count">
            {t(`${filtered.length} yêu cầu hỗ trợ`, `${filtered.length} support tickets`)}
          </div>
          {filtered.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t('Yêu cầu', 'Request')}</th>
                    <th>{t('Khách hàng', 'Customer')}</th>
                    <th>{t('Trạng thái', 'Status')}</th>
                    <th>{t('Ưu tiên', 'Priority')}</th>
                    <th>{t('Hạn SLA', 'SLA deadline')}</th>
                    <th>{t('Phụ trách', 'Assignee')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => (
                    <tr key={ticket.id} className={selected?.id === ticket.id ? 'selected' : ''}>
                      <td>
                        <button
                          className="ops-row-button"
                          onClick={() => setParams({ id: ticket.id })}
                        >
                          <strong>{ticket.number}</strong>
                          <span>{ticket.subject}</span>
                        </button>
                      </td>
                      <td>
                        {inbox.customers.find((customer) => customer.id === ticket.customerId)
                          ?.name || ticket.customerId}
                      </td>
                      <td>
                        <StatusBadge value={ticket.status} />
                      </td>
                      <td>
                        <StatusBadge value={ticket.priority} />
                      </td>
                      <td>
                        <span
                          className={
                            !['resolved', 'closed'].includes(ticket.status) &&
                            Date.parse(ticket.dueAt) < now
                              ? 'ops-overdue'
                              : ''
                          }
                        >
                          {dateTime(ticket.dueAt, locale)}
                        </span>
                        <small>
                          {['resolved', 'closed'].includes(ticket.status)
                            ? t('Đã dừng bộ đếm', 'Timer stopped')
                            : Date.parse(ticket.dueAt) < now
                              ? t('Quá hạn xử lý', 'Overdue')
                              : t('Trong thời hạn', 'Within deadline')}
                        </small>
                      </td>
                      <td>
                        {inbox.agents.find((agent) => agent.id === ticket.assigneeId)?.name ||
                          t('Chưa phân công', 'Unassigned')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={t('Không tìm thấy yêu cầu hỗ trợ', 'No support tickets found')}
              onClear={clear}
            />
          )}
        </section>
        {selected && (
          <TicketDrawer
            key={selected.id}
            ticket={selected}
            now={now}
            onClose={() => setParams({})}
          />
        )}
      </div>
      {createOpen && (
        <TicketForm
          customerId={params.get('customer')}
          orderId={params.get('order')}
          onClose={closeForm}
          onCreated={(id) => {
            setCreating(false)
            setParams((old) => {
              const next = new URLSearchParams(old)
              next.delete('create')
              if (id) next.set('id', id)
              return next
            })
          }}
        />
      )}
    </div>
  )
}

function TicketDrawer({
  ticket,
  now,
  onClose,
}: {
  ticket: Ticket
  now: number
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const { data, inbox, service, busy, run } = useOperations()
  const [resolution, setResolution] = useState(ticket.resolution)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const customer = inbox.customers.find((item) => item.id === ticket.customerId)
  const order = data.orders.find((item) => item.id === ticket.orderId)
  const resolved = ['resolved', 'closed'].includes(ticket.status)
  const checkpoint = resolved && ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : now
  const remaining = Date.parse(ticket.dueAt) - checkpoint
  const minutes = Math.ceil(Math.abs(remaining) / 60_000)
  const duration =
    minutes >= 60
      ? t(
          `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`,
          `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
        )
      : t(`${minutes} phút`, `${minutes}m`)
  const update = async (patch: TicketPatch) => {
    setError('')
    try {
      await run(
        () => service.updateTicket(ticket.id, patch),
        t('Đã cập nhật yêu cầu.', 'Support ticket updated.'),
      )
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }
  const changeStatus = async (status: TicketStatus) => {
    if (['resolved', 'closed'].includes(status) && resolution.trim().length < 5) {
      setError(
        t(
          'Nhập kết quả xử lý ít nhất 5 ký tự trước khi hoàn tất yêu cầu.',
          'Enter a resolution of at least 5 characters before completing the ticket.',
        ),
      )
      return
    }
    await update({
      status,
      ...(['resolved', 'closed'].includes(status) ? { resolution: resolution.trim() } : {}),
    })
  }
  const addComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!comment.trim()) return
    setError('')
    try {
      await run(
        () => service.addTicketComment(ticket.id, comment.trim()),
        t('Đã thêm ghi chú nội bộ.', 'Internal note added.'),
      )
      setComment('')
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }
  const localDate = (() => {
    const value = new Date(ticket.dueAt)
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  })()
  return (
    <DetailDrawer
      title={ticket.number}
      subtitle={t('YÊU CẦU HỖ TRỢ', 'SUPPORT TICKET')}
      onClose={onClose}
    >
      <section className="ops-detail-section">
        <h3>{ticket.subject}</h3>
        <div className="ops-record-actions">
          <StatusBadge value={ticket.status} />
          <StatusBadge value={ticket.priority} />
          <StatusBadge value={ticket.category} />
        </div>
        <p className="ops-description">{ticket.description}</p>
      </section>
      <section className={`ops-sla ${remaining < 0 ? 'overdue' : ''}`}>
        <Clock3 size={18} />
        <div>
          <strong>
            {resolved
              ? t('SLA đã dừng', 'SLA timer stopped')
              : remaining < 0
                ? t('SLA quá hạn', 'SLA overdue')
                : t('Trong thời hạn SLA', 'Within SLA')}
          </strong>
          <p>
            {resolved
              ? remaining < 0
                ? t(`Hoàn tất trễ ${duration}`, `Completed ${duration} late`)
                : t('Hoàn tất trước hạn', 'Completed before deadline')
              : remaining < 0
                ? t(`Quá hạn ${duration}`, `Overdue by ${duration}`)
                : t(`Còn ${duration}`, `${duration} remaining`)}
          </p>
          <small>
            {t('Hạn xử lý', 'Due')}: {dateTime(ticket.dueAt, locale)}
          </small>
        </div>
      </section>
      <section className="ops-detail-section">
        <h3>{t('Liên kết nghiệp vụ', 'Linked records')}</h3>
        <dl className="ops-detail-list">
          <div>
            <dt>{t('Khách hàng', 'Customer')}</dt>
            <dd>
              <RecordLink to={`/customers?id=${ticket.customerId}`}>
                {customer?.name || ticket.customerId}
              </RecordLink>
            </dd>
          </div>
          {order && (
            <div>
              <dt>{t('Đơn hàng', 'Order')}</dt>
              <dd>
                <RecordLink to={`/orders?id=${order.id}`}>{order.number}</RecordLink>
              </dd>
            </div>
          )}
          {ticket.conversationId && (
            <div>
              <dt>{t('Hội thoại', 'Conversation')}</dt>
              <dd>
                <RecordLink to={`/inbox?conversation=${ticket.conversationId}`}>
                  {t('Mở hội thoại gốc', 'Open original conversation')}
                </RecordLink>
              </dd>
            </div>
          )}
        </dl>
      </section>
      <section className="ops-detail-section">
        <h3>{t('Phân công và xử lý', 'Assignment and resolution')}</h3>
        <div className="ops-field-grid">
          <label className="ops-field">
            {t('Người phụ trách', 'Assignee')}
            <select
              disabled={busy}
              value={ticket.assigneeId || ''}
              onChange={(e) => void update({ assigneeId: e.target.value || null })}
            >
              <option value="">{t('Chưa phân công', 'Unassigned')}</option>
              {inbox.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            {t('Mức ưu tiên', 'Priority')}
            <select
              disabled={busy}
              value={ticket.priority}
              onChange={(e) => void update({ priority: e.target.value as Ticket['priority'] })}
            >
              {['low', 'normal', 'high', 'urgent'].map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            {t('Hạn SLA', 'SLA deadline')}
            <input
              aria-label={t('Hạn SLA yêu cầu', 'Ticket SLA deadline')}
              type="datetime-local"
              value={localDate}
              disabled={busy || resolved}
              onChange={(e) => {
                if (e.target.value) void update({ dueAt: new Date(e.target.value).toISOString() })
              }}
            />
          </label>
        </div>
        <label className="ops-field">
          {t('Kết quả xử lý', 'Resolution')}
          <textarea
            rows={3}
            maxLength={5000}
            disabled={busy}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder={t(
              'Ghi rõ giải pháp và kết quả đã xác nhận với khách…',
              'Describe the solution and confirmed outcome…',
            )}
          />
        </label>
        <div className="ops-record-actions">
          <button
            className="button button-secondary"
            disabled={busy || resolution.trim() === ticket.resolution || !resolution.trim()}
            onClick={() => void update({ resolution: resolution.trim() })}
          >
            {t('Lưu kết quả', 'Save resolution')}
          </button>
          {TICKET_TRANSITIONS[ticket.status].map((status) => (
            <button
              className={`button ${status === 'resolved' ? 'button-primary' : 'button-secondary'}`}
              disabled={busy}
              key={status}
              onClick={() => void changeStatus(status)}
            >
              {status === 'open' ? t('Mở lại', 'Reopen') : operationLabel(status, locale)}
            </button>
          ))}
        </div>
      </section>
      <section className="ops-detail-section">
        <h3>{t('Trao đổi nội bộ', 'Internal discussion')}</h3>
        <InlineNotice>
          {t(
            'Ghi chú chỉ dành cho đội ngũ nội bộ, không gửi đến khách hàng.',
            'Notes are internal only and are not sent to the customer.',
          )}
        </InlineNotice>
        <form className="ops-note-form" onSubmit={addComment}>
          <textarea
            aria-label={t('Ghi chú yêu cầu hỗ trợ', 'Support ticket note')}
            disabled={busy}
            rows={3}
            maxLength={5000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(
              'Cập nhật tiến độ, phối hợp với đồng đội…',
              'Share progress or coordinate with teammates…',
            )}
          />
          <button className="button button-secondary" disabled={busy || !comment.trim()}>
            {t('Thêm ghi chú', 'Add note')}
          </button>
        </form>
        <ol className="ops-comment-list">
          {ticket.comments
            .slice()
            .reverse()
            .map((item) => (
              <li key={item.id}>
                <p>{item.text}</p>
                <small>
                  {inbox.agents.find((agent) => agent.id === item.authorId)?.name || item.authorId}{' '}
                  · {dateTime(item.createdAt, locale)}
                </small>
              </li>
            ))}
        </ol>
      </section>
      <section className="ops-detail-section">
        <h3>{t('Lịch sử xử lý', 'Activity history')}</h3>
        <ActivityTimeline
          events={data.auditEvents.filter(
            (event) => event.entity === 'ticket' && event.entityId === ticket.id,
          )}
        />
      </section>
      {error && (
        <p className="ops-form-error" role="alert">
          {error}
        </p>
      )}
    </DetailDrawer>
  )
}
