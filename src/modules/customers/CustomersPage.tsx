import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BadgeCheck,
  MessageSquare,
  Pencil,
  Plus,
  ShoppingBag,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { initials } from '../../lib/inbox'
import { useOperations } from '../operations/context'
import { dateTime, money, normalizeSearch } from '../operations/domain'
import { operationLabel } from '../operations/labels'
import { operationsErrorMessage } from '../operations/errors'
import type { CustomerLifecycle, CustomerProfile } from '../operations/types'
import {
  ActivityTimeline,
  DetailDrawer,
  EmptyState,
  Metrics,
  ModulePageHeader,
  RecordLink,
  SearchToolbar,
  StatusBadge,
} from '../operations/ui'
import CustomerForm from './CustomerForm'
import type { Customer } from '../../types/inbox'

export default function CustomersPage() {
  const { t, locale, label } = useI18n()
  const { inbox, data, busy, run } = useOperations()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [membership, setMembership] = useState('all')
  const [owner, setOwner] = useState('all')
  const [form, setForm] = useState<Customer | 'new' | null>(null)
  const selected = inbox.customers.find((customer) => customer.id === params.get('id'))
  const profiles = new Map(data.customerProfiles.map((profile) => [profile.customerId, profile]))
  const customers = inbox.customers.filter((customer) => {
    const profile = profiles.get(customer.id)
    return (
      (status === 'all' || profile?.status === status) &&
      (membership === 'all' || customer.membership === membership) &&
      (owner === 'all' ||
        (owner === 'unassigned' ? !profile?.ownerId : profile?.ownerId === owner)) &&
      normalizeSearch(
        [
          customer.id,
          customer.name,
          customer.phone,
          customer.email,
          customer.company,
          ...(profile?.tags || []),
        ].join(' '),
      ).includes(normalizeSearch(search.trim()))
    )
  })
  const clear = () => {
    setSearch('')
    setStatus('all')
    setMembership('all')
    setOwner('all')
  }
  const deliveredRevenue = data.orders
    .filter((order) => order.status === 'delivered')
    .reduce((sum, order) => sum + order.total, 0)
  return (
    <div className="ops-page">
      <ModulePageHeader
        eyebrow="CRM 360°"
        title={t('Khách hàng', 'Customers')}
        description={t(
          'Một hồ sơ thống nhất. Hiểu khách hàng qua từng đơn hàng và lần tương tác.',
          'One connected profile. Understand every customer through orders and interactions.',
        )}
        action={
          <button className="button button-primary" onClick={() => setForm('new')}>
            <Plus size={16} />
            {t('Thêm khách hàng', 'Add customer')}
          </button>
        }
      />
      <Metrics
        items={[
          {
            label: t('Tổng khách hàng', 'Total customers'),
            value: inbox.customers.length,
            icon: Users,
          },
          {
            label: t('Khách hàng tiềm năng', 'Leads'),
            value: data.customerProfiles.filter((p) => p.status === 'lead').length,
            icon: UserPlus,
            color: 'amber',
          },
          {
            label: t('Thành viên Vàng / Bạch kim', 'Gold / Platinum members'),
            value: inbox.customers.filter((c) => ['Gold', 'Platinum'].includes(c.membership))
              .length,
            icon: BadgeCheck,
            color: 'green',
          },
          {
            label: t('Giá trị đơn đã giao', 'Delivered order value'),
            value: money(deliveredRevenue, locale),
            icon: ShoppingBag,
            hint: t('Tổng toàn bộ khách hàng', 'Across all customers'),
          },
        ]}
      />
      <div className={`ops-split ${selected ? 'has-detail' : ''}`}>
        <section className="ops-card">
          <SearchToolbar
            value={search}
            onChange={setSearch}
            placeholder={t('Tìm tên, email, số điện thoại…', 'Search name, email, phone…')}
          >
            <select
              className="ops-filter-select"
              aria-label={t('Lọc vòng đời khách hàng', 'Filter customer lifecycle')}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">{t('Tất cả vòng đời', 'All lifecycle stages')}</option>
              {['lead', 'active', 'inactive'].map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
            <select
              className="ops-filter-select"
              aria-label={t('Lọc hạng thành viên', 'Filter membership')}
              value={membership}
              onChange={(e) => setMembership(e.target.value)}
            >
              <option value="all">{t('Tất cả hạng', 'All memberships')}</option>
              {['Standard', 'Silver', 'Gold', 'Platinum'].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            <select
              className="ops-filter-select"
              aria-label={t('Lọc người phụ trách', 'Filter customer owner')}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
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
            {t(`${customers.length} khách hàng`, `${customers.length} customers`)}
          </div>
          {customers.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t('Khách hàng', 'Customer')}</th>
                    <th>{t('Liên hệ', 'Contact')}</th>
                    <th>{t('Vòng đời', 'Lifecycle')}</th>
                    <th>{t('Hạng thành viên', 'Membership')}</th>
                    <th>{t('Đơn hàng', 'Orders')}</th>
                    <th>{t('Phụ trách', 'Owner')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const profile = profiles.get(customer.id)
                    const orders = data.orders.filter((order) => order.customerId === customer.id)
                    return (
                      <tr
                        key={customer.id}
                        className={selected?.id === customer.id ? 'selected' : ''}
                      >
                        <td>
                          <button
                            className="ops-row-button ops-customer-cell"
                            onClick={() => setParams({ id: customer.id })}
                          >
                            <span
                              className="ops-avatar"
                              style={{ backgroundColor: customer.avatarColor }}
                            >
                              {initials(customer.name)}
                            </span>
                            <span>
                              <strong>{customer.name}</strong>
                              <small>
                                {customer.id} · {customer.company || t('Cá nhân', 'Individual')}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span>{customer.phone || '—'}</span>
                          <small>{customer.email || '—'}</small>
                        </td>
                        <td>
                          <StatusBadge value={profile?.status || 'lead'} />
                        </td>
                        <td>{label(customer.membership)}</td>
                        <td>
                          <strong>{orders.length}</strong>
                          <small>
                            {money(
                              orders
                                .filter((order) => order.status === 'delivered')
                                .reduce((sum, order) => sum + order.total, 0),
                              locale,
                            )}
                          </small>
                        </td>
                        <td>
                          {inbox.agents.find((agent) => agent.id === profile?.ownerId)?.name ||
                            t('Chưa phân công', 'Unassigned')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={t('Không tìm thấy khách hàng', 'No customers found')}
              onClear={clear}
            />
          )}
        </section>
        {selected && (
          <CustomerDrawer
            key={selected.id}
            customer={selected}
            profile={profiles.get(selected.id)}
            onClose={() => setParams({})}
            onEdit={() => setForm(selected)}
            run={run}
            busy={busy}
          />
        )}
      </div>
      {form && (
        <CustomerForm
          customer={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={(customer) => setParams({ id: customer.id })}
        />
      )}
    </div>
  )
}

function CustomerDrawer({
  customer,
  profile,
  onClose,
  onEdit,
  run,
  busy,
}: {
  customer: Customer
  profile?: CustomerProfile
  onClose: () => void
  onEdit: () => void
  run: ReturnType<typeof useOperations>['run']
  busy: boolean
}) {
  const { t, locale, label } = useI18n()
  const { inbox, data, service } = useOperations()
  const [note, setNote] = useState('')
  const [tag, setTag] = useState('')
  const [error, setError] = useState('')
  const act = async (action: Parameters<typeof run>[0], success: string) => {
    setError('')
    try {
      await run(action, success)
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }
  const update = (patch: Parameters<typeof service.updateCustomerProfile>[1]) =>
    act(
      () => service.updateCustomerProfile(customer.id, patch),
      t('Đã cập nhật hồ sơ khách hàng.', 'Customer profile updated.'),
    )
  const orders = data.orders.filter((order) => order.customerId === customer.id)
  const tickets = data.tickets.filter((ticket) => ticket.customerId === customer.id)
  const conversations = inbox.conversations.filter(
    (conversation) => conversation.customerId === customer.id,
  )
  const addTag = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = tag.trim()
    if (!value) return
    if (
      profile?.tags.some((existing) => existing.toLocaleLowerCase() === value.toLocaleLowerCase())
    ) {
      setError(t('Nhãn này đã tồn tại.', 'This tag already exists.'))
      return
    }
    try {
      await run(
        () =>
          service.updateCustomerProfile(customer.id, { tags: [...(profile?.tags || []), value] }),
        t('Đã thêm nhãn.', 'Tag added.'),
      )
      setTag('')
      setError('')
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }
  const addNote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    try {
      await run(
        () => service.addCustomerNote(customer.id, note.trim()),
        t('Đã lưu ghi chú nội bộ.', 'Internal note saved.'),
      )
      setNote('')
      setError('')
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }
  return (
    <DetailDrawer title={customer.name} subtitle={`${customer.id} · CRM 360°`} onClose={onClose}>
      <div className="ops-detail-intro">
        <span className="ops-avatar" style={{ backgroundColor: customer.avatarColor }}>
          {initials(customer.name)}
        </span>
        <div>
          <strong>{customer.name}</strong>
          <p>{customer.company || t('Khách hàng cá nhân', 'Individual customer')}</p>
          <span className="membership-badge">{label(customer.membership)}</span>
        </div>
        <button
          className="icon-button"
          aria-label={t('Chỉnh sửa khách hàng', 'Edit customer')}
          onClick={onEdit}
        >
          <Pencil size={16} />
        </button>
      </div>
      <div className="ops-record-actions">
        <Link className="button button-primary" to={`/orders?customer=${customer.id}&create=1`}>
          <Plus size={14} />
          {t('Tạo đơn hàng', 'Create order')}
        </Link>
        <Link className="button button-secondary" to={`/care?customer=${customer.id}&create=1`}>
          <Plus size={14} />
          {t('Tạo yêu cầu hỗ trợ', 'Create ticket')}
        </Link>
      </div>
      <section className="ops-detail-section">
        <h3>{t('Thông tin khách hàng', 'Customer information')}</h3>
        <dl className="ops-detail-list">
          <div>
            <dt>{t('Điện thoại', 'Phone')}</dt>
            <dd>
              {customer.phone ? (
                <a href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`}>{customer.phone}</a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('Địa chỉ', 'Location')}</dt>
            <dd>{customer.location || '—'}</dd>
          </div>
        </dl>
        <div className="ops-field-grid">
          <label className="ops-field">
            {t('Vòng đời', 'Lifecycle')}
            <select
              disabled={busy}
              value={profile?.status || 'lead'}
              onChange={(e) => void update({ status: e.target.value as CustomerLifecycle })}
            >
              {['lead', 'active', 'inactive'].map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            {t('Phụ trách', 'Owner')}
            <select
              disabled={busy}
              value={profile?.ownerId || ''}
              onChange={(e) => void update({ ownerId: e.target.value || null })}
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
            {t('Nguồn khách hàng', 'Customer source')}
            <select
              disabled={busy}
              value={profile?.source || 'manual'}
              onChange={(e) => void update({ source: e.target.value as CustomerProfile['source'] })}
            >
              {[
                'manual',
                'referral',
                'whatsapp',
                'instagram',
                'messenger',
                'telegram',
                'livechat',
                'email',
              ].map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="ops-detail-section">
        <h3>{t('Nhãn phân loại', 'Customer tags')}</h3>
        <div className="ops-tag-list">
          {profile?.tags.map((value) => (
            <span className="ops-tag" key={value}>
              {value}
              <button
                aria-label={t(`Xóa nhãn ${value}`, `Remove tag ${value}`)}
                disabled={busy}
                onClick={() => void update({ tags: profile.tags.filter((item) => item !== value) })}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form className="ops-note-form" onSubmit={addTag}>
          <input
            aria-label={t('Nhãn khách hàng mới', 'New customer tag')}
            placeholder={t('Thêm nhãn…', 'Add a tag…')}
            maxLength={40}
            value={tag}
            disabled={busy}
            onChange={(e) => setTag(e.target.value)}
          />
          <button className="button button-secondary" disabled={busy || !tag.trim()}>
            <Plus size={13} />
            {t('Thêm', 'Add')}
          </button>
        </form>
      </section>
      <section className="ops-detail-section">
        <h3>
          <ShoppingBag size={15} /> {t('Đơn hàng gần đây', 'Recent orders')} ({orders.length})
        </h3>
        {orders
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5)
          .map((order) => (
            <div className="ops-related-record" key={order.id}>
              <RecordLink to={`/orders?id=${order.id}`}>{order.number}</RecordLink>
              <StatusBadge value={order.status} />
              <span>{money(order.total, locale)}</span>
            </div>
          ))}
        {!orders.length && <p className="ops-muted">{t('Chưa có đơn hàng.', 'No orders yet.')}</p>}
      </section>
      <section className="ops-detail-section">
        <h3>
          {t('Yêu cầu hỗ trợ', 'Support tickets')} ({tickets.length})
        </h3>
        {tickets.slice(0, 5).map((ticket) => (
          <div className="ops-related-record" key={ticket.id}>
            <RecordLink to={`/care?id=${ticket.id}`}>
              {ticket.number} · {ticket.subject}
            </RecordLink>
            <StatusBadge value={ticket.status} />
          </div>
        ))}
        {!tickets.length && (
          <p className="ops-muted">{t('Chưa có yêu cầu hỗ trợ.', 'No support tickets yet.')}</p>
        )}
      </section>
      <section className="ops-detail-section">
        <h3>
          <MessageSquare size={15} /> {t('Hội thoại', 'Conversations')} ({conversations.length})
        </h3>
        {conversations.slice(0, 5).map((conversation) => (
          <div className="ops-related-record" key={conversation.id}>
            <RecordLink to={`/inbox?conversation=${conversation.id}`}>
              {conversation.subject}
            </RecordLink>
            <small>{operationLabel(conversation.channel, locale)}</small>
          </div>
        ))}
      </section>
      <section className="ops-detail-section">
        <h3>{t('Ghi chú nội bộ', 'Internal notes')}</h3>
        <form className="ops-note-form" onSubmit={addNote}>
          <textarea
            aria-label={t('Ghi chú khách hàng', 'Customer note')}
            placeholder={t(
              'Ghi lại nhu cầu hoặc lần liên hệ…',
              'Record customer needs or a follow-up…',
            )}
            maxLength={2000}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="button button-secondary" disabled={busy || !note.trim()}>
            {t('Lưu ghi chú', 'Save note')}
          </button>
        </form>
        <ol className="ops-comment-list">
          {profile?.notes
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
        <h3>{t('Lịch sử thay đổi', 'Activity history')}</h3>
        <ActivityTimeline
          events={data.auditEvents.filter(
            (event) => event.entity === 'customer' && event.entityId === customer.id,
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
