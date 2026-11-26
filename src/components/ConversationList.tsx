import { ArrowDownWideNarrow, Check, Filter, Inbox, Menu, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Conversation, InboxData } from '../types/inbox'
import { CHANNELS, STATUS_LABELS, VIEW_LABELS, formatTime } from '../lib/inbox'
import type { InboxFilters } from '../lib/inbox'
import { DEFAULT_TIKTOK_SHOPS, listPublicTikTokShops } from '../lib/tiktokShops'
import { ConversationCategoryBadge, InboxCategoryDrawer } from './InboxCategoryDrawer'
import { Avatar } from './shared'
import { useI18n } from '../i18n'

export function ConversationList({
  data,
  conversations,
  filters,
  onFilters,
  selectedId,
  onSelect,
  onClear,
}: {
  data: InboxData
  conversations: Conversation[]
  filters: InboxFilters
  onFilters: (patch: Partial<InboxFilters>) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const { t, label } = useI18n()
  const [showFilters, setShowFilters] = useState(false)
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false)
  const currentCategory = filters.category ?? 'all'
  const currentShopId = filters.shopId ?? 'all'
  const tiktokShops = listPublicTikTokShops(DEFAULT_TIKTOK_SHOPS)

  useEffect(() => {
    const handleExternalFilter = (event: Event) => {
      const detail = (event as CustomEvent<Partial<InboxFilters>>).detail
      if (detail) onFilters(detail)
    }
    window.addEventListener('smartsales:inbox-filter', handleExternalFilter)
    return () => window.removeEventListener('smartsales:inbox-filter', handleExternalFilter)
  }, [onFilters])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('smartsales:inbox-filter-state', {
        detail: { category: currentCategory, shopId: currentShopId },
      }),
    )
  }, [currentCategory, currentShopId])
  const activeFilters =
    Number(filters.channel !== 'all') +
    Number(filters.assignee !== 'all') +
    Number(currentCategory !== 'all') +
    Number(currentShopId !== 'all')
  return (
    <section
      className="conversation-list-panel"
      aria-label={t('Danh sách hội thoại', 'Conversations')}
    >
      <div className="conversation-list-heading">
        <div className="conversation-heading-left">
          <button
            type="button"
            className={`icon-button category-menu-trigger ${currentCategory !== 'all' ? 'selected' : ''}`}
            aria-label={t('Danh mục sản phẩm', 'Product categories')}
            title={t('Danh mục sản phẩm & Sản phẩm con', 'Product categories & sub-items')}
            onClick={() => setCategoryDrawerOpen(true)}
          >
            <Menu size={17} />
          </button>
          <div>
            <h2>{label(VIEW_LABELS[filters.view])}</h2>
            <span className="conversation-count">
              {t(`${conversations.length} hội thoại`, `${conversations.length} conversations`)}
              {currentCategory !== 'all' ? ` · ${currentCategory}` : ''}
            </span>
          </div>
        </div>
        <button
          className={`icon-button filter-toggle ${showFilters || activeFilters ? 'selected' : ''}`}
          aria-label={t('Bộ lọc hội thoại', 'Conversation filters')}
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={17} />
          {activeFilters > 0 && <span className="filter-dot" />}
        </button>
      </div>
      <InboxCategoryDrawer
        isOpen={categoryDrawerOpen}
        conversations={data.conversations}
        selectedCategory={currentCategory}
        onSelectCategory={(category) => onFilters({ category })}
        onClose={() => setCategoryDrawerOpen(false)}
      />
      <div className="conversation-search">
        <Search size={16} />
        <input
          aria-label={t('Tìm kiếm hội thoại', 'Search conversations')}
          data-conversation-search
          placeholder={t('Tìm kiếm hội thoại…', 'Search conversations…')}
          value={filters.search}
          onChange={(e) => onFilters({ search: e.target.value })}
        />
        {filters.search && (
          <button
            className="icon-button"
            aria-label={t('Xóa tìm kiếm', 'Clear search')}
            onClick={() => onFilters({ search: '' })}
          >
            <X size={13} />
          </button>
        )}
        <kbd>/</kbd>
      </div>
      <div className="status-tabs" aria-label={t('Trạng thái hội thoại', 'Conversation status')}>
        {(['all', 'open', 'pending', 'resolved'] as const).map((status) => (
          <button
            key={status}
            className={filters.status === status ? 'active' : ''}
            onClick={() => onFilters({ status })}
          >
            {status === 'all' ? t('Tất cả', 'All') : label(STATUS_LABELS[status])}
            {status === 'open' && (
              <span>{data.conversations.filter((c) => c.status === 'open').length}</span>
            )}
          </button>
        ))}
      </div>
      {showFilters && (
        <div className="conversation-filters">
          <label>
            {t('Kênh', 'Channel')}
            <select
              aria-label={t('Lọc theo kênh', 'Filter by channel')}
              value={filters.channel}
              onChange={(e) => onFilters({ channel: e.target.value as InboxFilters['channel'] })}
            >
              <option value="all">{t('Tất cả kênh', 'All channels')}</option>
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {label(c.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Phụ trách', 'Assignee')}
            <select
              aria-label={t('Lọc theo nhân viên', 'Filter by assignee')}
              value={filters.assignee}
              onChange={(e) => onFilters({ assignee: e.target.value })}
            >
              <option value="all">{t('Tất cả nhân viên', 'All teammates')}</option>
              <option value="unassigned">{label('Unassigned')}</option>
              {data.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Trạng thái', 'Status')}
            <select
              aria-label={t('Lọc theo trạng thái', 'Filter by status')}
              value={filters.status}
              onChange={(e) => onFilters({ status: e.target.value as InboxFilters['status'] })}
            >
              <option value="all">{t('Tất cả trạng thái', 'All statuses')}</option>
              {Object.entries(STATUS_LABELS).map(([id, statusLabel]) => (
                <option key={id} value={id}>
                  {label(statusLabel)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Tài khoản TikTok Shop', 'TikTok Shop account')}
            <select
              aria-label={t('Lọc theo tài khoản TikTok Shop', 'Filter by TikTok Shop account')}
              value={currentShopId}
              onChange={(e) => onFilters({ shopId: e.target.value })}
            >
              <option value="all">
                {t('Tất cả tài khoản TikTok Shop', 'All TikTok Shop accounts')}
              </option>
              {tiktokShops.map((shop) => (
                <option key={shop.shopId} value={shop.shopId}>
                  {shop.accountName}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={onClear}>
            {t('Đặt lại bộ lọc', 'Reset filters')}
          </button>
        </div>
      )}
      <div className="list-sort">
        <span>
          <span className="live-indicator" />{' '}
          {filters.channel !== 'all'
            ? label(CHANNELS.find((c) => c.id === filters.channel)?.label || '')
            : t('Tất cả kênh', 'All channels')}
        </span>
        <span>
          <ArrowDownWideNarrow size={13} /> {t('Chưa đọc trước', 'Unread first')}
        </span>
      </div>
      <div className="conversation-items">
        {conversations.map((c) => (
          <ConversationItem
            key={c.id}
            conversation={c}
            data={data}
            selected={selectedId === c.id}
            onClick={() => onSelect(c.id)}
          />
        ))}
        {conversations.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <Inbox size={28} />
            </div>
            <h3>{t('Không tìm thấy hội thoại', 'No conversations found')}</h3>
            <p>
              {t(
                'Thử từ khóa hoặc bộ lọc khác để tìm hội thoại.',
                'Try another search term or filter to find a conversation.',
              )}
            </p>
            <button className="button button-secondary" onClick={onClear}>
              {t('Xóa bộ lọc', 'Clear filters')}
            </button>
          </div>
        )}
      </div>
      <div className="list-footer">
        <span className="online-dot" /> {t('Hộp thư đã được cập nhật', 'Your inbox is up to date')}{' '}
        <Check size={13} />
      </div>
    </section>
  )
}
export function ConversationItem({
  conversation: c,
  data,
  selected,
  onClick,
}: {
  conversation: Conversation
  data: InboxData
  selected: boolean
  onClick: () => void
}) {
  const { locale, t, label } = useI18n()
  const customer = data.customers.find((item) => item.id === c.customerId)!
  const agent = data.agents.find((item) => item.id === c.assigneeId)
  const last = c.messages.at(-1)
  return (
    <button
      className={`conversation-item ${selected ? 'selected' : ''} ${c.unread ? 'unread' : ''}`}
      onClick={onClick}
      aria-label={`${customer.name}, ${c.subject}`}
      aria-pressed={selected}
    >
      <Avatar customer={customer} channel={c.channel} />
      <span className="conversation-preview">
        <span className="conversation-name-row">
          <strong>{customer.name}</strong>
          <time dateTime={c.lastMessageAt}>{formatTime(c.lastMessageAt, locale)}</time>
        </span>
        <span className="last-message">
          {last?.type === 'outgoing'
            ? t('Bạn: ', 'You: ')
            : last?.type === 'note'
              ? t('Ghi chú: ', 'Note: ')
              : ''}
          {last?.text || last?.attachments?.[0]?.name || c.subject}
        </span>
        <span className="conversation-meta">
          <span className={`mini-status status-${c.status}`}>
            <span />
            {label(STATUS_LABELS[c.status])}
          </span>
          <ConversationCategoryBadge conversation={c} />
          {(c.priority === 'high' || c.priority === 'urgent') && (
            <span className={`priority-tag priority-${c.priority}`}>
              {label(c.priority === 'urgent' ? 'Urgent' : 'High')}
            </span>
          )}
          <span className="preview-assignee" title={agent?.name || label('Unassigned')}>
            {agent ? (
              <span style={{ backgroundColor: agent.color }}>{agent.initials}</span>
            ) : (
              <span className="unassigned-avatar">—</span>
            )}
          </span>
          {c.unread > 0 && <span className="unread-count">{c.unread}</span>}
        </span>
      </span>
    </button>
  )
}
