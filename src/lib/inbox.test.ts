import { describe, expect, it } from 'vitest'
import type { Conversation, InboxData } from '../types/inbox'
import { filterConversations } from './inbox'
import type { InboxFilters } from './inbox'

function conversation(id: string, patch: Partial<Conversation> = {}): Conversation {
  return {
    id,
    customerId: 'customer-1',
    channel: 'instagram',
    status: 'open',
    priority: 'normal',
    assigneeId: 'agent-linh',
    teamId: 'team-sales',
    subject: 'Tư vấn sản phẩm',
    unread: 0,
    lastMessageAt: '2026-11-17T09:00:00.000Z',
    dueAt: '2026-11-17T12:00:00.000Z',
    sourceUrl: null,
    tags: [],
    mentioned: false,
    bot: false,
    messages: [
      {
        id: `message-${id}`,
        type: 'incoming',
        text: 'Cho mình xem bảng màu.',
        sentAt: '2026-11-17T09:00:00.000Z',
        delivery: 'read',
      },
    ],
    ...patch,
  }
}

function dataset(conversations: Conversation[]): InboxData {
  return {
    customers: [
      {
        id: 'customer-1',
        name: 'Đặng Thùy Dương',
        email: 'duong@example.test',
        phone: '0901234567',
        company: 'Dương Studio',
        membership: 'Gold',
        location: 'Đà Nẵng',
        avatarColor: '#ece8ff',
      },
      {
        id: 'customer-2',
        name: 'Trần Minh',
        email: 'minh@example.test',
        phone: '0912345678',
        company: '',
        membership: 'Standard',
        location: 'Hà Nội',
        avatarColor: '#edf5ff',
      },
    ],
    conversations,
    agents: [],
    teams: [],
  }
}

const defaults: InboxFilters = {
  search: '',
  status: 'all',
  channel: 'all',
  assignee: 'all',
  view: 'all',
}
const ids = (data: InboxData, patch: Partial<InboxFilters> = {}) =>
  filterConversations(data, { ...defaults, ...patch }).map((item) => item.id)

describe('Inbox conversation filtering', () => {
  it('searches Vietnamese names without case, diacritics, or surrounding whitespace', () => {
    const data = dataset([
      conversation('duong'),
      conversation('minh', { customerId: 'customer-2' }),
    ])
    expect(ids(data, { search: '  DANG THUY DUONG  ' })).toEqual(['duong'])
    expect(ids(data, { search: 'đặng thùy' })).toEqual(['duong'])
  })

  it('searches email, phone, subject, and message contents', () => {
    const data = dataset([conversation('match')])
    for (const search of ['duong@example.test', '0901234567', 'tu van san pham', 'bang mau']) {
      expect(ids(data, { search })).toEqual(['match'])
    }
    expect(ids(data, { search: 'không tồn tại' })).toEqual([])
  })

  it('applies status, channel, and assignment filters together', () => {
    const data = dataset([
      conversation('match', { channel: 'email', status: 'pending', assigneeId: 'agent-huy' }),
      conversation('wrong-channel', { status: 'pending', assigneeId: 'agent-huy' }),
      conversation('wrong-status', { channel: 'email', assigneeId: 'agent-huy' }),
      conversation('wrong-agent', { channel: 'email', status: 'pending' }),
    ])
    expect(ids(data, { status: 'pending', channel: 'email', assignee: 'agent-huy' })).toEqual([
      'match',
    ])
  })

  it('keeps closed conversations only in Archive and includes resolved conversations in All', () => {
    const data = dataset([
      conversation('open'),
      conversation('resolved', { status: 'resolved' }),
      conversation('closed', { status: 'closed' }),
    ])
    expect(ids(data)).toEqual(['open', 'resolved'])
    expect(ids(data, { view: 'archive' })).toEqual(['closed'])
    expect(ids(data, { view: 'archive', status: 'open' })).toEqual([])
  })

  it('supports personal, unassigned, mentioned, bot, team, and priority views', () => {
    const data = dataset([
      conversation('mine', { teamId: null }),
      conversation('unassigned', { assigneeId: null, teamId: null }),
      conversation('mentioned', { assigneeId: 'agent-huy', mentioned: true, teamId: null }),
      conversation('bot', { assigneeId: 'agent-huy', bot: true, teamId: null }),
      conversation('team', { assigneeId: 'agent-huy', teamId: 'team-care' }),
      conversation('high', { assigneeId: 'agent-huy', priority: 'high', teamId: null }),
      conversation('urgent', { assigneeId: 'agent-huy', priority: 'urgent', teamId: null }),
    ])
    expect(ids(data, { view: 'mine' })).toEqual(['mine'])
    expect(ids(data, { view: 'unassigned' })).toEqual(['unassigned'])
    expect(ids(data, { assignee: 'unassigned' })).toEqual(['unassigned'])
    expect(ids(data, { view: 'mentions' })).toEqual(['mentioned'])
    expect(ids(data, { view: 'bots' })).toEqual(['bot'])
    expect(ids(data, { view: 'teams' })).toEqual(['team'])
    expect(ids(data, { view: 'views' })).toEqual(['high', 'urgent'])
  })

  it('sorts unread conversations first, then newest, without changing source order', () => {
    const data = dataset([
      conversation('read-new', { lastMessageAt: '2026-11-17T12:00:00.000Z' }),
      conversation('unread-old', { unread: 2, lastMessageAt: '2026-11-16T09:00:00.000Z' }),
      conversation('unread-new', { unread: 1, lastMessageAt: '2026-11-17T10:00:00.000Z' }),
      conversation('read-old', { lastMessageAt: '2026-11-15T09:00:00.000Z' }),
    ])
    const originalOrder = data.conversations.map((item) => item.id)
    expect(ids(data)).toEqual(['unread-new', 'unread-old', 'read-new', 'read-old'])
    expect(data.conversations.map((item) => item.id)).toEqual(originalOrder)
  })

  it('returns an empty list when no customer or message matches', () => {
    expect(ids(dataset([]))).toEqual([])
    expect(
      ids(dataset([conversation('orphan', { customerId: 'missing' })]), { search: 'duong' }),
    ).toEqual([])
  })
})
