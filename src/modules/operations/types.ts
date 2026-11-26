import type { Channel, InboxData, Priority } from '../../types/inbox'

export type CustomerLifecycle = 'lead' | 'active' | 'inactive'
export interface CustomerNote {
  id: string
  text: string
  createdAt: string
  authorId: string
}
export interface CustomerProfile {
  customerId: string
  status: CustomerLifecycle
  ownerId: string | null
  source: Channel | 'referral' | 'manual'
  tags: string[]
  notes: CustomerNote[]
  createdAt: string
  updatedAt: string
}
export interface Product {
  id: string
  sku: string
  name: string
  price: number
  stock: number
  active?: boolean
  imageUrl?: string
  description?: string
  unit?: string
  category?: string
}
export type OrderStatus =
  'draft' | 'confirmed' | 'packing' | 'shipped' | 'delivered' | 'cancelled' | 'returned'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type PaymentMethod = 'cod' | 'bank_transfer'
export interface OrderLine {
  productId: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
}
export interface Order {
  id: string
  number: string
  customerId: string
  conversationId?: string
  clientRequestId?: string
  clientRequestHash?: string
  items: OrderLine[]
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  subtotal: number
  discount: number
  shippingFee: number
  total: number
  shippingAddress: string
  recipientName: string
  recipientPhone: string
  note: string
  createdAt: string
  updatedAt: string
}
export interface CreateOrderInput {
  customerId: string
  warehouseId?: string
  conversationId?: string
  clientRequestId?: string
  items: { productId: string; quantity: number }[]
  discount: number
  shippingFee: number
  paymentMethod: PaymentMethod
  shippingAddress: string
  recipientName: string
  recipientPhone: string
  note: string
}
export type ShipmentStatus =
  'ready' | 'in_transit' | 'delivered' | 'exception' | 'returned' | 'cancelled'
export type CarrierId = 'manual' | 'demo-express' | 'demo-economy'
export interface TrackingEvent {
  id: string
  status: ShipmentStatus
  description: string
  createdAt: string
}
export interface Shipment {
  id: string
  trackingNumber: string
  orderId: string
  carrierId: CarrierId
  status: ShipmentStatus
  shippingFee: number
  codAmount: number
  estimatedDeliveryAt: string
  events: TrackingEvent[]
  createdAt: string
  updatedAt: string
}
export interface CreateShipmentInput {
  orderId: string
  carrierId: CarrierId
}
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
export type TicketCategory = 'delivery' | 'return' | 'payment' | 'product' | 'other'
export interface TicketComment {
  id: string
  text: string
  authorId: string
  createdAt: string
}
export interface Ticket {
  id: string
  number: string
  customerId: string
  orderId: string | null
  conversationId: string | null
  subject: string
  description: string
  category: TicketCategory
  status: TicketStatus
  priority: Priority
  assigneeId: string | null
  dueAt: string
  resolution: string
  comments: TicketComment[]
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}
export interface CreateTicketInput {
  customerId: string
  orderId: string | null
  conversationId: string | null
  subject: string
  description: string
  category: TicketCategory
  priority: Priority
  assigneeId: string | null
}
export type TicketPatch = Partial<
  Pick<Ticket, 'status' | 'priority' | 'assigneeId' | 'resolution' | 'dueAt'>
>
export interface AuditEvent {
  id: string
  entity: 'customer' | 'order' | 'shipment' | 'ticket'
  entityId: string
  action: string
  description: string
  createdAt: string
  actorId: string
}
export interface OperationsData {
  schemaVersion: 1
  customerProfiles: CustomerProfile[]
  products: Product[]
  orders: Order[]
  shipments: Shipment[]
  tickets: Ticket[]
  auditEvents: AuditEvent[]
}
export interface OperationsService {
  load(): Promise<OperationsData>
  updateCustomerProfile(
    customerId: string,
    patch: Partial<Pick<CustomerProfile, 'status' | 'ownerId' | 'source' | 'tags'>>,
  ): Promise<OperationsData>
  addCustomerNote(customerId: string, text: string): Promise<OperationsData>
  createOrder(input: CreateOrderInput): Promise<OperationsData>
  changeOrderStatus(orderId: string, status: OrderStatus): Promise<OperationsData>
  changePaymentStatus(orderId: string, status: PaymentStatus): Promise<OperationsData>
  createShipment(input: CreateShipmentInput): Promise<OperationsData>
  advanceShipment(
    shipmentId: string,
    status: ShipmentStatus,
    description?: string,
  ): Promise<OperationsData>
  createTicket(input: CreateTicketInput): Promise<OperationsData>
  updateTicket(ticketId: string, patch: TicketPatch): Promise<OperationsData>
  addTicketComment(ticketId: string, text: string): Promise<OperationsData>
  reset(): Promise<OperationsData>
}
export interface OperationsSnapshot {
  inbox: InboxData
  operations: OperationsData
}
