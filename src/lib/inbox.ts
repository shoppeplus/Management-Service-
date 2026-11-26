import type { Channel, ConversationStatus, InboxData, InboxView, Priority } from '../types/inbox'
import { matchesCategoryFilter } from './productCategories'

export const CURRENT_AGENT_ID = 'agent-linh'
export const CHANNELS: { id: Channel; label: string; color: string; short: string }[] = [
  { id: 'shopee', label: 'Shopee', color: '#e9512c', short: 'SP' },
  { id: 'lazada', label: 'Lazada', color: '#3f45df', short: 'LZ' },
  { id: 'tiktok', label: 'TikTok Shop', color: '#20232d', short: 'TT' },
  { id: 'zalo', label: 'Zalo OA', color: '#0879ee', short: 'ZL' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#22b37c', short: 'WA' },
  { id: 'instagram', label: 'Instagram', color: '#d6538e', short: 'IG' },
  { id: 'messenger', label: 'Messenger', color: '#367bf5', short: 'FB' },
  { id: 'telegram', label: 'Telegram', color: '#2aa5d9', short: 'TG' },
  { id: 'livechat', label: 'Live Chat', color: '#7760d6', short: 'LC' },
  { id: 'email', label: 'Email', color: '#e39942', short: 'EM' },
]
export const MARKETPLACE_CHANNELS: Channel[] = ['shopee', 'lazada', 'tiktok']
export const SOCIAL_CHANNELS: Channel[] = ['zalo', 'messenger', 'instagram', 'whatsapp', 'telegram']
export const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
}
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}
export const VIEW_LABELS: Record<InboxView, string> = {
  mine: 'My Inbox',
  all: 'All Conversations',
  unassigned: 'Unassigned',
  mentions: 'Mentions',
  bots: 'Bots',
  teams: 'Teams',
  views: 'Priority view',
  archive: 'Archive',
}
export interface InboxFilters {
  search: string
  status: ConversationStatus | 'all'
  channel: Channel | 'all'
  assignee: string
  view: InboxView
  category?: string
  shopId?: string
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
export function filterConversations(data: InboxData, filters: InboxFilters) {
  const query = normalize(filters.search.trim())
  return data.conversations
    .filter((c) => {
      const customer = data.customers.find((item) => item.id === c.customerId)
      if (filters.view === 'archive' ? c.status !== 'closed' : c.status === 'closed') return false
      if (filters.view === 'mine' && c.assigneeId !== CURRENT_AGENT_ID) return false
      if (filters.view === 'unassigned' && c.assigneeId !== null) return false
      if (filters.view === 'mentions' && !c.mentioned) return false
      if (filters.view === 'bots' && !c.bot) return false
      if (filters.view === 'teams' && !c.teamId) return false
      if (filters.view === 'views' && c.priority !== 'high' && c.priority !== 'urgent') return false
      if (filters.status !== 'all' && c.status !== filters.status) return false
      if (filters.channel !== 'all' && c.channel !== filters.channel) return false
      if (
        filters.category &&
        filters.category !== 'all' &&
        !matchesCategoryFilter(c, filters.category)
      )
        return false
      if (
        filters.shopId &&
        filters.shopId !== 'all' &&
        c.shopId !== filters.shopId &&
        c.connectionId !== filters.shopId
      )
        return false
      if (filters.assignee === 'unassigned' && c.assigneeId !== null) return false
      if (
        filters.assignee !== 'all' &&
        filters.assignee !== 'unassigned' &&
        c.assigneeId !== filters.assignee
      )
        return false
      return (
        !query ||
        normalize(
          [
            customer?.name,
            customer?.email,
            customer?.phone,
            c.subject,
            ...c.messages.map((m) => m.text),
          ].join(' '),
        ).includes(query)
      )
    })
    .sort(
      (a, b) =>
        Number(b.unread > 0) - Number(a.unread > 0) ||
        b.lastMessageAt.localeCompare(a.lastMessageAt),
    )
}
export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
export const formatTime = (iso: string, locale: 'vi' | 'en' = 'vi') =>
  new Date(iso).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
export const formatDate = (iso: string, locale: 'vi' | 'en' = 'vi') =>
  new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
export const formatBytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`
