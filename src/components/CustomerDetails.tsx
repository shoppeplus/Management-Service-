import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import type {
  Agent,
  Conversation,
  ConversationPatch,
  Customer,
  CustomerPatch,
  Team,
} from '../types/inbox'
import { translateMessage, useI18n } from '../i18n'

interface Props {
  customer: Customer
  conversation: Conversation
  agents: Agent[]
  teams: Team[]
  onUpdateConversation: (patch: ConversationPatch) => Promise<void>
  onUpdateCustomer: (patch: CustomerPatch) => Promise<void>
  onClose: () => void
  onNotify: (message: string, kind?: 'success' | 'error') => void
  busy: boolean
  mode: 'demo' | 'live'
  canManageConversation: boolean
  canEditCustomer: boolean
}

const dateLabel = (date: string, locale: 'vi' | 'en') =>
  new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
const errorText = (error: unknown, locale: 'vi' | 'en') =>
  error instanceof Error
    ? translateMessage(error.message, locale)
    : locale === 'vi'
      ? 'Không thể lưu thay đổi. Vui lòng thử lại.'
      : 'Could not save changes. Please try again.'

function AssignmentPanel({
  agents,
  teams,
  conversation,
  busy,
  onChange,
}: Pick<Props, 'agents' | 'teams' | 'conversation' | 'busy'> & {
  onChange: (patch: ConversationPatch) => void
}) {
  const { t } = useI18n()
  return (
    <section className="details-section assignment-panel" aria-label={t('Phân công', 'Assignment')}>
      <div className="detail-row">
        <label htmlFor="detail-assignee">
          <UserRound size={14} /> {t('Người phụ trách', 'Assignee')}
        </label>
        <select
          id="detail-assignee"
          value={conversation.assigneeId ?? ''}
          disabled={busy}
          onChange={(event) => onChange({ assigneeId: event.target.value || null })}
        >
          <option value="">{t('Chưa phân công', 'Unassigned')}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>
      <div className="detail-row">
        <label htmlFor="detail-team">
          <UsersRound size={14} /> {t('Nhóm', 'Team')}
        </label>
        <select
          id="detail-team"
          value={conversation.teamId ?? ''}
          disabled={busy}
          onChange={(event) => onChange({ teamId: event.target.value || null })}
        >
          <option value="">{t('Chưa có nhóm', 'No team')}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

function EditCustomerModal({
  customer,
  busy,
  onClose,
  onSave,
}: {
  customer: Customer
  busy: boolean
  onClose: () => void
  onSave: (patch: CustomerPatch) => Promise<void>
}) {
  const { t, label } = useI18n()
  const [draft, setDraft] = useState<CustomerPatch>({
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    company: customer.company,
    membership: customer.membership,
    location: customer.location,
  })
  const [error, setError] = useState<{ vi: string; en: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const closeRef = useRef(onClose)
  const savingRef = useRef(saving)
  useEffect(() => {
    closeRef.current = onClose
    savingRef.current = saving
  }, [onClose, saving])
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null
    const root = modalRef.current
    root?.querySelector<HTMLInputElement>('input')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) closeRef.current()
      if (event.key !== 'Tab' || !root) return
      const elements = Array.from(
        root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]'),
      )
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      prior?.focus()
    }
  }, [])
  const update = (key: keyof CustomerPatch, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || busy) return
    const cleaned = {
      ...draft,
      name: draft.name?.trim(),
      email: draft.email?.trim(),
      phone: draft.phone?.trim(),
      company: draft.company?.trim(),
      location: draft.location?.trim(),
    }
    if (!cleaned.name || cleaned.name.length < 2) {
      setError({
        vi: 'Tên khách hàng cần ít nhất 2 ký tự.',
        en: 'Customer name must contain at least 2 characters.',
      })
      return
    }
    if (cleaned.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
      setError({ vi: 'Địa chỉ email chưa hợp lệ.', en: 'Enter a valid email address.' })
      return
    }
    if (
      cleaned.phone &&
      (!/^\+?[\d\s().-]{8,20}$/.test(cleaned.phone) || cleaned.phone.replace(/\D/g, '').length < 8)
    ) {
      setError({
        vi: 'Số điện thoại cần ít nhất 8 chữ số, có thể có mã quốc gia.',
        en: 'Phone number must contain at least 8 digits; a country code is allowed.',
      })
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(cleaned)
      onClose()
    } catch (cause) {
      setError({ vi: errorText(cause, 'vi'), en: errorText(cause, 'en') })
    } finally {
      setSaving(false)
    }
  }
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={modalRef}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{t('HỒ SƠ KHÁCH HÀNG', 'CUSTOMER PROFILE')}</span>
            <h2 id={titleId}>{t('Chỉnh sửa thông tin khách hàng', 'Edit customer details')}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Đóng chỉnh sửa khách hàng', 'Close customer editor')}
            disabled={saving}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="field">
                {t('Họ và tên', 'Full name')}
                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) => update('name', event.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                {t('Số điện thoại', 'Phone')}
                <input
                  type="tel"
                  maxLength={20}
                  value={draft.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  autoComplete="tel"
                />
              </label>
              <label className="field">
                {t('Email', 'Email')}
                <input
                  type="email"
                  maxLength={160}
                  value={draft.email}
                  onChange={(event) => update('email', event.target.value)}
                  autoComplete="email"
                />
              </label>
              <label className="field">
                {t('Công ty', 'Company')}
                <input
                  maxLength={100}
                  value={draft.company}
                  onChange={(event) => update('company', event.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label className="field">
                {t('Hạng thành viên', 'Membership')}
                <select
                  value={draft.membership}
                  onChange={(event) => update('membership', event.target.value)}
                >
                  {['Standard', 'Silver', 'Gold', 'Platinum'].map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('Địa chỉ', 'Location')}
                <input
                  maxLength={150}
                  value={draft.location}
                  onChange={(event) => update('location', event.target.value)}
                  autoComplete="address-level2"
                />
              </label>
            </div>
            {error && (
              <p className="field-error" role="alert">
                {t(error.vi, error.en)}
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={saving}
              onClick={onClose}
            >
              {t('Hủy', 'Cancel')}
            </button>
            <button type="submit" className="button button-primary" disabled={busy || saving}>
              {saving ? t('Đang lưu…', 'Saving…') : t('Lưu thay đổi', 'Save changes')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export default function CustomerDetails({
  customer,
  conversation,
  agents,
  teams,
  onUpdateConversation,
  onUpdateCustomer,
  onClose,
  onNotify,
  busy,
  mode,
  canManageConversation,
  canEditCustomer,
}: Props) {
  const { t, label, locale } = useI18n()
  const [editing, setEditing] = useState(false)
  const [tag, setTag] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])
  const update = async (patch: ConversationPatch) => {
    try {
      await onUpdateConversation(patch)
    } catch (error) {
      onNotify(errorText(error, locale), 'error')
    }
  }
  const done = conversation.status === 'resolved' || conversation.status === 'closed'
  const remaining = new Date(conversation.dueAt).getTime() - now
  const duration = Math.max(0, Math.ceil(Math.abs(remaining) / 60_000))
  const durationLabel =
    duration >= 60
      ? t(
          `${Math.floor(duration / 60)} giờ ${duration % 60} phút`,
          `${Math.floor(duration / 60)}h ${duration % 60}m`,
        )
      : t(`${duration} phút`, `${duration}m`)
  const addTag = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = tag.trim().replace(/^#/, '')
    if (!value) return
    if (conversation.tags.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      onNotify(t('Nhãn này đã tồn tại.', 'This tag already exists.'), 'error')
      return
    }
    if (conversation.tags.length >= 10) {
      onNotify(
        t('Tối đa 10 nhãn cho mỗi hội thoại.', 'A conversation can have up to 10 tags.'),
        'error',
      )
      return
    }
    try {
      await onUpdateConversation({ tags: [...conversation.tags, value] })
      setTag('')
    } catch (error) {
      onNotify(errorText(error, locale), 'error')
    }
  }
  const localDate = (() => {
    const value = new Date(conversation.dueAt)
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  })()
  return (
    <aside className="customer-details" aria-label={t('Thông tin khách hàng', 'Customer details')}>
      <div className="panel-heading">
        <h2>{t('Thông tin khách hàng', 'Customer details')}</h2>
        <button
          className="icon-button"
          aria-label={t('Ẩn thông tin khách hàng', 'Hide customer details')}
          title={t('Ẩn thông tin khách hàng', 'Hide customer details')}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <div className="details-scroll">
        {canManageConversation && (
          <AssignmentPanel
            agents={agents}
            teams={teams}
            conversation={conversation}
            busy={busy}
            onChange={update}
          />
        )}
        <section className="details-section">
          <h3 className="section-heading">{t('Hội thoại', 'Conversation')}</h3>
          <div className="detail-row">
            <span>{t('Loại', 'Type')}</span>
            <span>{t('Hỗ trợ khách hàng', 'Customer support')}</span>
          </div>
          <div className="detail-row">
            <label htmlFor="detail-status">{t('Trạng thái', 'Status')}</label>
            {canManageConversation ? (
              <select
                id="detail-status"
                disabled={busy}
                value={conversation.status}
                onChange={(event) =>
                  update({ status: event.target.value as Conversation['status'] })
                }
              >
                {['open', 'pending', 'resolved', 'closed'].map((status) => (
                  <option key={status} value={status}>
                    {label(status[0].toUpperCase() + status.slice(1))}
                  </option>
                ))}
              </select>
            ) : (
              <span>{label(conversation.status[0].toUpperCase() + conversation.status.slice(1))}</span>
            )}
          </div>
          <div className="detail-row">
            <label htmlFor="detail-priority">{t('Ưu tiên', 'Priority')}</label>
            {canManageConversation ? (
              <select
                id="detail-priority"
                disabled={busy}
                value={conversation.priority}
                onChange={(event) =>
                  update({ priority: event.target.value as Conversation['priority'] })
                }
              >
                {['low', 'normal', 'high', 'urgent'].map((priority) => (
                  <option key={priority} value={priority}>
                    {label(priority[0].toUpperCase() + priority.slice(1))}
                  </option>
                ))}
              </select>
            ) : (
              <span>{label(conversation.priority[0].toUpperCase() + conversation.priority.slice(1))}</span>
            )}
          </div>
          <div className="detail-row due-date-row">
            <label htmlFor="detail-due">{t('Hạn xử lý', 'Due date')}</label>
            {canManageConversation ? (
              <input
                id="detail-due"
                aria-label={t('Hạn xử lý hội thoại', 'Conversation due date')}
                type="datetime-local"
                value={localDate}
                disabled={busy}
                onChange={(event) => {
                  if (event.target.value)
                    update({ dueAt: new Date(event.target.value).toISOString() })
                }}
              />
            ) : (
              <span>{dateLabel(conversation.dueAt, locale)}</span>
            )}
          </div>
          {conversation.sourceUrl && /^https?:\/\//.test(conversation.sourceUrl) && (
            <div className="detail-row">
              <span>{t('Nguồn', 'Source')}</span>
              <a
                className="source-link"
                href={conversation.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t('Xem nguồn', 'View source')} <ExternalLink size={12} />
              </a>
            </div>
          )}
          <div
            className={`sla-card${done ? ' sla-resolved' : remaining < 0 ? ' sla-overdue' : ''}`}
            title={`${t('Hạn chót', 'Deadline')}: ${dateLabel(conversation.dueAt, locale)}`}
          >
            <div className="sla-header">
              <ShieldCheck size={15} />
              <strong>
                {done
                  ? t('Đã hoàn tất SLA', 'SLA completed')
                  : remaining < 0
                    ? t('SLA quá hạn', 'SLA overdue')
                    : t('SLA phản hồi', 'Response SLA')}
                <span>
                  {done
                    ? t('Hội thoại đã xử lý', 'Conversation resolved')
                    : remaining < 0
                      ? t(`Quá hạn ${durationLabel}`, `Overdue by ${durationLabel}`)
                      : t(`Còn ${durationLabel}`, `${durationLabel} remaining`)}
                </span>
              </strong>
              <span className="sla-indicator" />
            </div>
            {mode === 'demo' && (
              <small>
                {t(
                  'Demo · hạn phản hồi theo dữ liệu mẫu',
                  'Demo · response deadline from sample data',
                )}
              </small>
            )}
          </div>
        </section>
        <section className="details-section">
          <h3 className="section-heading">
            {t('Nhãn', 'Tags')} <span>{conversation.tags.length}</span>
          </h3>
          <div className="tag-list">
            {conversation.tags.map((value) => (
              <span className="tag" key={value}>
                {value}
                {canManageConversation && (
                  <button
                    className="tag-remove"
                    aria-label={t(`Xóa nhãn ${value}`, `Remove tag ${value}`)}
                    disabled={busy}
                    onClick={() =>
                      update({ tags: conversation.tags.filter((item) => item !== value) })
                    }
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {conversation.tags.length === 0 && (
              <span className="muted">{t('Chưa có nhãn', 'No tags yet')}</span>
            )}
          </div>
          {canManageConversation && <form className="tag-form" onSubmit={addTag}>
            <input
              className="tag-input"
              aria-label={t('Nhãn mới', 'New tag')}
              placeholder={t('Thêm nhãn…', 'Add a tag…')}
              value={tag}
              maxLength={30}
              disabled={busy}
              onChange={(event) => setTag(event.target.value)}
            />
            <button
              className="icon-button"
              aria-label={t('Thêm nhãn', 'Add tag')}
              title={t('Thêm nhãn', 'Add tag')}
              disabled={busy || !tag.trim()}
            >
              <Plus size={15} />
            </button>
          </form>}
        </section>
        <section className="details-section">
          <div className="section-heading">
            <h3>{t('Hồ sơ khách hàng', 'Customer profile')}</h3>
            {canEditCustomer && (
              <button
                className="icon-button"
                aria-label={t('Chỉnh sửa hồ sơ khách hàng', 'Edit customer profile')}
                title={t('Chỉnh sửa hồ sơ khách hàng', 'Edit customer profile')}
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          <div className="customer-profile">
            <div className="customer-avatar" style={{ backgroundColor: customer.avatarColor }}>
              {initials(customer.name)}
            </div>
            <div>
              <strong>{customer.name}</strong>
              <span className="customer-id">{customer.id}</span>
              <span className="membership-badge">
                ✦{' '}
                {t(
                  `Thành viên ${label(customer.membership)}`,
                  `${label(customer.membership)} member`,
                )}
              </span>
            </div>
          </div>
          <dl className="info-list">
            <div className="info-row">
              <dt>
                <Phone size={14} /> {t('Điện thoại', 'Phone')}
              </dt>
              <dd>
                {customer.phone ? (
                  <a href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`}>{customer.phone}</a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="info-row">
              <dt>
                <Mail size={14} /> {t('Email', 'Email')}
              </dt>
              <dd>
                {customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : '—'}
              </dd>
            </div>
            <div className="info-row">
              <dt>
                <Building2 size={14} /> {t('Công ty', 'Company')}
              </dt>
              <dd>{customer.company || '—'}</dd>
            </div>
            <div className="info-row">
              <dt>
                <MapPin size={14} /> {t('Địa chỉ', 'Location')}
              </dt>
              <dd>{customer.location || '—'}</dd>
            </div>
          </dl>
        </section>
        <section className="details-section">
          <button
            className="section-heading history-toggle"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <span>
              <History size={14} /> {t('Lịch sử tương tác', 'Interaction history')}
            </span>
            {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {historyOpen && (
            <ol className="interaction-list">
              {conversation.messages
                .slice(-5)
                .reverse()
                .map((message) => (
                  <li className="interaction-event" key={message.id}>
                    <Clock3 size={12} />
                    <div>
                      <strong>
                        {message.type === 'incoming'
                          ? t('Tin nhắn khách hàng', 'Customer message')
                          : message.type === 'note'
                            ? t('Ghi chú nội bộ', 'Internal note')
                            : t('Nhân viên phản hồi', 'Agent reply')}
                      </strong>
                      <span>{message.text.slice(0, 65) || t('Tệp đính kèm', 'Attachment')}</span>
                      <time dateTime={message.sentAt}>{dateLabel(message.sentAt, locale)}</time>
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>
      {editing && canEditCustomer && (
        <EditCustomerModal
          customer={customer}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={onUpdateCustomer}
        />
      )}
    </aside>
  )
}
