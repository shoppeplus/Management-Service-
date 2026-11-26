import { APP_MODE, inboxService as defaultInboxService } from '../../services/inboxService'
import { notifyAuthenticationExpired } from '../../services/authSession'
import type { InboxData, InboxService } from '../../types/inbox'
import { CURRENT_AGENT_ID } from '../../lib/inbox'
import { createOperationsDemoData, demoProductMetadata } from './data'
import { getCarrier, trackingDescription } from './carriers'
import { ORDER_TRANSITIONS, SHIPMENT_TRANSITIONS, TICKET_TRANSITIONS } from './domain'
import { assertKeys, assertOperationsData, cleanText, nonNegativeInteger } from './validation'
import { reject } from './errors'
import type {
  AuditEvent,
  CustomerProfile,
  OperationsData,
  OperationsService,
  Order,
  ShipmentStatus,
  Ticket,
} from './types'
export { OperationsError, operationsErrorMessage } from './errors'

export const OPERATIONS_STORAGE_KEY = 'smartsales.operations.demo.v1'
type OperationsStorage = Pick<Storage, 'getItem' | 'setItem'>
const clone = <T>(value: T): T => structuredClone(value)
const orderRequestHash = async (input: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
const slaHours = { urgent: 2, high: 4, normal: 24, low: 48 }

export function createDemoOperationsService(
  options: { storage?: OperationsStorage; inboxService?: InboxService; now?: () => Date } = {},
): OperationsService {
  const inbox = options.inboxService ?? defaultInboxService
  const now = options.now ?? (() => new Date())
  let memory: OperationsData | undefined
  let queue = Promise.resolve()
  const stamp = () => now().toISOString()
  const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
  const actor = (references: InboxData) =>
    references.agents.find((agent) => agent.id === CURRENT_AGENT_ID)?.id ??
    references.agents[0]?.id ??
    reject(
      'Chưa có nhân viên thực hiện thao tác.',
      'No teammate is available to perform this action.',
    )
  const read = (references: InboxData) => {
    let stored: string | null = null
    try {
      stored = options.storage?.getItem(OPERATIONS_STORAGE_KEY) ?? null
    } catch {
      reject('Không thể đọc bộ nhớ dữ liệu vận hành.', 'Unable to read operations storage.')
    }
    let data: OperationsData
    if (stored) {
      let parsed: unknown
      try {
        parsed = JSON.parse(stored)
      } catch {
        reject(
          'Dữ liệu vận hành đã lưu bị lỗi. Hãy khôi phục dữ liệu Demo.',
          'Saved operations data is corrupted. Restore Demo data.',
        )
      }
      assertOperationsData(parsed, references)
      data = clone(parsed)
    } else data = clone(memory ?? createOperationsDemoData(references))
    // Existing Demo catalogs gain illustrations without changing stock, prices or custom metadata.
    for (const product of data.products) {
      if (!Object.hasOwn(demoProductMetadata, product.id)) continue
      const metadata = demoProductMetadata[product.id]
      if (!metadata) continue
      product.imageUrl ??= metadata.imageUrl
      product.description ??= metadata.description
      product.unit ??= metadata.unit
      product.category ??= metadata.category
    }
    // Newly created canonical customers are enriched without changing existing CRM profiles.
    for (const customer of references.customers) {
      if (!data.customerProfiles.some((profile) => profile.customerId === customer.id)) {
        data.customerProfiles.push({
          customerId: customer.id,
          status: 'lead',
          ownerId: null,
          source: 'manual',
          tags: [],
          notes: [],
          createdAt: stamp(),
          updatedAt: stamp(),
        })
      }
    }
    assertOperationsData(data, references)
    return data
  }
  const commit = (data: OperationsData) => {
    try {
      options.storage?.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(data))
    } catch {
      reject(
        'Không thể lưu dữ liệu vận hành. Bộ nhớ trình duyệt có thể đã đầy.',
        'Unable to save operations data. Browser storage may be full.',
      )
    }
    memory = clone(data)
  }
  const mutate = (action: (data: OperationsData, references: InboxData) => void) => {
    const work = queue.then(async () => {
      const references = await inbox.load()
      const next = read(references)
      action(next, references)
      assertOperationsData(next, references)
      commit(next)
      return clone(next)
    })
    queue = work.then(
      () => {},
      () => {},
    )
    return work
  }
  const audit = (
    data: OperationsData,
    references: InboxData,
    entity: AuditEvent['entity'],
    entityId: string,
    action: string,
    description: string,
  ) => {
    data.auditEvents.push({
      id: id('audit'),
      entity,
      entityId,
      action,
      description,
      createdAt: stamp(),
      actorId: actor(references),
    })
  }
  const requireOrder = (data: OperationsData, orderId: string) =>
    data.orders.find((order) => order.id === orderId) ??
    reject('Không tìm thấy đơn hàng.', 'Order not found.')
  const requireTicket = (data: OperationsData, ticketId: string) =>
    data.tickets.find((ticket) => ticket.id === ticketId) ??
    reject('Không tìm thấy yêu cầu chăm sóc.', 'Support ticket not found.')
  const requireCustomer = (references: InboxData, customerId: string) =>
    references.customers.find((customer) => customer.id === customerId) ??
    reject('Không tìm thấy khách hàng.', 'Customer not found.')
  const validateAgent = (references: InboxData, agentId: string | null) => {
    if (agentId !== null && !references.agents.some((agent) => agent.id === agentId))
      reject('Nhân viên được chọn không tồn tại.', 'The selected teammate does not exist.')
  }
  const restock = (data: OperationsData, order: Order) => {
    for (const line of order.items)
      data.products.find((product) => product.id === line.productId)!.stock += line.quantity
  }
  const shipmentEvent = (
    data: OperationsData,
    shipmentId: string,
    status: ShipmentStatus,
    description: string,
  ) => {
    const shipment = data.shipments.find((item) => item.id === shipmentId)!
    shipment.status = status
    shipment.updatedAt = stamp()
    shipment.events.push({ id: id('tracking'), status, description, createdAt: stamp() })
  }
  const profileFor = (data: OperationsData, customerId: string) =>
    data.customerProfiles.find((profile) => profile.customerId === customerId) ??
    reject('Không tìm thấy hồ sơ chăm sóc khách hàng.', 'Customer care profile not found.')
  return {
    async load() {
      await queue
      const references = await inbox.load()
      return clone(read(references))
    },
    updateCustomerProfile(customerId, patch) {
      return mutate((data, references) => {
        requireCustomer(references, customerId)
        assertKeys(patch, ['status', 'ownerId', 'source', 'tags'])
        const profile = profileFor(data, customerId)
        const updated: CustomerProfile = { ...profile, ...patch, updatedAt: stamp() }
        validateAgent(references, updated.ownerId)
        if (!['lead', 'active', 'inactive'].includes(updated.status))
          reject('Trạng thái khách hàng không hợp lệ.', 'Invalid customer lifecycle status.')
        if (patch.tags !== undefined) {
          if (!Array.isArray(patch.tags) || patch.tags.length > 10)
            reject('Mỗi hồ sơ có tối đa 10 nhãn.', 'A customer profile can have up to 10 tags.')
          updated.tags = patch.tags.map((tag) => cleanText(tag, 1, 40, 'Nhãn / Tag'))
          if (new Set(updated.tags.map((tag) => tag.toLowerCase())).size !== updated.tags.length)
            reject('Nhãn khách hàng bị trùng.', 'Customer tags must be unique.')
        }
        Object.assign(profile, updated)
        audit(
          data,
          references,
          'customer',
          customerId,
          'customer.profile.updated',
          'Cập nhật phân loại và người phụ trách khách hàng.',
        )
      })
    },
    addCustomerNote(customerId, text) {
      return mutate((data, references) => {
        requireCustomer(references, customerId)
        const profile = profileFor(data, customerId)
        profile.notes.push({
          id: id('customer-note'),
          text: cleanText(text, 1, 5000, 'Ghi chú / Note'),
          createdAt: stamp(),
          authorId: actor(references),
        })
        profile.updatedAt = stamp()
        audit(
          data,
          references,
          'customer',
          customerId,
          'customer.note.created',
          'Thêm ghi chú chăm sóc khách hàng.',
        )
      })
    },
    async createOrder(input) {
      const requestHash = input.clientRequestId ? await orderRequestHash(input) : undefined
      return mutate((data, references) => {
        assertKeys(input, [
          'customerId',
          'items',
          'discount',
          'shippingFee',
          'paymentMethod',
          'shippingAddress',
          'recipientName',
          'recipientPhone',
          'note',
          'conversationId',
          'clientRequestId',
        ])
        requireCustomer(references, input.customerId)
        if (
          input.conversationId !== undefined &&
          !references.conversations.some(
            (conversation) =>
              conversation.id === input.conversationId &&
              conversation.customerId === input.customerId,
          )
        )
          reject(
            'Hội thoại không thuộc khách hàng này.',
            'The conversation does not belong to this customer.',
          )
        if (input.clientRequestId !== undefined) {
          cleanText(input.clientRequestId, 1, 100, 'Mã yêu cầu / Request ID')
          const existing = data.orders.find(
            (order) => order.clientRequestId === input.clientRequestId,
          )
          if (existing) {
            if (existing.clientRequestHash !== requestHash)
              reject(
                'Mã yêu cầu đã được sử dụng cho thông tin đơn hàng khác.',
                'Request ID was already used for a different order.',
              )
            return
          }
        }
        if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50)
          reject('Chọn từ 1 đến 50 sản phẩm cho đơn hàng.', 'Choose 1–50 products for the order.')
        const selected = new Set<string>()
        const items = input.items.map((line) => {
          assertKeys(line, ['productId', 'quantity'])
          if (selected.has(line.productId))
            reject(
              'Sản phẩm bị trùng trong đơn hàng.',
              'Each product may appear only once in an order.',
            )
          selected.add(line.productId)
          const product =
            data.products.find((item) => item.id === line.productId) ??
            reject('Sản phẩm không tồn tại.', 'Product not found.')
          const quantity = nonNegativeInteger(line.quantity, 'Số lượng / Quantity')
          if (quantity < 1 || quantity > 999)
            reject('Số lượng phải từ 1 đến 999.', 'Quantity must be between 1 and 999.')
          return {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            quantity,
            unitPrice: product.price,
          }
        })
        const subtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
        const discount = nonNegativeInteger(input.discount, 'Giảm giá / Discount')
        const shippingFee = nonNegativeInteger(input.shippingFee, 'Phí giao hàng / Shipping fee')
        if (discount > subtotal)
          reject(
            'Giảm giá không được vượt quá tiền hàng.',
            'Discount cannot exceed the merchandise subtotal.',
          )
        if (!['cod', 'bank_transfer'].includes(input.paymentMethod))
          reject('Phương thức thanh toán không hợp lệ.', 'Invalid payment method.')
        const recipientPhone = cleanText(input.recipientPhone, 8, 24, 'Số điện thoại / Phone')
        if (
          !/^\+?[\d\s().-]{8,24}$/.test(recipientPhone) ||
          recipientPhone.replace(/\D/g, '').length < 8
        )
          reject('Số điện thoại người nhận không hợp lệ.', 'Invalid recipient phone number.')
        const number =
          Math.max(
            2047,
            ...data.orders.map((order) => Number(order.number.replace(/^SS-/, '')) || 0),
          ) + 1
        const order: Order = {
          id: id('order'),
          number: `SS-${number}`,
          customerId: input.customerId,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
          ...(requestHash ? { clientRequestHash: requestHash } : {}),
          items,
          status: 'draft',
          paymentStatus: 'unpaid',
          paymentMethod: input.paymentMethod,
          subtotal,
          discount,
          shippingFee,
          total: subtotal - discount + shippingFee,
          recipientName: cleanText(input.recipientName, 2, 200, 'Tên người nhận / Recipient'),
          recipientPhone,
          shippingAddress: cleanText(input.shippingAddress, 5, 500, 'Địa chỉ / Address'),
          note: cleanText(input.note, 0, 5000, 'Ghi chú / Note'),
          createdAt: stamp(),
          updatedAt: stamp(),
        }
        data.orders.push(order)
        audit(data, references, 'order', order.id, 'order.created', `Tạo bản nháp ${order.number}.`)
      })
    },
    changeOrderStatus(orderId, status) {
      return mutate((data, references) => {
        const order = requireOrder(data, orderId)
        if (!ORDER_TRANSITIONS[order.status]?.includes(status))
          reject(
            'Không thể chuyển trạng thái đơn hàng theo thứ tự này.',
            'This order status transition is not allowed.',
          )
        const previous = order.status
        if (status === 'confirmed') {
          for (const line of order.items) {
            const product = data.products.find((item) => item.id === line.productId)!
            if (product.stock < line.quantity)
              reject(
                `Không đủ tồn kho cho ${product.name}.`,
                `Insufficient stock for ${product.name}.`,
              )
          }
          for (const line of order.items)
            data.products.find((product) => product.id === line.productId)!.stock -= line.quantity
        }
        if (status === 'cancelled' && (previous === 'confirmed' || previous === 'packing')) {
          restock(data, order)
          for (const shipment of data.shipments.filter(
            (item) => item.orderId === order.id && item.status === 'ready',
          )) {
            shipmentEvent(data, shipment.id, 'cancelled', 'Hủy vận đơn Demo do đơn hàng bị hủy.')
            audit(
              data,
              references,
              'shipment',
              shipment.id,
              'shipment.cancelled',
              'Hủy vận đơn trước khi lấy hàng do đơn hàng bị hủy.',
            )
          }
        }
        order.status = status
        order.updatedAt = stamp()
        audit(
          data,
          references,
          'order',
          order.id,
          `order.${status}`,
          `${order.number}: ${previous} → ${status}.`,
        )
      })
    },
    changePaymentStatus(orderId, status) {
      return mutate((data, references) => {
        const order = requireOrder(data, orderId)
        if (
          status === 'paid' &&
          order.paymentStatus === 'unpaid' &&
          !['draft', 'cancelled', 'returned'].includes(order.status)
        )
          order.paymentStatus = 'paid'
        else if (
          status === 'refunded' &&
          order.paymentStatus === 'paid' &&
          ['cancelled', 'returned'].includes(order.status)
        )
          order.paymentStatus = 'refunded'
        else
          reject(
            'Thay đổi thanh toán không hợp lệ. Chỉ hoàn tiền đơn đã trả tiền và đã hủy/hoàn hàng.',
            'Invalid payment transition. Refunds require a paid order that is cancelled or returned.',
          )
        if (status === 'paid') {
          for (const shipment of data.shipments.filter(
            (item) =>
              item.orderId === order.id &&
              ['ready', 'in_transit', 'exception'].includes(item.status),
          ))
            shipment.codAmount = 0
        }
        order.updatedAt = stamp()
        audit(
          data,
          references,
          'order',
          order.id,
          `payment.${status}`,
          `${order.number}: ghi nhận trạng thái thanh toán ${status} trong Demo.`,
        )
      })
    },
    createShipment(input) {
      return mutate((data, references) => {
        assertKeys(input, ['orderId', 'carrierId'])
        const order = requireOrder(data, input.orderId)
        if (order.status !== 'packing')
          reject(
            'Chỉ tạo vận đơn cho đơn đang đóng gói.',
            'Shipments can only be created for orders being packed.',
          )
        if (
          data.shipments.some(
            (shipment) => shipment.orderId === order.id && shipment.status !== 'cancelled',
          )
        )
          reject(
            'Đơn hàng đã có vận đơn chưa hủy.',
            'This order already has a shipment that is not cancelled.',
          )
        const carrier =
          getCarrier(input.carrierId) ??
          reject('Đơn vị vận chuyển không hợp lệ.', 'Invalid carrier.')
        const shipmentId = id('shipment')
        data.shipments.push({
          id: shipmentId,
          orderId: order.id,
          trackingNumber: `DEMO-${order.number}-${data.shipments.length + 1}`,
          carrierId: carrier.id,
          status: 'ready',
          shippingFee: order.shippingFee,
          codAmount:
            order.paymentMethod === 'cod' && order.paymentStatus === 'unpaid' ? order.total : 0,
          estimatedDeliveryAt: new Date(
            now().getTime() + carrier.deliveryDays * 86400000,
          ).toISOString(),
          events: [
            {
              id: id('tracking'),
              status: 'ready',
              description: trackingDescription('ready'),
              createdAt: stamp(),
            },
          ],
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        audit(
          data,
          references,
          'shipment',
          shipmentId,
          'shipment.created',
          `Tạo vận đơn mô phỏng cho ${order.number} qua ${carrier.name}.`,
        )
      })
    },
    advanceShipment(shipmentId, status, description) {
      return mutate((data, references) => {
        const shipment =
          data.shipments.find((item) => item.id === shipmentId) ??
          reject('Không tìm thấy vận đơn.', 'Shipment not found.')
        if (!SHIPMENT_TRANSITIONS[shipment.status]?.includes(status))
          reject(
            'Không thể chuyển trạng thái vận đơn theo thứ tự này.',
            'This shipment status transition is not allowed.',
          )
        if (description !== undefined && typeof description !== 'string')
          reject('Diễn giải vận chuyển không hợp lệ.', 'Invalid shipment description.')
        const text =
          description === undefined || description.trim() === ''
            ? ['exception', 'returned'].includes(status)
              ? reject(
                  'Nhập lý do sự cố hoặc hoàn hàng.',
                  'Enter a reason for the delivery exception or return.',
                )
              : trackingDescription(status)
            : cleanText(description, 1, 2000, 'Diễn giải / Description')
        const order = requireOrder(data, shipment.orderId)
        shipmentEvent(data, shipment.id, status, text)
        if (status === 'in_transit') order.status = 'shipped'
        if (status === 'delivered') {
          order.status = 'delivered'
          if (order.paymentMethod === 'cod' && order.paymentStatus === 'unpaid')
            order.paymentStatus = 'paid'
        }
        if (status === 'returned') {
          order.status = 'returned'
          restock(data, order)
        }
        order.updatedAt = stamp()
        audit(
          data,
          references,
          'shipment',
          shipment.id,
          `shipment.${status}`,
          `${shipment.trackingNumber}: ${text}`,
        )
        if (status !== 'cancelled' && status !== 'exception')
          audit(
            data,
            references,
            'order',
            order.id,
            `order.${order.status}`,
            `${order.number}: đồng bộ trạng thái từ vận đơn Demo.`,
          )
      })
    },
    createTicket(input) {
      return mutate((data, references) => {
        assertKeys(input, [
          'customerId',
          'orderId',
          'conversationId',
          'subject',
          'description',
          'category',
          'priority',
          'assigneeId',
        ])
        requireCustomer(references, input.customerId)
        validateAgent(references, input.assigneeId)
        if (!Object.hasOwn(slaHours, input.priority))
          reject('Mức ưu tiên không hợp lệ.', 'Invalid priority.')
        if (!['delivery', 'return', 'payment', 'product', 'other'].includes(input.category))
          reject('Danh mục chăm sóc không hợp lệ.', 'Invalid support category.')
        if (
          input.orderId !== null &&
          requireOrder(data, input.orderId).customerId !== input.customerId
        )
          reject(
            'Đơn hàng không thuộc khách hàng được chọn.',
            'The order does not belong to this customer.',
          )
        if (
          input.conversationId !== null &&
          !references.conversations.some(
            (conversation) =>
              conversation.id === input.conversationId &&
              conversation.customerId === input.customerId,
          )
        )
          reject(
            'Hội thoại không thuộc khách hàng được chọn.',
            'The conversation does not belong to this customer.',
          )
        const number =
          Math.max(
            1000,
            ...data.tickets.map((ticket) => Number(ticket.number.replace(/^CS-/, '')) || 0),
          ) + 1
        const ticket: Ticket = {
          id: id('ticket'),
          number: `CS-${number}`,
          customerId: input.customerId,
          orderId: input.orderId,
          conversationId: input.conversationId,
          subject: cleanText(input.subject, 3, 200, 'Tiêu đề / Subject'),
          description: cleanText(input.description, 3, 5000, 'Mô tả / Description'),
          category: input.category,
          status: 'open',
          priority: input.priority,
          assigneeId: input.assigneeId,
          dueAt: new Date(now().getTime() + slaHours[input.priority] * 3600000).toISOString(),
          resolution: '',
          comments: [],
          createdAt: stamp(),
          updatedAt: stamp(),
          resolvedAt: null,
        }
        data.tickets.push(ticket)
        audit(
          data,
          references,
          'ticket',
          ticket.id,
          'ticket.created',
          `Tiếp nhận ${ticket.number}: ${ticket.subject}.`,
        )
      })
    },
    updateTicket(ticketId, patch) {
      return mutate((data, references) => {
        assertKeys(patch, ['status', 'priority', 'assigneeId', 'resolution', 'dueAt'])
        const ticket = requireTicket(data, ticketId)
        if (patch.assigneeId !== undefined) validateAgent(references, patch.assigneeId)
        if (patch.priority !== undefined && !Object.hasOwn(slaHours, patch.priority))
          reject('Mức ưu tiên không hợp lệ.', 'Invalid priority.')
        if (
          patch.status !== undefined &&
          patch.status !== ticket.status &&
          !TICKET_TRANSITIONS[ticket.status]?.includes(patch.status)
        )
          reject(
            'Không thể chuyển trạng thái yêu cầu theo thứ tự này.',
            'This ticket status transition is not allowed.',
          )
        const nextStatus = patch.status ?? ticket.status
        const resolution =
          patch.resolution === undefined
            ? ticket.resolution
            : cleanText(patch.resolution, 0, 5000, 'Kết quả xử lý / Resolution')
        if (['resolved', 'closed'].includes(nextStatus) && resolution.trim().length < 3)
          reject(
            'Nhập kết quả xử lý trước khi giải quyết hoặc đóng yêu cầu.',
            'Enter a resolution before resolving or closing the ticket.',
          )
        if (patch.dueAt !== undefined && !Number.isFinite(Date.parse(patch.dueAt)))
          reject('Hạn xử lý không hợp lệ.', 'Invalid ticket due date.')
        Object.assign(ticket, patch, { resolution, updatedAt: stamp() })
        ticket.resolvedAt = ['resolved', 'closed'].includes(nextStatus)
          ? (ticket.resolvedAt ?? stamp())
          : null
        audit(
          data,
          references,
          'ticket',
          ticket.id,
          'ticket.updated',
          `${ticket.number}: cập nhật phân công, ưu tiên hoặc trạng thái.`,
        )
      })
    },
    addTicketComment(ticketId, text) {
      return mutate((data, references) => {
        const ticket = requireTicket(data, ticketId)
        ticket.comments.push({
          id: id('comment'),
          text: cleanText(text, 1, 5000, 'Ghi chú / Comment'),
          createdAt: stamp(),
          authorId: actor(references),
        })
        ticket.updatedAt = stamp()
        audit(
          data,
          references,
          'ticket',
          ticket.id,
          'ticket.comment.created',
          `${ticket.number}: thêm ghi chú nội bộ.`,
        )
      })
    },
    async reset() {
      const work = queue.then(async () => {
        const references = await inbox.load()
        const next = createOperationsDemoData(references)
        assertOperationsData(next, references)
        commit(next)
        return clone(next)
      })
      queue = work.then(
        () => {},
        () => {},
      )
      return work
    },
  }
}

export function createApiOperationsService(
  baseUrl: string,
  inbox: InboxService = defaultInboxService,
): OperationsService {
  const request = async (path: string, method = 'GET', body?: unknown) => {
    try {
      if (!['http:', 'https:'].includes(new URL(baseUrl).protocol)) throw new Error()
    } catch {
      reject(
        'Chế độ trực tiếp cần VITE_API_BASE_URL hợp lệ.',
        'Live Mode requires a valid VITE_API_BASE_URL.',
      )
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/operations${path}`, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) {
        if (response.status === 401) notifyAuthenticationExpired()
        reject(
          `API vận hành trả về lỗi ${response.status}. Thay đổi chưa được xác nhận.`,
          `Operations API returned ${response.status}. Changes have not been confirmed.`,
        )
      }
      let data: unknown
      try {
        data = await response.json()
      } catch {
        reject('API vận hành trả về JSON không hợp lệ.', 'Operations API returned invalid JSON.')
      }
      assertOperationsData(data, await inbox.load())
      return data
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
        reject(
          'Không thể kết nối API vận hành. Kiểm tra backend và tải lại dữ liệu.',
          'Unable to connect to the operations API. Check the backend and reload data.',
        )
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  const encoded = encodeURIComponent
  return {
    load: () => request(''),
    updateCustomerProfile: (customerId, patch) =>
      request(`/customers/${encoded(customerId)}/profile`, 'PATCH', patch),
    addCustomerNote: (customerId, text) =>
      request(`/customers/${encoded(customerId)}/notes`, 'POST', { text }),
    createOrder: (input) => request('/orders', 'POST', input),
    changeOrderStatus: (orderId, status) =>
      request(`/orders/${encoded(orderId)}/status`, 'POST', { status }),
    changePaymentStatus: (orderId, status) =>
      request(`/orders/${encoded(orderId)}/payment`, 'POST', { status }),
    createShipment: (input) => request('/shipments', 'POST', input),
    advanceShipment: (shipmentId, status, description) =>
      request(`/shipments/${encoded(shipmentId)}/events`, 'POST', { status, description }),
    createTicket: (input) => request('/tickets', 'POST', input),
    updateTicket: (ticketId, patch) => request(`/tickets/${encoded(ticketId)}`, 'PATCH', patch),
    addTicketComment: (ticketId, text) =>
      request(`/tickets/${encoded(ticketId)}/comments`, 'POST', { text }),
    async reset() {
      return reject(
        'Không cho phép khôi phục dữ liệu ở chế độ trực tiếp.',
        'Resetting data is not allowed in Live Mode.',
      )
    },
  }
}

let storage: OperationsStorage | undefined
try {
  if (typeof window !== 'undefined') storage = window.localStorage
} catch {
  storage = {
    getItem: () => reject('Bộ nhớ trình duyệt chưa sẵn sàng.', 'Browser storage is unavailable.'),
    setItem: () => reject('Bộ nhớ trình duyệt chưa sẵn sàng.', 'Browser storage is unavailable.'),
  }
}
const mode = APP_MODE
export const operationsService =
  APP_MODE === 'live' || mode !== 'demo'
    ? createApiOperationsService(
        mode === 'live'
          ? import.meta.env.VITE_API_BASE_URL ||
              (typeof window === 'undefined' ? '' : `${window.location.origin}/api/v1`)
          : '',
      )
    : createDemoOperationsService({ storage })
