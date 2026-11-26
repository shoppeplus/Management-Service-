// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBusiness } from './business.mjs'
import { openDatabase } from './database.mjs'
import { createInventory } from './inventory.mjs'

const fixtures = []
function fixture() {
  const db = openDatabase()
  fixtures.push(db)
  const tenantId = randomUUID()
  const userId = randomUUID()
  db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
    tenantId,
    'Business test',
    new Date().toISOString(),
  )
  db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES(?,?,?,?)').run(
    userId,
    tenantId,
    'Test Owner',
    'owner',
  )
  const actor = { tenantId, userId, role: 'owner' }
  const inventory = createInventory(db)
  const command = (action, input) => inventory.command(actor, action, input, randomUUID()).result
  const warehouseId = command('warehouse.create', { code: 'MAIN', name: 'Main warehouse' }).id
  const skuId = command('sku.create', {
    sku: 'SKU-REAL',
    name: 'Real item',
    price: 918000,
    reorderPoint: 0,
  }).id
  const receipt = command('document.create', {
    type: 'receipt',
    warehouseId,
    lines: [{ skuId, quantity: 5, unitCost: 500000 }],
  })
  command('document.approve', { id: receipt.id })
  command('document.post', { id: receipt.id })
  const business = createBusiness(db, { inventory })
  return { db, actor, inventory, business, warehouseId, skuId }
}

afterEach(() => {
  while (fixtures.length) fixtures.pop().close()
})

describe('SQLite business data', () => {
  it('creates a canonical customer and stock-backed order atomically', () => {
    const { db, actor, inventory, business, warehouseId, skuId } = fixture()
    const customer = business.createCustomer(actor, {
      name: 'Customer One',
      phone: '+84 903 456 789',
      email: 'customer@example.com',
      company: '',
      membership: 'Standard',
      location: 'Hanoi',
    })
    const input = {
      customerId: customer.id,
      warehouseId,
      items: [{ productId: skuId, quantity: 2 }],
      discount: 0,
      shippingFee: 20000,
      paymentMethod: 'cod',
      shippingAddress: '12 Cầu Giấy, Hà Nội',
      recipientName: customer.name,
      recipientPhone: customer.phone,
      note: '',
    }

    const created = business.createOrder(actor, input)
    expect(created.orders).toHaveLength(1)
    expect(created.orders[0]).toMatchObject({
      customerId: customer.id,
      status: 'draft',
      subtotal: 1836000,
      total: 1856000,
      items: [{ productId: skuId, unitPrice: 918000, quantity: 2 }],
    })
    expect(created.products.find((product) => product.id === skuId)?.stock).toBe(5)

    const confirmed = business.changeOrderStatus(actor, created.orders[0].id, {
      status: 'confirmed',
    })
    expect(confirmed.orders[0].status).toBe('confirmed')
    expect(inventory.snapshot(actor).balances.find((balance) => balance.skuId === skuId)?.reserved)
      .toBe(2)
    expect(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=?').get(actor.tenantId).count)
      .toBeGreaterThan(0)
  })

  it('persists internal notes and ticket comments while rejecting unsent live replies', () => {
    const { db, actor, business } = fixture()
    const customer = business.createCustomer(actor, {
      name: 'Customer Two',
      phone: '',
      email: '',
      company: '',
      membership: 'Standard',
      location: '',
    })
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO conversations(
        id,tenant_id,customer_id,channel,subject,last_message_at,due_at,created_at,updated_at
      ) VALUES(?,?,?,'livechat','Question',?,?,?,?)`,
    ).run('conversation-one', actor.tenantId, customer.id, now, now, now, now)

    business.updateConversation(actor, 'conversation-one', { status: 'pending', tags: ['Follow up'] })
    const noted = business.sendMessage(actor, 'conversation-one', {
      type: 'note',
      text: 'Call customer tomorrow.',
    })
    expect(noted.status).toBe('pending')
    expect(noted.messages[0]).toMatchObject({ type: 'note', text: 'Call customer tomorrow.' })
    expect(() =>
      business.sendMessage(actor, 'conversation-one', {
        type: 'outgoing',
        text: 'We will help.',
      }),
    ).toThrow(/Chưa có adapter gửi tin thật/)

    const snapshot = business.createTicket(actor, {
      customerId: customer.id,
      orderId: null,
      conversationId: 'conversation-one',
      subject: 'Delivery question',
      description: 'Customer is asking about delivery timing.',
      category: 'delivery',
      priority: 'normal',
      assigneeId: actor.userId,
    })
    const ticketId = snapshot.tickets[0].id
    const commented = business.addTicketComment(actor, ticketId, { text: 'Checking carrier details.' })
    expect(commented.tickets[0].comments).toHaveLength(1)
  })

  it('requires explicit manual logistics and records shipment progress without marking payment paid', () => {
    const { actor, business, warehouseId, skuId } = fixture()
    const customer = business.createCustomer(actor, {
      name: 'Customer Three',
      phone: '0903456789',
      email: '',
      company: '',
      membership: 'Standard',
      location: 'Hanoi',
    })
    const orderId = business.createOrder(actor, {
      customerId: customer.id,
      warehouseId,
      items: [{ productId: skuId, quantity: 1 }],
      discount: 0,
      shippingFee: 0,
      paymentMethod: 'cod',
      shippingAddress: '12 Cầu Giấy, Hà Nội',
      recipientName: customer.name,
      recipientPhone: customer.phone,
      note: '',
    }).orders[0].id
    business.changeOrderStatus(actor, orderId, { status: 'confirmed' })
    business.changeOrderStatus(actor, orderId, { status: 'packing' })

    expect(() =>
      business.createShipment(actor, { orderId, carrierId: 'demo-express' }),
    ).toThrow(/Chưa cấu hình hãng vận chuyển thật/)
    const created = business.createShipment(actor, { orderId, carrierId: 'manual' })
    const shipment = created.shipments[0]
    expect(shipment).toMatchObject({ carrierId: 'manual', status: 'ready' })

    const moving = business.advanceShipment(actor, shipment.id, {
      status: 'in_transit',
      description: 'Handed to carrier by warehouse staff.',
    })
    expect(moving.orders[0].status).toBe('shipped')
    expect(moving.orders[0].paymentStatus).toBe('unpaid')
    expect(moving.shipments[0].events).toHaveLength(2)
  })

  it('keeps customer data tenant-scoped and rejects duplicate normalized phone numbers', () => {
    const { actor, business } = fixture()
    business.createCustomer(actor, {
      name: 'First Customer',
      phone: '+84 903 456 789',
      email: '',
      company: '',
      membership: 'Standard',
      location: '',
    })
    expect(() =>
      business.createCustomer(actor, {
        name: 'Duplicate Customer',
        phone: '0903456789',
        email: '',
        company: '',
        membership: 'Standard',
        location: '',
      }),
    ).toThrow(/số điện thoại này đã tồn tại/)
    expect(() => business.updateCustomer(actor, 'not-this-tenant', { name: 'Other' })).toThrow(
      /Không tìm thấy khách hàng/,
    )
  })
})
