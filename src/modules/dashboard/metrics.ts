import type { Channel, Conversation, InboxData } from '../../types/inbox'
import type { AuditEvent, OperationsData, Order, OrderStatus, Product } from '../operations/types'

export type DashboardPeriod = 7 | 30 | 90

export interface DashboardSummary {
  orderCount: number
  orderValue: number
  deliveredValue: number
  incomingMessages: number
  activeCustomers: number
}

export interface DashboardAttention {
  id: string
  kind: 'conversation' | 'ticket' | 'shipment'
  title: string
  customerName: string
  reason: 'overdue' | 'urgent' | 'unread' | 'exception'
  at: string
  href: string
}

export interface DashboardData {
  summary: DashboardSummary
  previous: DashboardSummary
  period: { start: string; end: string; previousStart: string; previousEnd: string }
  trend: { date: string; orderValue: number; orderCount: number; incomingMessages: number }[]
  orders: Order[]
  channels: { channel: Channel; messages: number; conversations: number }[]
  topProducts: { productId: string; sku: string; name: string; quantity: number; value: number }[]
  orderStatuses: { status: OrderStatus; count: number }[]
  workload: {
    openConversations: number
    unreadConversations: number
    unassignedConversations: number
    overdueConversations: number
    ordersToProcess: number
    shipmentExceptions: number
    openTickets: number
    overdueTickets: number
    lowStockProducts: Product[]
  }
  attention: DashboardAttention[]
  agents: { id: string; name: string; open: number; unread: number }[]
  activity: AuditEvent[]
}

const orderStatusOrder: OrderStatus[] = [
  'draft',
  'confirmed',
  'packing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
]
const reasonRank: Record<DashboardAttention['reason'], number> = {
  overdue: 0,
  exception: 1,
  urgent: 2,
  unread: 3,
}

function timestamp(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateOffset(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function validOrder(order: Order) {
  return order.status !== 'cancelled' && order.status !== 'returned'
}

function activeConversation(conversation: Conversation) {
  return conversation.status === 'open' || conversation.status === 'pending'
}

function emptySummary(): DashboardSummary {
  return {
    orderCount: 0,
    orderValue: 0,
    deliveredValue: 0,
    incomingMessages: 0,
    activeCustomers: 0,
  }
}

/**
 * Orders are attributed to their creation date, including delivered-order value.
 * These snapshot totals are not payment events, revenue recognition, or net profit.
 * Workload/attention reflect the entire current snapshot, independent of the period.
 */
export function buildDashboard(
  inbox: InboxData,
  data: OperationsData,
  days: DashboardPeriod,
  now = new Date(),
): DashboardData {
  const currentTime = now.getTime()
  if (!Number.isFinite(currentTime)) throw new Error('A valid dashboard date is required.')
  if (![7, 30, 90].includes(days)) throw new Error('Dashboard period must be 7, 30, or 90 days.')

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = dateOffset(today, 1 - days)
  const previousStart = dateOffset(start, -days)
  const previousEnd = dateOffset(start, -1)
  const inCurrent = (value: string) => {
    const time = timestamp(value)
    return time !== null && time >= start.getTime() && time <= currentTime
  }
  const inPrevious = (value: string) => {
    const time = timestamp(value)
    return time !== null && time >= previousStart.getTime() && time < start.getTime()
  }
  const isOverdue = (value: string) => {
    const time = timestamp(value)
    return time !== null && time < currentTime
  }
  const currentOrders = data.orders.filter((order) => inCurrent(order.createdAt))
  const previousOrders = data.orders.filter((order) => inPrevious(order.createdAt))
  const summary = emptySummary()
  const previous = emptySummary()
  const summarizeOrders = (orders: Order[], target: DashboardSummary) => {
    target.orderCount = orders.length
    for (const order of orders) {
      if (validOrder(order)) target.orderValue += order.total
      if (order.status === 'delivered' && order.paymentStatus !== 'refunded') {
        target.deliveredValue += order.total
      }
    }
  }
  summarizeOrders(currentOrders, summary)
  summarizeOrders(previousOrders, previous)

  const trend = Array.from({ length: days }, (_, index) => ({
    date: localDate(dateOffset(start, index)),
    orderValue: 0,
    orderCount: 0,
    incomingMessages: 0,
  }))
  const dayStats = new Map(trend.map((day) => [day.date, day]))
  for (const order of currentOrders) {
    const day = dayStats.get(localDate(new Date(order.createdAt)))!
    day.orderCount += 1
    if (validOrder(order)) day.orderValue += order.total
  }

  const customers = new Map(inbox.customers.map((customer) => [customer.id, customer.name]))
  const activeCustomers = new Set<string>()
  const previousCustomers = new Set<string>()
  const channels = new Map<Channel, { messages: number; conversations: Set<string> }>()
  for (const conversation of inbox.conversations) {
    for (const message of conversation.messages) {
      if (message.type !== 'incoming') continue
      if (inCurrent(message.sentAt)) {
        summary.incomingMessages += 1
        activeCustomers.add(conversation.customerId)
        dayStats.get(localDate(new Date(message.sentAt)))!.incomingMessages += 1
        const channel = channels.get(conversation.channel) ?? {
          messages: 0,
          conversations: new Set<string>(),
        }
        channel.messages += 1
        channel.conversations.add(conversation.id)
        channels.set(conversation.channel, channel)
      } else if (inPrevious(message.sentAt)) {
        previous.incomingMessages += 1
        previousCustomers.add(conversation.customerId)
      }
    }
  }
  summary.activeCustomers = activeCustomers.size
  previous.activeCustomers = previousCustomers.size

  const products = new Map<string, DashboardData['topProducts'][number]>()
  // Use chronological order snapshots for deterministic historical names/SKUs.
  const orderedCurrent = [...currentOrders].sort(
    (a, b) => timestamp(b.createdAt)! - timestamp(a.createdAt)! || a.id.localeCompare(b.id),
  )
  for (const order of orderedCurrent) {
    if (!validOrder(order)) continue
    for (const item of order.items) {
      const product = products.get(item.productId) ?? {
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        quantity: 0,
        value: 0,
      }
      product.quantity += item.quantity
      product.value += item.quantity * item.unitPrice
      products.set(item.productId, product)
    }
  }

  const openConversations = inbox.conversations.filter(activeConversation)
  const openTickets = data.tickets.filter(
    (ticket) => ticket.status !== 'resolved' && ticket.status !== 'closed',
  )
  const attention: DashboardAttention[] = []
  for (const conversation of openConversations) {
    const reason = isOverdue(conversation.dueAt)
      ? 'overdue'
      : conversation.priority === 'urgent'
        ? 'urgent'
        : conversation.unread > 0
          ? 'unread'
          : null
    if (!reason) continue
    attention.push({
      id: `conversation:${conversation.id}`,
      kind: 'conversation',
      title: conversation.subject,
      customerName: customers.get(conversation.customerId) ?? conversation.customerId,
      reason,
      at: reason === 'overdue' ? conversation.dueAt : conversation.lastMessageAt,
      href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`,
    })
  }
  for (const ticket of openTickets) {
    const reason = isOverdue(ticket.dueAt)
      ? 'overdue'
      : ticket.priority === 'urgent'
        ? 'urgent'
        : null
    if (!reason) continue
    attention.push({
      id: `ticket:${ticket.id}`,
      kind: 'ticket',
      title: `${ticket.number} · ${ticket.subject}`,
      customerName: customers.get(ticket.customerId) ?? ticket.customerId,
      reason,
      at: reason === 'overdue' ? ticket.dueAt : ticket.updatedAt,
      href: `/care?id=${encodeURIComponent(ticket.id)}`,
    })
  }
  const ordersById = new Map(data.orders.map((order) => [order.id, order]))
  for (const shipment of data.shipments) {
    if (shipment.status !== 'exception') continue
    const order = ordersById.get(shipment.orderId)
    attention.push({
      id: `shipment:${shipment.id}`,
      kind: 'shipment',
      title: shipment.trackingNumber,
      customerName: order ? (customers.get(order.customerId) ?? order.recipientName) : '',
      reason: 'exception',
      at: shipment.updatedAt,
      href: `/logistics?id=${encodeURIComponent(shipment.id)}`,
    })
  }
  attention.sort(
    (a, b) =>
      reasonRank[a.reason] - reasonRank[b.reason] ||
      (timestamp(a.at) ?? Infinity) - (timestamp(b.at) ?? Infinity) ||
      a.id.localeCompare(b.id),
  )

  const agentNames = new Map(inbox.agents.map((agent) => [agent.id, agent.name]))
  const agents = new Map<string, DashboardData['agents'][number]>()
  agents.set('unassigned', { id: 'unassigned', name: '', open: 0, unread: 0 })
  for (const conversation of openConversations) {
    const id = conversation.assigneeId ?? 'unassigned'
    const agent = agents.get(id) ?? { id, name: agentNames.get(id) ?? id, open: 0, unread: 0 }
    agent.open += 1
    if (conversation.unread > 0) agent.unread += 1
    agents.set(id, agent)
  }

  return {
    summary,
    previous,
    period: {
      start: localDate(start),
      end: localDate(today),
      previousStart: localDate(previousStart),
      previousEnd: localDate(previousEnd),
    },
    trend,
    orders: orderedCurrent.slice(0, 6),
    channels: [...channels]
      .map(([channel, stats]) => ({
        channel,
        messages: stats.messages,
        conversations: stats.conversations.size,
      }))
      .sort((a, b) => b.messages - a.messages || a.channel.localeCompare(b.channel)),
    topProducts: [...products.values()]
      .sort(
        (a, b) =>
          b.quantity - a.quantity || b.value - a.value || a.productId.localeCompare(b.productId),
      )
      .slice(0, 5),
    orderStatuses: orderStatusOrder.map((status) => ({
      status,
      count: currentOrders.filter((order) => order.status === status).length,
    })),
    workload: {
      openConversations: openConversations.length,
      unreadConversations: openConversations.filter((conversation) => conversation.unread > 0)
        .length,
      unassignedConversations: openConversations.filter(
        (conversation) => conversation.assigneeId === null,
      ).length,
      overdueConversations: openConversations.filter((conversation) =>
        isOverdue(conversation.dueAt),
      ).length,
      ordersToProcess: data.orders.filter((order) =>
        ['draft', 'confirmed', 'packing'].includes(order.status),
      ).length,
      shipmentExceptions: data.shipments.filter((shipment) => shipment.status === 'exception')
        .length,
      openTickets: openTickets.length,
      overdueTickets: openTickets.filter((ticket) => isOverdue(ticket.dueAt)).length,
      lowStockProducts: data.products
        .filter((product) => product.stock <= 10)
        .sort(
          (a, b) => a.stock - b.stock || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        ),
    },
    attention: attention.slice(0, 8),
    agents: [...agents.values()].sort((a, b) => b.open - a.open || a.id.localeCompare(b.id)),
    activity: data.auditEvents
      .filter((event) => {
        const time = timestamp(event.createdAt)
        return time !== null && time <= currentTime
      })
      .sort((a, b) => timestamp(b.createdAt)! - timestamp(a.createdAt)! || a.id.localeCompare(b.id))
      .slice(0, 8),
  }
}
