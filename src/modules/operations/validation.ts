import type { InboxData } from '../../types/inbox'
import type { OperationsData } from './types'
import { reject } from './errors'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown, min = 0, max = 10000): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const money = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const oneOf = (value: unknown, values: string[]) =>
  typeof value === 'string' && values.includes(value)
const list = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord)
const idsUnique = (values: { id: unknown }[]) =>
  new Set(values.map((value) => value.id)).size === values.length
const imageUrl = (value: unknown) => {
  if (
    !str(value, 1, 2048) ||
    /[\s\\]/.test(value) ||
    [...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    /%(?![a-f\d]{2})/i.test(value)
  )
    return false
  const rootRelative = value.startsWith('/') && !value.startsWith('//')
  if (!rootRelative && !/^https?:\/\/[^/]/i.test(value)) return false
  try {
    const url = new URL(value, 'https://catalog.invalid')
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!rootRelative || url.origin === 'https://catalog.invalid')
    )
  } catch {
    return false
  }
}
const priorities = ['low', 'normal', 'high', 'urgent']
const orderStates = [
  'draft',
  'confirmed',
  'packing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
]
const shipmentStates = ['ready', 'in_transit', 'delivered', 'exception', 'returned', 'cancelled']
const ticketStates = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
const sources = [
  'shopee',
  'lazada',
  'tiktok',
  'zalo',
  'whatsapp',
  'instagram',
  'messenger',
  'telegram',
  'livechat',
  'email',
  'referral',
  'manual',
]

export function assertOperationsData(
  value: unknown,
  inbox: InboxData,
): asserts value is OperationsData {
  const invalid = () =>
    reject(
      'Dữ liệu vận hành không hợp lệ hoặc sai phiên bản. Hãy khôi phục dữ liệu Demo hoặc kiểm tra API.',
      'Operations data is invalid or uses an unsupported version. Restore Demo data or check the API.',
    )
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !list(value.customerProfiles) ||
    !list(value.products) ||
    !list(value.orders) ||
    !list(value.shipments) ||
    !list(value.tickets) ||
    !list(value.auditEvents)
  )
    invalid()
  // Structural guards below deliberately validate runtime data before the typed assertion.
  const data = value as unknown as OperationsData
  const customerIds = new Set(inbox.customers.map((item) => item.id))
  const agentIds = new Set(inbox.agents.map((item) => item.id))
  const validAgent = (id: unknown) => id === null || (typeof id === 'string' && agentIds.has(id))
  if (
    !idsUnique(data.products) ||
    !idsUnique(data.orders) ||
    !idsUnique(data.shipments) ||
    !idsUnique(data.tickets) ||
    !idsUnique(data.auditEvents) ||
    new Set(data.customerProfiles.map((item) => item.customerId)).size !==
      data.customerProfiles.length
  )
    invalid()
  for (const profile of data.customerProfiles) {
    if (
      !str(profile.customerId, 1) ||
      !customerIds.has(profile.customerId) ||
      !oneOf(profile.status, ['lead', 'active', 'inactive']) ||
      !validAgent(profile.ownerId) ||
      !oneOf(profile.source, sources) ||
      !Array.isArray(profile.tags) ||
      profile.tags.length > 10 ||
      profile.tags.some((tag) => !str(tag, 1, 40)) ||
      new Set(profile.tags.map((tag) => tag.toLowerCase())).size !== profile.tags.length ||
      !date(profile.createdAt) ||
      !date(profile.updatedAt) ||
      !list(profile.notes) ||
      !idsUnique(profile.notes)
    )
      invalid()
    for (const note of profile.notes)
      if (
        !str(note.id, 1) ||
        !str(note.text, 1, 5000) ||
        !date(note.createdAt) ||
        !agentIds.has(note.authorId)
      )
        invalid()
  }
  for (const product of data.products)
    if (
      !str(product.id, 1) ||
      !str(product.sku, 1, 50) ||
      !str(product.name, 1, 200) ||
      !money(product.price) ||
      !money(product.stock) ||
      (product.active !== undefined && typeof product.active !== 'boolean') ||
      (product.imageUrl !== undefined && !imageUrl(product.imageUrl)) ||
      (product.description !== undefined && !str(product.description, 0, 2000)) ||
      (product.unit !== undefined && !str(product.unit, 1, 40)) ||
      (product.category !== undefined && !str(product.category, 1, 100))
    )
      invalid()
  const productIds = new Set(data.products.map((product) => product.id))
  if (
    new Set(data.products.map((product) => product.sku)).size !== data.products.length ||
    new Set(data.orders.map((order) => order.number)).size !== data.orders.length ||
    new Set(data.shipments.map((shipment) => shipment.trackingNumber)).size !==
      data.shipments.length ||
    new Set(data.tickets.map((ticket) => ticket.number)).size !== data.tickets.length
  )
    invalid()
  for (const order of data.orders) {
    if (
      !str(order.id, 1) ||
      !str(order.number, 1, 50) ||
      !customerIds.has(order.customerId) ||
      !oneOf(order.status, orderStates) ||
      !oneOf(order.paymentStatus, ['unpaid', 'paid', 'refunded']) ||
      !oneOf(order.paymentMethod, ['cod', 'bank_transfer']) ||
      !list(order.items) ||
      order.items.length === 0 ||
      order.items.length > 50 ||
      !money(order.subtotal) ||
      !money(order.discount) ||
      order.discount > order.subtotal ||
      !money(order.shippingFee) ||
      !money(order.total) ||
      order.total !== order.subtotal - order.discount + order.shippingFee ||
      !str(order.recipientName, 2, 200) ||
      !str(order.recipientPhone, 8, 24) ||
      !/^\+?[\d\s().-]{8,24}$/.test(order.recipientPhone) ||
      order.recipientPhone.replace(/\D/g, '').length < 8 ||
      !str(order.shippingAddress, 5, 500) ||
      !str(order.note, 0, 5000) ||
      !date(order.createdAt) ||
      !date(order.updatedAt)
    )
      invalid()
    if (
      order.conversationId !== undefined &&
      !inbox.conversations.some(
        (conversation) =>
          conversation.id === order.conversationId && conversation.customerId === order.customerId,
      )
    )
      invalid()
    if (order.clientRequestId !== undefined && !str(order.clientRequestId, 1, 100)) invalid()
    if (order.clientRequestHash !== undefined && !/^[a-f0-9]{64}$/.test(order.clientRequestHash))
      invalid()
    if (order.paymentStatus === 'paid' && order.status === 'draft') invalid()
    for (const line of order.items)
      if (
        !productIds.has(line.productId) ||
        !str(line.sku, 1, 50) ||
        !str(line.name, 1, 200) ||
        !money(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 999 ||
        !money(line.unitPrice)
      )
        invalid()
    if (
      new Set(order.items.map((line) => line.productId)).size !== order.items.length ||
      order.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) !==
        order.subtotal ||
      !Number.isSafeInteger(order.subtotal)
    )
      invalid()
    if (order.paymentStatus === 'refunded' && !['cancelled', 'returned'].includes(order.status))
      invalid()
  }
  const nonCancelledOrders = new Set<string>()
  for (const shipment of data.shipments) {
    const order = data.orders.find((item) => item.id === shipment.orderId) ?? invalid()
    if (
      !order ||
      !str(shipment.id, 1) ||
      !str(shipment.trackingNumber, 1, 80) ||
      !oneOf(shipment.carrierId, ['manual', 'demo-express', 'demo-economy']) ||
      !oneOf(shipment.status, shipmentStates) ||
      !money(shipment.shippingFee) ||
      shipment.shippingFee !== order.shippingFee ||
      !money(shipment.codAmount) ||
      shipment.codAmount > order.total ||
      !date(shipment.estimatedDeliveryAt) ||
      !date(shipment.createdAt) ||
      !date(shipment.updatedAt) ||
      !list(shipment.events) ||
      shipment.events.length === 0 ||
      !idsUnique(shipment.events)
    )
      invalid()
    for (const event of shipment.events)
      if (
        !str(event.id, 1) ||
        !oneOf(event.status, shipmentStates) ||
        !str(event.description, 1, 2000) ||
        !date(event.createdAt)
      )
        invalid()
    if (shipment.events.at(-1)?.status !== shipment.status) invalid()
    if (order.paymentMethod !== 'cod' && shipment.codAmount !== 0) invalid()
    if (
      order.paymentStatus === 'paid' &&
      ['ready', 'in_transit', 'exception'].includes(shipment.status) &&
      shipment.codAmount !== 0
    )
      invalid()
    if (shipment.status !== 'cancelled') {
      if (nonCancelledOrders.has(shipment.orderId)) invalid()
      nonCancelledOrders.add(shipment.orderId)
    }
    if (
      (shipment.status === 'ready' && order.status !== 'packing') ||
      (['in_transit', 'exception'].includes(shipment.status) && order.status !== 'shipped') ||
      (shipment.status === 'delivered' && order.status !== 'delivered') ||
      (shipment.status === 'returned' && order.status !== 'returned')
    )
      invalid()
  }
  for (const ticket of data.tickets) {
    const order =
      ticket.orderId === null ? null : data.orders.find((item) => item.id === ticket.orderId)
    const conversation =
      ticket.conversationId === null
        ? null
        : inbox.conversations.find((item) => item.id === ticket.conversationId)
    if (
      !str(ticket.id, 1) ||
      !str(ticket.number, 1, 50) ||
      !customerIds.has(ticket.customerId) ||
      (ticket.orderId !== null && (!order || order.customerId !== ticket.customerId)) ||
      (ticket.conversationId !== null &&
        (!conversation || conversation.customerId !== ticket.customerId)) ||
      !str(ticket.subject, 3, 200) ||
      !str(ticket.description, 3, 5000) ||
      !oneOf(ticket.category, ['delivery', 'return', 'payment', 'product', 'other']) ||
      !oneOf(ticket.status, ticketStates) ||
      !oneOf(ticket.priority, priorities) ||
      !validAgent(ticket.assigneeId) ||
      !date(ticket.dueAt) ||
      !str(ticket.resolution, 0, 5000) ||
      !date(ticket.createdAt) ||
      !date(ticket.updatedAt) ||
      (ticket.resolvedAt !== null && !date(ticket.resolvedAt)) ||
      !list(ticket.comments) ||
      !idsUnique(ticket.comments)
    )
      invalid()
    const done = ['resolved', 'closed'].includes(ticket.status)
    if (
      (done && (!str(ticket.resolution, 3, 5000) || ticket.resolvedAt === null)) ||
      (!done && ticket.resolvedAt !== null)
    )
      invalid()
    for (const comment of ticket.comments)
      if (
        !str(comment.id, 1) ||
        !str(comment.text, 1, 5000) ||
        !date(comment.createdAt) ||
        !agentIds.has(comment.authorId)
      )
        invalid()
  }
  for (const event of data.auditEvents) {
    const entity =
      event.entity === 'customer'
        ? inbox.customers
        : event.entity === 'order'
          ? data.orders
          : event.entity === 'shipment'
            ? data.shipments
            : event.entity === 'ticket'
              ? data.tickets
              : []
    if (
      !str(event.id, 1) ||
      !entity.some((item) => item.id === event.entityId) ||
      !str(event.action, 1, 100) ||
      !str(event.description, 1, 2000) ||
      !date(event.createdAt) ||
      !agentIds.has(event.actorId)
    )
      invalid()
  }
}

export function cleanText(value: unknown, min: number, max: number, field: string) {
  if (!str(value, min, max))
    reject(
      `${field} không hợp lệ (từ ${min} đến ${max} ký tự).`,
      `${field} is invalid (use ${min}–${max} characters).`,
    )
  return (value as string).trim()
}
export function nonNegativeInteger(value: unknown, field: string) {
  if (!money(value))
    reject(`${field} phải là số nguyên không âm.`, `${field} must be a non-negative integer.`)
  return value as number
}
export function assertKeys(value: unknown, keys: string[]) {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key)))
    reject('Yêu cầu chứa trường không được hỗ trợ.', 'The request contains unsupported fields.')
}
