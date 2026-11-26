import { ArrowRight, CheckCircle2, Clock3, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { operationLabel } from './labels'
import { dateTime } from './domain'
import type { AuditEvent } from './types'

export function ModulePageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="ops-page-heading">
      <div>
        <span className="ops-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}
export function Metrics({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; color?: string }[]
}) {
  return (
    <div className="ops-metrics">
      {items.map(({ label, value, hint, icon: Icon, color }) => (
        <div className="ops-metric" key={label}>
          <span className={`ops-metric-icon ${color || ''}`}>
            <Icon size={20} />
          </span>
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
            {hint && <small>{hint}</small>}
          </div>
        </div>
      ))}
    </div>
  )
}
export function StatusBadge({ value }: { value: string }) {
  const { locale } = useI18n()
  return (
    <span className={`ops-badge ops-badge-${value}`}>
      <span />
      {operationLabel(value, locale)}
    </span>
  )
}
export function EmptyState({ message, onClear }: { message: string; onClear?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="ops-empty">
      <Search size={27} />
      <h3>{message}</h3>
      <p>
        {t(
          'Thử thay đổi bộ lọc hoặc tạo dữ liệu mới.',
          'Try changing your filters or creating a new record.',
        )}
      </p>
      {onClear && (
        <button className="button button-secondary" onClick={onClear}>
          {t('Xóa bộ lọc', 'Clear filters')}
        </button>
      )}
    </div>
  )
}
export function SearchToolbar({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="ops-toolbar">
      <label className="ops-search">
        <Search size={16} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            className="icon-button"
            aria-label={t('Xóa tìm kiếm', 'Clear search')}
            onClick={() => onChange('')}
          >
            <X size={14} />
          </button>
        )}
      </label>
      <div className="ops-toolbar-filters">{children}</div>
    </div>
  )
}
export function DetailDrawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const closeRef = useRef(onClose)
  const panelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (window.innerWidth <= 1000) queueMicrotask(() => buttonRef.current?.focus())
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && window.innerWidth <= 1000) {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        )
        if (!controls?.length) return
        const first = controls[0],
          last = controls[controls.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      if (window.innerWidth <= 1000 && previous?.isConnected) previous.focus()
    }
  }, [])
  return (
    <aside ref={panelRef} className="ops-detail" aria-label={title}>
      <div className="ops-detail-heading">
        <div>
          {subtitle && <span className="ops-eyebrow">{subtitle}</span>}
          <h2>{title}</h2>
        </div>
        <button
          ref={buttonRef}
          className="icon-button"
          aria-label={t('Đóng chi tiết', 'Close details')}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <div className="ops-detail-body">{children}</div>
    </aside>
  )
}
export function RecordLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="ops-record-link" to={to}>
      {children}
      <ArrowRight size={12} />
    </Link>
  )
}
export function ActivityTimeline({ events }: { events: AuditEvent[] }) {
  const { locale, t } = useI18n()
  return events.length ? (
    <ol className="ops-timeline">
      {events
        .slice()
        .reverse()
        .slice(0, 20)
        .map((event) => (
          <li key={event.id}>
            <Clock3 size={12} />
            <div>
              <strong>{event.description}</strong>
              <time dateTime={event.createdAt}>{dateTime(event.createdAt, locale)}</time>
            </div>
          </li>
        ))}
    </ol>
  ) : (
    <p className="ops-muted">{t('Chưa có hoạt động.', 'No activity yet.')}</p>
  )
}
export function InlineNotice({ children }: { children: ReactNode }) {
  return (
    <div className="ops-inline-notice">
      <CheckCircle2 size={15} />
      <span>{children}</span>
    </div>
  )
}
