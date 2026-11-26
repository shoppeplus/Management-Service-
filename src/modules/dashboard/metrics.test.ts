import { describe, expect, it } from 'vitest'
import type { Conversation, InboxData, Message } from '../../types/inbox'
import type { OperationsData, Order, Shipment, Ticket } from '../operations/types'
import { buildDashboard } from './metrics'

const now = new Date(2026, 10, 17, 12, 0, 0)
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()

function inbox(): InboxData {
  return {
    customers: [
      {
        id: 'customer-a',
        name: 'Nguyễn Mai',
        phone: '',
        email: '',
        company: '',
        membership: 'Standard',
        location: '',
        avatarColor: '#eee',
      },
      {
        id: 'customer-b',
        name: 'Trần Bình',
        phone: '',
        email: '',
        company: '',
        membership: 'Gold',
        location: '',
        avatarColor: '#ddd',
      },
    ],
    conversations: [],
    agents: [
      { id: 'agent-a', name: 'Agent A', initials: 'AA', color: '#eee' },
      { id: 'agent-b', name: 'Agent B', initials: 'AB', color: '#ddd' },
    ],
    teams: [],
  }
}

function operations(): OperationsData {
  return {
    schemaVersion: 1,
    customerProfiles: [],
    products: [],
    orders: [],
    shipments: [],
    tickets: [],
    auditEvents: [],
  }
}

function order(id: string, patch: Partial<Order> = {}): Order {
  return {
    id,
    number: `BG-${id}`,
    customerId: 'customer-a',
    items: [
      { productId: 'product-a', sku: 'SP-A', name: 'Bình gốm', quantity: 2, unitPrice: 50000 },
    ],
    status: 'draft',
    paymentStatus: 'unpaid',
    paymentMethod: 'cod',
    subtotal: 100000,
    discount: 0,
    shippingFee: 0,
    total: 100000,
    shippingAddress: 'Hà Nội',
    recipientName: 'Nguyễn Mai',
    recipientPhone: '0901234567',
    note: '',
    createdAt: at(14),
    updatedAt: at(14),
    ...patch,
  }
}

function message(id: string, type: Message['type'] = 'incoming', sentAt = at(14)): Message {
  return { id, type, text: 'Tư vấn sản phẩm', sentAt, delivery: 'delivered' }
}

function conversation(id: string, patch: Partial<Conversation> = {}): Conversation {
  return {
    id,
    customerId: 'customer-a',
    channel: 'shopee',
    status: 'open',
    priority: 'normal',
    assigneeId: null,
    teamId: null,
    subject: `Hội thoại ${id}`,
    unread: 0,
    lastMessageAt: at(14),
    dueAt: at(18),
    sourceUrl: null,
    tags: [],
    mentioned: false,
    bot: false,
    messages: [],
    ...patch,
  }
}

function ticket(id: string, patch: Partial<Ticket> = {}): Ticket {
  return {
    id,
    number: `TK-${id}`,
    customerId: 'customer-b',
    orderId: null,
    conversationId: null,
    subject: `Yêu cầu ${id}`,
    description: 'Hỗ trợ giao hàng',
    category: 'delivery',
    status: 'open',
    priority: 'normal',
    assigneeId: null,
    dueAt: at(18),
    resolution: '',
    comments: [],
    createdAt: at(14),
    updatedAt: at(14),
    resolvedAt: null,
    ...patch,
  }
}

function shipment(id: string, patch: Partial<Shipment> = {}): Shipment {
  return {
    id,
    trackingNumber: `VC-${id}`,
    orderId: 'order-a',
    carrierId: 'demo-express',
    status: 'exception',
    shippingFee: 30000,
    codAmount: 100000,
    estimatedDeliveryAt: at(18),
    events: [],
    createdAt: at(14),
    updatedAt: at(16),
    ...patch,
  }
}

describe('dashboard calendar windows and sales totals', () => {
  it('includes exact local start and now, places prior boundaries in previous window, and excludes future/invalid dates', () => {
    const data = operations()
    const start = new Date(2026, 10, 11).getTime()
    const previousStart = new Date(2026, 10, 4).getTime()
    data.orders = [
      order('start', { createdAt: new Date(start).toISOString() }),
      order('now', { createdAt: now.toISOString() }),
      order('future', { createdAt: new Date(now.getTime() + 1).toISOString() }),
      order('prior-end', { createdAt: new Date(start - 1).toISOString() }),
      order('prior-start', { createdAt: new Date(previousStart).toISOString() }),
      order('too-old', { createdAt: new Date(previousStart - 1).toISOString() }),
      order('invalid', { createdAt: 'not-a-date' }),
    ]
    const dashboard = buildDashboard(inbox(), data, 7, now)
    expect(dashboard.period).toEqual({
      start: '2026-11-11',
      end: '2026-11-17',
      previousStart: '2026-11-04',
      previousEnd: '2026-11-10',
    })
    expect(dashboard.summary.orderCount).toBe(2)
    expect(dashboard.previous.orderCount).toBe(2)
    expect(dashboard.summary.orderValue).toBe(200000)
    expect(dashboard.previous.orderValue).toBe(200000)
    expect(dashboard.orders.map((item) => item.id)).toEqual(['now', 'start'])
    expect(dashboard.trend).toHaveLength(7)
    expect(dashboard.trend[0]).toMatchObject({ date: '2026-11-11', orderCount: 1 })
    expect(dashboard.trend[6]).toMatchObject({ date: '2026-11-17', orderCount: 1 })
  })

  it('counts all recorded order statuses but excludes cancellation/return values and refunded delivered values', () => {
    const data = operations()
    data.orders = [
      order('draft', { total: 75000, discount: 25000 }),
      order('confirmed', { status: 'confirmed', total: 130000, shippingFee: 30000 }),
      order('packing', { status: 'packing' }),
      order('shipped', { status: 'shipped' }),
      order('delivered', { status: 'delivered', paymentStatus: 'paid' }),
      order('cancelled', { status: 'cancelled', paymentStatus: 'paid' }),
      order('returned', { status: 'returned', paymentStatus: 'refunded' }),
      order('refunded', { status: 'delivered', paymentStatus: 'refunded' }),
    ]
    const dashboard = buildDashboard(inbox(), data, 7, now)
    expect(dashboard.summary).toMatchObject({
      orderCount: 8,
      orderValue: 605000,
      deliveredValue: 100000,
    })
    expect(dashboard.orderStatuses).toEqual([
      { status: 'draft', count: 1 },
      { status: 'confirmed', count: 1 },
      { status: 'packing', count: 1 },
      { status: 'shipped', count: 1 },
      { status: 'delivered', count: 2 },
      { status: 'cancelled', count: 1 },
      { status: 'returned', count: 1 },
    ])
    expect(dashboard.trend.reduce((sum, day) => sum + day.orderValue, 0)).toBe(605000)
    expect(dashboard.trend.reduce((sum, day) => sum + day.orderCount, 0)).toBe(8)
    expect(dashboard.orders).toHaveLength(6)
  })

  it('keeps a row for each calendar day across month/year and daylight-saving boundaries', () => {
    const winter = buildDashboard(inbox(), operations(), 7, new Date(2027, 0, 2, 13))
    expect(winter.period).toEqual({
      start: '2026-12-27',
      end: '2027-01-02',
      previousStart: '2026-12-20',
      previousEnd: '2026-12-26',
    })
    expect(winter.trend.map((day) => day.date)).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
    const autumn = buildDashboard(inbox(), operations(), 7, new Date(2026, 10, 3, 12))
    expect(autumn.trend.map((day) => day.date)).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ])
    expect(
      new Set(buildDashboard(inbox(), operations(), 90, now).trend.map((day) => day.date)).size,
    ).toBe(90)
  })

  it('returns honest zeros and empty lists without fabricating sales or activity', () => {
    const dashboard = buildDashboard(inbox(), operations(), 30, now)
    expect(dashboard.summary).toEqual({
      orderCount: 0,
      orderValue: 0,
      deliveredValue: 0,
      incomingMessages: 0,
      activeCustomers: 0,
    })
    expect(dashboard.previous).toEqual(dashboard.summary)
    expect(dashboard.trend).toHaveLength(30)
    expect(
      dashboard.trend.every(
        (day) => day.orderValue === 0 && day.orderCount === 0 && day.incomingMessages === 0,
      ),
    ).toBe(true)
    expect(dashboard.orders).toEqual([])
    expect(dashboard.channels).toEqual([])
    expect(dashboard.topProducts).toEqual([])
    expect(dashboard.attention).toEqual([])
    expect(dashboard.activity).toEqual([])
    expect(dashboard.agents).toEqual([{ id: 'unassigned', name: '', open: 0, unread: 0 }])
  })
})

describe('dashboard message and product aggregation', () => {
  it('counts incoming messages only, distinct contacted customers and distinct conversations per channel', () => {
    const source = inbox()
    source.conversations = [
      conversation('one', {
        messages: [
          message('1'),
          message('2'),
          message('note', 'note'),
          message('reply', 'outgoing'),
          message('previous', 'incoming', at(7)),
          message('invalid', 'incoming', 'bad'),
          message('future', 'incoming', at(18)),
        ],
      }),
      conversation('two', { messages: [message('3')], channel: 'messenger' }),
      conversation('three', {
        customerId: 'customer-b',
        messages: [message('4'), message('5')],
        channel: 'shopee',
        status: 'closed',
      }),
      conversation('four', {
        customerId: 'customer-b',
        messages: [message('old', 'incoming', at(5))],
        channel: 'email',
      }),
    ]
    const dashboard = buildDashboard(source, operations(), 7, now)
    expect(dashboard.summary).toMatchObject({ incomingMessages: 5, activeCustomers: 2 })
    expect(dashboard.previous).toMatchObject({ incomingMessages: 2, activeCustomers: 2 })
    expect(dashboard.channels).toEqual([
      { channel: 'shopee', messages: 4, conversations: 2 },
      { channel: 'messenger', messages: 1, conversations: 1 },
    ])
    expect(dashboard.trend.reduce((sum, day) => sum + day.incomingMessages, 0)).toBe(5)
  })

  it('ranks catalog-independent historical line quantities and gross values without order discounts or shipping', () => {
    const data = operations()
    data.orders = [
      order('recent', {
        createdAt: at(16),
        total: 30000,
        subtotal: 100000,
        discount: 90000,
        shippingFee: 20000,
      }),
      order('older', {
        createdAt: at(13),
        items: [
          { productId: 'product-a', sku: 'OLD-A', name: 'Old name', quantity: 3, unitPrice: 40000 },
          { productId: 'product-b', sku: 'SP-B', name: 'Cốc gốm', quantity: 7, unitPrice: 20000 },
        ],
      }),
      order('cancelled', {
        status: 'cancelled',
        items: [
          { productId: 'product-c', sku: 'SP-C', name: 'Excluded', quantity: 999, unitPrice: 1 },
        ],
      }),
      order('returned', { status: 'returned' }),
    ]
    const dashboard = buildDashboard(inbox(), data, 7, now)
    expect(dashboard.topProducts).toEqual([
      { productId: 'product-b', sku: 'SP-B', name: 'Cốc gốm', quantity: 7, value: 140000 },
      { productId: 'product-a', sku: 'SP-A', name: 'Bình gốm', quantity: 5, value: 220000 },
    ])
    expect(dashboard.summary.orderValue).toBe(130000)
  })
})

describe('dashboard current workload and actionable attention', () => {
  it('uses active statuses regardless of selected period and ignores invalid or not-yet-due deadlines', () => {
    const source = inbox()
    source.conversations = [
      conversation('overdue', {
        lastMessageAt: at(1),
        dueAt: at(16),
        unread: 8,
        assigneeId: 'agent-a',
      }),
      conversation('pending', {
        status: 'pending',
        dueAt: now.toISOString(),
        assigneeId: 'agent-b',
      }),
      conversation('invalid', { dueAt: 'bad' }),
      conversation('closed', { status: 'closed', dueAt: at(1), unread: 1 }),
      conversation('resolved', { status: 'resolved', dueAt: at(1), unread: 2 }),
    ]
    const data = operations()
    data.orders = [
      order('old', { createdAt: at(1) }),
      order('packing', { status: 'packing' }),
      order('completed', { status: 'delivered' }),
    ]
    data.tickets = [
      ticket('old', { createdAt: at(1), dueAt: at(16) }),
      ticket('current'),
      ticket('done', { status: 'resolved', dueAt: at(1) }),
      ticket('closed', { status: 'closed', dueAt: at(1) }),
    ]
    data.shipments = [shipment('problem'), shipment('done', { status: 'delivered' })]
    data.products = [
      { id: 'high', sku: 'H', name: 'High', price: 1, stock: 11 },
      { id: 'ten', sku: 'T', name: 'Ten', price: 1, stock: 10 },
      { id: 'zero', sku: 'Z', name: 'Zero', price: 1, stock: 0 },
      { id: 'a', sku: 'A', name: 'A', price: 1, stock: 2 },
      { id: 'b', sku: 'B', name: 'B', price: 1, stock: 2 },
    ]
    const dashboard = buildDashboard(source, data, 7, now)
    expect(dashboard.summary.orderCount).toBe(2)
    expect(dashboard.workload).toMatchObject({
      openConversations: 3,
      unreadConversations: 1,
      unassignedConversations: 1,
      overdueConversations: 1,
      ordersToProcess: 2,
      shipmentExceptions: 1,
      openTickets: 2,
      overdueTickets: 1,
    })
    expect(dashboard.workload.lowStockProducts.map((product) => product.id)).toEqual([
      'zero',
      'a',
      'b',
      'ten',
    ])
    expect(dashboard.agents).toEqual([
      { id: 'agent-a', name: 'Agent A', open: 1, unread: 1 },
      { id: 'agent-b', name: 'Agent B', open: 1, unread: 0 },
      { id: 'unassigned', name: '', open: 1, unread: 0 },
    ])
    expect(buildDashboard(source, data, 90, now).workload).toEqual(dashboard.workload)
  })

  it('prioritizes overdue, shipment exceptions, urgent and unread cases once each with encoded record links', () => {
    const source = inbox()
    source.conversations = [
      conversation('one /?', { dueAt: at(16), priority: 'urgent', unread: 5 }),
      conversation('urgent', { priority: 'urgent' }),
      conversation('unread', { unread: 5 }),
      conversation('ignored', { status: 'closed', priority: 'urgent', unread: 5 }),
    ]
    const data = operations()
    data.orders = [order('order-a')]
    data.tickets = [
      ticket('ticket ?', { dueAt: at(15), priority: 'urgent' }),
      ticket('urgent-ticket', { priority: 'urgent' }),
      ticket('ignored', { status: 'resolved', priority: 'urgent' }),
    ]
    data.shipments = [shipment('ship /?')]
    const dashboard = buildDashboard(source, data, 7, now)
    expect(dashboard.attention.map((entry) => [entry.id, entry.reason])).toEqual([
      ['ticket:ticket ?', 'overdue'],
      ['conversation:one /?', 'overdue'],
      ['shipment:ship /?', 'exception'],
      ['conversation:urgent', 'urgent'],
      ['ticket:urgent-ticket', 'urgent'],
      ['conversation:unread', 'unread'],
    ])
    expect(dashboard.attention[0]).toMatchObject({
      customerName: 'Trần Bình',
      href: '/care?id=ticket%20%3F',
      at: at(15),
    })
    expect(dashboard.attention[1]).toMatchObject({
      customerName: 'Nguyễn Mai',
      href: '/inbox?conversation=one%20%2F%3F',
    })
    expect(dashboard.attention[2]).toMatchObject({
      customerName: 'Nguyễn Mai',
      href: '/logistics?id=ship%20%2F%3F',
    })
    source.conversations.push(
      ...Array.from({ length: 15 }, (_, index) => conversation(`extra-${index}`, { unread: 1 })),
    )
    expect(buildDashboard(source, data, 7, now).attention).toHaveLength(8)
  })

  it('sorts recent activity by timestamp, excludes future/invalid events and keeps at most eight', () => {
    const data = operations()
    data.auditEvents = Array.from({ length: 12 }, (_, index) => ({
      id: `event-${index}`,
      entity: 'order',
      entityId: 'order-a',
      action: 'created',
      description: 'Đã tạo đơn',
      actorId: 'agent-a',
      createdAt: at(index + 1),
    }))
    data.auditEvents.push(
      { ...data.auditEvents[0], id: 'invalid', createdAt: 'invalid' },
      { ...data.auditEvents[0], id: 'future', createdAt: at(18) },
    )
    expect(buildDashboard(inbox(), data, 7, now).activity.map((entry) => entry.id)).toEqual([
      'event-11',
      'event-10',
      'event-9',
      'event-8',
      'event-7',
      'event-6',
      'event-5',
      'event-4',
    ])
  })

  it('does not sort or mutate any source collection while calculating dashboard data', () => {
    const source = inbox()
    source.conversations = [
      conversation('b', { unread: 1 }),
      conversation('a', { priority: 'urgent' }),
    ]
    const data = operations()
    data.orders = [order('b', { createdAt: at(13) }), order('a', { createdAt: at(16) })]
    data.products = [
      { id: 'b', sku: 'B', name: 'B', stock: 9, price: 1 },
      { id: 'a', sku: 'A', name: 'A', stock: 0, price: 1 },
    ]
    const before = JSON.stringify({ source, data })
    const clock = now.getTime()
    buildDashboard(source, data, 7, now)
    expect(JSON.stringify({ source, data })).toBe(before)
    expect(now.getTime()).toBe(clock)
  })

  it('rejects unsupported periods and invalid clocks instead of returning misleading windows', () => {
    expect(() => buildDashboard(inbox(), operations(), 7, new Date('bad'))).toThrow(
      'valid dashboard date',
    )
    expect(() => buildDashboard(inbox(), operations(), 5 as 7, now)).toThrow('7, 30, or 90')
  })
})
