import type { OrderStatus, ShipmentStatus, TicketStatus } from './types'

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing: ['cancelled'],
  shipped: [],
  delivered: [],
  cancelled: [],
  returned: [],
}
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  ready: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'exception', 'returned'],
  exception: ['in_transit', 'returned'],
  delivered: [],
  returned: [],
  cancelled: [],
}
export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'waiting', 'resolved'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: ['open'],
}
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
export const money = (value: number, locale: 'vi' | 'en') =>
  new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
export const dateTime = (value: string, locale: 'vi' | 'en') =>
  new Date(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
