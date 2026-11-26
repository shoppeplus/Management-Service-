import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoInboxService } from '../../services/inboxService'
import { createOperationsDemoData } from './data'
import {
  createApiOperationsService,
  createDemoOperationsService,
  OPERATIONS_STORAGE_KEY,
  operationsErrorMessage,
} from './service'
import { assertOperationsData } from './validation'
import type { CreateOrderInput, CreateTicketInput, OperationsData } from './types'

const fixedNow = () => new Date('2026-11-17T03:00:00.000Z')
function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
function setup() {
  const storage = memoryStorage()
  const inboxService = createDemoInboxService()
  const service = createDemoOperationsService({ storage, inboxService, now: fixedNow })
  return { storage, inboxService, service }
}
const input = (patch: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  customerId: 'CUS-001',
  items: [{ productId: 'prod-nordic', quantity: 2 }],
  discount: 50000,
  shippingFee: 30000,
  paymentMethod: 'cod',
  shippingAddress: '12 Nguyễn Văn Thủ, Quận 1, TP.HCM',
  recipientName: 'Mai Anh Nguyen',
  recipientPhone: '+84903456789',
  note: 'Gói quà sinh nhật',
  ...patch,
})
const ticketInput = (patch: Partial<CreateTicketInput> = {}): CreateTicketInput => ({
  customerId: 'CUS-001',
  orderId: 'order-001',
  conversationId: 'conv-001',
  subject: 'Kiểm tra tiến độ giao hàng',
  description: 'Khách cần nhận hàng trước chiều mai.',
  category: 'delivery',
  priority: 'high',
  assigneeId: 'agent-linh',
  ...patch,
})
const lastOrder = (data: OperationsData) => data.orders.at(-1)!
const lastShipment = (data: OperationsData) => data.shipments.at(-1)!

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Operations Demo adapter', () => {
  it('links an order to its customer conversation and makes retry requests idempotent', async () => {
    const { service, storage, inboxService } = setup()
    const orderInput = input({ conversationId: 'conv-001', clientRequestId: 'same-request' })
    const before = await service.load()
    const [first, second] = await Promise.all([
      service.createOrder(orderInput),
      service.createOrder(orderInput),
    ])
    expect(first.orders).toHaveLength(before.orders.length + 1)
    expect(second.orders).toHaveLength(before.orders.length + 1)
    expect(lastOrder(second)).toMatchObject({
      conversationId: 'conv-001',
      clientRequestId: 'same-request',
      status: 'draft',
    })
    expect(second.products).toEqual(before.products)
    const reload = createDemoOperationsService({ storage, inboxService })
    expect((await reload.createOrder(orderInput)).orders).toHaveLength(before.orders.length + 1)
    await expect(service.createOrder(input({ conversationId: 'conv-002' }))).rejects.toThrow(
      'không thuộc',
    )
    await expect(
      service.createOrder(
        input({ conversationId: 'conv-001', clientRequestId: 'same-request', discount: 0 }),
      ),
    ).rejects.toThrow('thông tin đơn hàng khác')
  })
  it('loads deterministic linked fixtures with coherent totals, stock and tracking states', async () => {
    const { service, inboxService } = setup()
    const data = await service.load()
    expect(data.customerProfiles).toHaveLength(10)
    expect(data.products).toHaveLength(6)
    expect(data.orders).toHaveLength(12)
    expect(data.shipments).toHaveLength(7)
    expect(data.tickets).toHaveLength(8)
    expect(() => assertOperationsData(data, awaitNever())).toThrow()
    assertOperationsData(data, await inboxService.load())
    expect(data.orders.find((order) => order.id === 'order-001')).toMatchObject({
      number: 'SS-2048',
      status: 'packing',
    })
    expect(data.products.every((product) => product.stock >= 0)).toBe(true)
    expect(await service.load()).toEqual(data)
  })

  it('accepts inventory-fulfilled orders that do not have a logistics shipment record', async () => {
    const { service, inboxService } = setup()
    const data = await service.load()
    const order = data.orders[0]
    const removedShipments = data.shipments.filter((shipment) => shipment.orderId === order.id)
    const removedShipmentIds = new Set(removedShipments.map((shipment) => shipment.id))

    order.status = 'shipped'
    data.shipments = data.shipments.filter((shipment) => shipment.orderId !== order.id)
    data.auditEvents = data.auditEvents.filter(
      (event) => event.entity !== 'shipment' || !removedShipmentIds.has(event.entityId),
    )

    const references = await inboxService.load()
    expect(() => assertOperationsData(data, references)).not.toThrow()
  })

  it('returns detached data, persists changes and shares canonical customer references', async () => {
    const { service, inboxService, storage } = setup()
    const snapshot = await service.load()
    snapshot.orders[0].total = 1
    expect((await service.load()).orders[0].total).not.toBe(1)
    await service.updateCustomerProfile('CUS-001', {
      status: 'active',
      tags: ['VIP'],
      ownerId: 'agent-thao',
    })
    await service.addCustomerNote('CUS-001', '  Cần gọi lại ngày mai.  ')
    const fresh = createDemoOperationsService({ inboxService, storage, now: fixedNow })
    expect((await fresh.load()).customerProfiles[0]).toMatchObject({
      tags: ['VIP'],
      ownerId: 'agent-thao',
      notes: expect.arrayContaining([
        expect.objectContaining({ text: 'Cần gọi lại ngày mai.', authorId: 'agent-linh' }),
      ]),
    })
    const customer = await inboxService.createCustomer({
      name: 'Khách hàng mới',
      phone: '+84912345670',
      email: 'new@example.com',
      company: 'New Company',
      membership: 'Standard',
      location: 'Hà Nội',
    })
    const profile = (await fresh.load()).customerProfiles.find(
      (item) => item.customerId === customer.id,
    )
    expect(profile).toMatchObject({ status: 'lead', source: 'manual', ownerId: null })
    await fresh.updateCustomerProfile(customer.id, { ownerId: 'agent-linh' })
    expect(
      (await fresh.load()).customerProfiles.find((item) => item.customerId === customer.id)
        ?.ownerId,
    ).toBe('agent-linh')
  })

  it('seeds and resets Demo orders when canonical contacts omit delivery details without overwriting them', async () => {
    const { service, inboxService } = setup()
    await inboxService.updateCustomer('CUS-001', { phone: '', location: 'Q1' })
    const firstLoad = await service.load()
    assertOperationsData(firstLoad, await inboxService.load())
    expect(firstLoad.orders[0]).toMatchObject({
      customerId: 'CUS-001',
      recipientPhone: '0900000000',
      shippingAddress: 'Địa chỉ giao hàng mẫu (Demo)',
    })
    await service.addCustomerNote('CUS-001', 'Ghi chú trước khi khôi phục')
    const reset = await service.reset()
    assertOperationsData(reset, await inboxService.load())
    expect(reset.orders[0].recipientPhone).toBe('0900000000')
    expect((await inboxService.load()).customers[0]).toMatchObject({ phone: '', location: 'Q1' })
  })

  it('computes prices from the catalog, reserves at confirmation and drives COD delivery from tracking', async () => {
    const { service } = setup()
    const before = await service.load()
    const product = before.products.find((item) => item.id === 'prod-nordic')!
    const created = await service.createOrder(input())
    const order = lastOrder(created)
    expect(order).toMatchObject({
      status: 'draft',
      subtotal: 1300000,
      discount: 50000,
      shippingFee: 30000,
      total: 1280000,
    })
    expect(created.products.find((item) => item.id === product.id)?.stock).toBe(product.stock)
    const confirmed = await service.changeOrderStatus(order.id, 'confirmed')
    expect(confirmed.products.find((item) => item.id === product.id)?.stock).toBe(product.stock - 2)
    await service.changeOrderStatus(order.id, 'packing')
    const booked = await service.createShipment({ orderId: order.id, carrierId: 'demo-express' })
    const shipment = lastShipment(booked)
    expect(shipment.trackingNumber).toMatch(/^DEMO-/)
    expect(shipment.codAmount).toBe(order.total)
    expect(shipment.estimatedDeliveryAt).toBe('2026-11-18T03:00:00.000Z')
    await expect(
      service.createShipment({ orderId: order.id, carrierId: 'demo-economy' }),
    ).rejects.toThrow(/đã có vận đơn/)
    const transit = await service.advanceShipment(shipment.id, 'in_transit')
    expect(transit.orders.find((item) => item.id === order.id)?.status).toBe('shipped')
    const delivered = await service.advanceShipment(shipment.id, 'delivered')
    expect(delivered.orders.find((item) => item.id === order.id)).toMatchObject({
      status: 'delivered',
      paymentStatus: 'paid',
    })
    expect(delivered.shipments.find((item) => item.id === shipment.id)?.events.at(-1)?.status).toBe(
      'delivered',
    )
    await expect(service.advanceShipment(shipment.id, 'returned', 'Khách đổi ý')).rejects.toThrow(
      /thứ tự/,
    )
    expect(delivered.auditEvents.some((event) => event.action === 'order.delivered')).toBe(true)
  })

  it('cancels an order and ready shipment atomically, restoring reserved stock exactly once', async () => {
    const { service } = setup()
    const before = await service.load()
    const order = before.orders[0]
    const stock = before.products.find((item) => item.id === order.items[0].productId)!.stock
    const cancelled = await service.changeOrderStatus(order.id, 'cancelled')
    expect(cancelled.products.find((item) => item.id === order.items[0].productId)?.stock).toBe(
      stock + order.items[0].quantity,
    )
    expect(cancelled.shipments.find((item) => item.orderId === order.id)?.status).toBe('cancelled')
    await expect(service.changeOrderStatus(order.id, 'cancelled')).rejects.toThrow(/thứ tự/)
    expect((await service.load()).products).toEqual(cancelled.products)
    const draft = before.orders.find((item) => item.status === 'draft')!
    const afterDraftCancel = await service.changeOrderStatus(draft.id, 'cancelled')
    expect(afterDraftCancel.products).toEqual(cancelled.products)
  })

  it('records exceptions/retries and returns stock without inventing a payment refund', async () => {
    const { service } = setup()
    const data = await service.load()
    const shipment = data.shipments.find((item) => item.status === 'in_transit')!
    const order = data.orders.find((item) => item.id === shipment.orderId)!
    const stock = data.products.find((item) => item.id === order.items[0].productId)!.stock
    await expect(service.advanceShipment(shipment.id, 'exception')).rejects.toThrow(/lý do/)
    await service.advanceShipment(shipment.id, 'exception', 'Không liên hệ được khách')
    await service.advanceShipment(shipment.id, 'in_transit', 'Khách hẹn giao lại')
    const returned = await service.advanceShipment(
      shipment.id,
      'returned',
      'Khách từ chối nhận hàng',
    )
    expect(returned.orders.find((item) => item.id === order.id)).toMatchObject({
      status: 'returned',
      paymentStatus: order.paymentStatus,
    })
    expect(returned.products.find((item) => item.id === order.items[0].productId)?.stock).toBe(
      stock + order.items[0].quantity,
    )
    await expect(service.advanceShipment(shipment.id, 'returned', 'Thử lại')).rejects.toThrow()
  })

  it('allows replacing a cancelled ready shipment without changing reservation or order status', async () => {
    const { service } = setup()
    const before = await service.load()
    const shipment = before.shipments.find((item) => item.status === 'ready')!
    const cancelled = await service.advanceShipment(shipment.id, 'cancelled')
    expect(cancelled.orders.find((item) => item.id === shipment.orderId)?.status).toBe('packing')
    expect(cancelled.products).toEqual(before.products)
    const rebooked = await service.createShipment({
      orderId: shipment.orderId,
      carrierId: 'demo-economy',
    })
    expect(
      rebooked.shipments.filter(
        (item) => item.orderId === shipment.orderId && item.status !== 'cancelled',
      ),
    ).toHaveLength(1)
  })

  it('rejects invalid monetary inputs, unknown references and stock shortages without partial writes', async () => {
    const { service } = setup()
    const before = await service.load()
    await expect(service.createOrder(input({ discount: 99999999 }))).rejects.toThrow(/Giảm giá/)
    await expect(service.createOrder(input({ shippingFee: -1 }))).rejects.toThrow()
    await expect(service.createOrder(input({ customerId: 'missing' }))).rejects.toThrow(
      /khách hàng/,
    )
    await expect(
      service.createOrder(input({ items: [{ productId: 'prod-mug', quantity: 1.5 }] })),
    ).rejects.toThrow()
    await expect(
      service.createOrder(
        input({
          items: [
            { productId: 'prod-mug', quantity: 1 },
            { productId: 'prod-mug', quantity: 2 },
          ],
        }),
      ),
    ).rejects.toThrow(/trùng/)
    expect(await service.load()).toEqual(before)
    const shortage = lastOrder(
      await service.createOrder(input({ items: [{ productId: 'prod-tea', quantity: 999 }] })),
    )
    const beforeConfirm = await service.load()
    await expect(service.changeOrderStatus(shortage.id, 'confirmed')).rejects.toThrow(
      /Không đủ tồn kho/,
    )
    expect(await service.load()).toEqual(beforeConfirm)
    await expect(service.changeOrderStatus(shortage.id, 'shipped')).rejects.toThrow()
    await expect(
      service.createShipment({ orderId: shortage.id, carrierId: 'demo-express' }),
    ).rejects.toThrow()
  })

  it('records payment and refunds only through legal independent transitions', async () => {
    const { service } = setup()
    const order = (await service.load()).orders.find(
      (item) => item.status === 'confirmed' && item.paymentStatus === 'unpaid',
    )!
    await expect(service.changePaymentStatus(order.id, 'refunded')).rejects.toThrow()
    await service.changePaymentStatus(order.id, 'paid')
    await expect(service.changePaymentStatus(order.id, 'paid')).rejects.toThrow()
    await expect(service.changePaymentStatus(order.id, 'refunded')).rejects.toThrow()
    await service.changeOrderStatus(order.id, 'cancelled')
    const refunded = await service.changePaymentStatus(order.id, 'refunded')
    expect(refunded.orders.find((item) => item.id === order.id)?.paymentStatus).toBe('refunded')
    await expect(service.changePaymentStatus(order.id, 'refunded')).rejects.toThrow()
  })

  it('clears outstanding mock COD collection when an active order is recorded as prepaid', async () => {
    const { service } = setup()
    const before = await service.load()
    const order = before.orders[0]
    expect(order.paymentMethod).toBe('cod')
    expect(before.shipments.find((shipment) => shipment.orderId === order.id)?.codAmount).toBe(
      order.total,
    )
    const after = await service.changePaymentStatus(order.id, 'paid')
    expect(after.shipments.find((shipment) => shipment.orderId === order.id)?.codAmount).toBe(0)
    expect(after.orders[0].paymentStatus).toBe('paid')
    await expect(
      service.changePaymentStatus(
        before.orders.find((item) => item.status === 'draft')!.id,
        'paid',
      ),
    ).rejects.toThrow()
  })

  it('creates linked tickets with SLA, resolution/reopen rules and internal comments', async () => {
    const { service } = setup()
    const created = await service.createTicket(ticketInput({ priority: 'urgent' }))
    const ticket = created.tickets.at(-1)!
    expect(ticket).toMatchObject({
      status: 'open',
      dueAt: '2026-11-17T05:00:00.000Z',
      assigneeId: 'agent-linh',
    })
    await expect(service.updateTicket(ticket.id, { status: 'resolved' })).rejects.toThrow(
      /kết quả xử lý/,
    )
    await service.updateTicket(ticket.id, { status: 'in_progress', assigneeId: 'agent-thao' })
    await service.addTicketComment(ticket.id, 'Đã gọi khách, khách xác nhận địa chỉ.')
    const resolved = await service.updateTicket(ticket.id, {
      status: 'resolved',
      resolution: 'Đã phối hợp giao hàng trước 16h.',
    })
    expect(resolved.tickets.at(-1)).toMatchObject({
      status: 'resolved',
      resolvedAt: fixedNow().toISOString(),
      comments: [expect.objectContaining({ authorId: 'agent-linh' })],
    })
    await service.updateTicket(ticket.id, { status: 'closed' })
    await expect(service.updateTicket(ticket.id, { status: 'waiting' })).rejects.toThrow()
    const reopened = await service.updateTicket(ticket.id, { status: 'open' })
    expect(reopened.tickets.at(-1)?.resolvedAt).toBeNull()
    await expect(service.createTicket(ticketInput({ orderId: 'order-002' }))).rejects.toThrow(
      /không thuộc/,
    )
    await expect(service.createTicket(ticketInput({ conversationId: 'conv-002' }))).rejects.toThrow(
      /không thuộc/,
    )
    await expect(service.updateTicket(ticket.id, { assigneeId: 'missing' })).rejects.toThrow()
  })

  it('serializes concurrent writes and recovers its queue after rejected work', async () => {
    const { service } = setup()
    await Promise.all([
      service.addCustomerNote('CUS-001', 'Ghi chú thứ nhất'),
      service.addCustomerNote('CUS-001', 'Ghi chú thứ hai'),
    ])
    expect(
      (await service.load()).customerProfiles[0].notes.slice(-2).map((note) => note.text),
    ).toEqual(['Ghi chú thứ nhất', 'Ghi chú thứ hai'])
    const outcomes = await Promise.allSettled([
      service.createOrder(input({ discount: -1 })),
      service.addCustomerNote('CUS-001', 'Tiếp tục sau lỗi'),
    ])
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'fulfilled'])
    expect((await service.load()).customerProfiles[0].notes.at(-1)?.text).toBe('Tiếp tục sau lỗi')
  })

  it('preserves memory when storage write fails and exposes localized errors', async () => {
    const inboxService = createDemoInboxService()
    let fail = false
    const values = memoryStorage()
    const service = createDemoOperationsService({
      inboxService,
      now: fixedNow,
      storage: {
        getItem: values.getItem,
        setItem: (key, value) => {
          if (fail) throw new Error('Quota')
          values.setItem(key, value)
        },
      },
    })
    await service.addCustomerNote('CUS-001', 'Đã lưu')
    const before = await service.load()
    fail = true
    let caught: unknown
    try {
      await service.addCustomerNote('CUS-001', 'Không được lưu')
    } catch (error) {
      caught = error
    }
    expect(operationsErrorMessage(caught, 'en')).toContain('Unable to save')
    expect(await service.load()).toEqual(before)
  })

  it('does not hide browser read failures or allow duplicate CRM tags and unknown owners', async () => {
    const { service, inboxService } = setup()
    await expect(
      createDemoOperationsService({
        inboxService,
        storage: {
          getItem() {
            throw new Error('blocked')
          },
          setItem() {},
        },
      }).load(),
    ).rejects.toThrow(/Không thể đọc/)
    const before = await service.load()
    await expect(
      service.updateCustomerProfile('CUS-001', { tags: ['VIP', 'vip'] }),
    ).rejects.toThrow(/trùng/)
    await expect(service.updateCustomerProfile('CUS-001', { ownerId: 'missing' })).rejects.toThrow(
      /Nhân viên/,
    )
    await expect(
      service.createTicket(ticketInput({ priority: '__proto__' as 'urgent' })),
    ).rejects.toThrow(/ưu tiên/)
    expect(await service.load()).toEqual(before)
  })

  it('rejects corrupt, malformed and inconsistent saved data and provides explicit reset recovery', async () => {
    const { storage, inboxService } = setup()
    const baseline = createOperationsDemoData(await inboxService.load())
    const invalid: unknown[] = [
      '{bad json',
      { ...baseline, schemaVersion: 99 },
      { ...baseline, products: [null] },
      {
        ...baseline,
        orders: baseline.orders.map((order, i) => (i === 0 ? { ...order, total: 1 } : order)),
      },
      {
        ...baseline,
        tickets: baseline.tickets.map((ticket, i) =>
          i === 0 ? { ...ticket, customerId: 'CUS-002' } : ticket,
        ),
      },
      {
        ...baseline,
        shipments: baseline.shipments.map((shipment, i) =>
          i === 0 ? { ...shipment, status: 'delivered' } : shipment,
        ),
      },
      {
        ...baseline,
        orders: baseline.orders.map((order, i) =>
          i === 0 ? { ...order, paymentStatus: 'paid' } : order,
        ),
      },
    ]
    for (const entry of invalid) {
      storage.setItem(
        OPERATIONS_STORAGE_KEY,
        typeof entry === 'string' ? entry : JSON.stringify(entry),
      )
      const service = createDemoOperationsService({ inboxService, storage, now: fixedNow })
      await expect(service.load()).rejects.toThrow()
      expect((await service.reset()).orders).toHaveLength(12)
    }
  })
})

describe('Operations API adapter', () => {
  it('uses full snapshot endpoints with cookies and never falls back on failed requests', async () => {
    const inboxService = createDemoInboxService()
    const data = createOperationsDemoData(await inboxService.load())
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const service = createApiOperationsService('https://api.example.com/api/', inboxService)
    expect(await service.load()).toEqual(data)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/operations',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
    await service.createOrder(input())
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.com/api/operations/orders',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input()) }),
    )
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await expect(service.load()).rejects.toThrow(/503/)
    fetchMock.mockResolvedValueOnce(new Response('{bad', { status: 200 }))
    await expect(service.load()).rejects.toThrow(/JSON/)
    fetchMock.mockResolvedValueOnce(new Response('{"orders":[]}', { status: 200 }))
    await expect(service.load()).rejects.toThrow(/không hợp lệ/)
    await expect(service.reset()).rejects.toThrow(/trực tiếp/)
  })

  it('rejects unconfigured or unreachable Live APIs', async () => {
    const inboxService = createDemoInboxService()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network failure'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createApiOperationsService('', inboxService).load()).rejects.toThrow(
      /VITE_API_BASE_URL/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(
      createApiOperationsService('https://api.example.com', inboxService).load(),
    ).rejects.toThrow(/Không thể kết nối/)
  })
})

function awaitNever() {
  return { customers: [], agents: [], teams: [], conversations: [] }
}
