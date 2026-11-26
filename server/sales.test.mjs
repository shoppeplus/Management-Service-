// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createInventory } from './inventory.mjs'
import { openDatabase, transaction } from './database.mjs'
import { createSales, salesPermissions } from './sales.mjs'

function fixture({ stock = 5, secondStock = 0, serialTracked = false } = {}) {
  const db = openDatabase()
  for (const tenantId of ['tenant-a', 'tenant-b']) {
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES (?,?,?)').run(
      tenantId,
      tenantId,
      new Date().toISOString(),
    )
    for (const role of ['owner', 'staff', 'issuer', 'viewer'])
      db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES (?,?,?,?)').run(
        `${tenantId}-${role}`,
        tenantId,
        role,
        role,
      )
  }

  const inventory = createInventory(db)
  const actor = { tenantId: 'tenant-a', userId: 'tenant-a-owner', role: 'owner' }
  const command = (who, action, input) => inventory.command(who, action, input, randomUUID()).result
  const warehouseId = command(actor, 'warehouse.create', {
    code: 'MAIN',
    name: 'Kho chính',
  }).id
  const createSku = (sku, name, tracksSerials = false, price = 100) =>
    command(actor, 'sku.create', {
      sku,
      name,
      price,
      reorderPoint: 0,
      serialTracked: tracksSerials,
    }).id
  const skuId = createSku('LUMI-SW-01', 'Công tắc thông minh', serialTracked)
  const secondSkuId = createSku('LUMI-SW-02', 'Cảm biến cửa')
  const receive = (sku, quantity, serialNumbers = []) => {
    if (!quantity) return
    const documentId = command(actor, 'document.create', {
      type: 'receipt',
      warehouseId,
      lines: [{ skuId: sku, quantity, unitCost: 100, serialNumbers }],
    }).id
    command(actor, 'document.approve', { id: documentId })
    command(actor, 'document.post', { id: documentId })
  }
  receive(skuId, stock, serialTracked ? ['DEVICE-0001'] : [])
  receive(secondSkuId, secondStock)

  const sales = createSales(db, {
    executeInventory: (who, action, input) => inventory.executeInTransaction(who, action, input),
  })
  const execute = (who, action, input) => transaction(db, () => sales.execute(who, action, input))

  return { db, actor, inventory, sales, execute, warehouseId, skuId, secondSkuId }
}

const withFixture = (options, work) => {
  const f = fixture(options)
  try {
    work(f)
  } finally {
    f.db.close()
  }
}

test('sales reserves stock, fulfills through an allocated issue, and tracks partial and complete returns', () => {
  withFixture({}, ({ db, actor, sales, execute, warehouseId, skuId }) => {
    const created = execute(actor, 'salesOrder.create', {
      warehouseId,
      customerReference: 'customer-104',
      reference: 'web-104',
      lines: [{ skuId, quantity: 2 }],
    })
    execute(actor, 'salesOrder.confirm', { id: created.id })

    const confirmed = sales.snapshot(actor).salesOrders[0]
    assert.equal(confirmed.status, 'confirmed')
    assert.equal(confirmed.lines[0].quantity, 2)
    assert.ok(confirmed.lines[0].reservationId)
    assert.equal(
      db
        .prepare('SELECT reserved FROM balances WHERE tenant_id=? AND sku_id=?')
        .get(actor.tenantId, skuId).reserved,
      2,
    )

    const fulfilled = execute(actor, 'salesOrder.fulfill', { id: created.id })
    const posted = sales.snapshot(actor).salesOrders[0]
    assert.equal(posted.status, 'fulfilled')
    assert.equal(posted.fulfillmentDocumentId, fulfilled.documentId)
    assert.equal(posted.lines[0].returnableQuantity, 2)
    assert.equal(
      db
        .prepare('SELECT status,quantity_remaining FROM reservations WHERE tenant_id=? AND id=?')
        .get(actor.tenantId, posted.lines[0].reservationId).status,
      'consumed',
    )
    assert.equal(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM reservation_allocations a
            JOIN stock_document_lines l ON l.tenant_id=a.tenant_id AND l.id=a.document_line_id
            WHERE a.tenant_id=? AND l.document_id=? AND a.consumed_at IS NOT NULL`,
        )
        .get(actor.tenantId, fulfilled.documentId).count,
      1,
    )
    assert.equal(
      db
        .prepare('SELECT on_hand,reserved FROM balances WHERE tenant_id=? AND sku_id=?')
        .get(actor.tenantId, skuId).on_hand,
      3,
    )

    execute(actor, 'salesOrder.return', {
      id: created.id,
      reason: 'Khách đổi ý',
      lines: [{ lineId: posted.lines[0].id, quantity: 1 }],
    })
    assert.equal(sales.snapshot(actor).salesOrders[0].lines[0].returnableQuantity, 1)
    assert.equal(
      db
        .prepare('SELECT on_hand FROM balances WHERE tenant_id=? AND sku_id=?')
        .get(actor.tenantId, skuId).on_hand,
      4,
    )

    execute(actor, 'salesOrder.return', {
      id: created.id,
      reason: 'Trả phần còn lại',
      lines: [{ lineId: posted.lines[0].id, quantity: 1 }],
    })
    const returned = sales.snapshot(actor).salesOrders[0]
    assert.equal(returned.status, 'returned')
    assert.equal(returned.lines[0].returnableQuantity, 0)
    assert.equal(
      db
        .prepare('SELECT on_hand FROM balances WHERE tenant_id=? AND sku_id=?')
        .get(actor.tenantId, skuId).on_hand,
      5,
    )
  })
})

test('a failed multi-line confirmation rolls back earlier reservations and inventory audit rows', () => {
  withFixture({}, ({ db, actor, execute, warehouseId, skuId, secondSkuId }) => {
    const order = execute(actor, 'salesOrder.create', {
      warehouseId,
      customerReference: 'customer-205',
      lines: [
        { skuId, quantity: 1 },
        { skuId: secondSkuId, quantity: 1 },
      ],
    })
    const auditCount = db
      .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='reservation.create'")
      .get().count

    assert.throws(
      () => execute(actor, 'salesOrder.confirm', { id: order.id }),
      (error) => error.code === 'INSUFFICIENT_STOCK',
    )
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS count FROM sales_order_line_reservations WHERE tenant_id=?')
        .get(actor.tenantId).count,
      0,
    )
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM reservations WHERE tenant_id=?').get(actor.tenantId)
        .count,
      0,
    )
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='reservation.create'")
        .get().count,
      auditCount,
    )
    assert.equal(
      db
        .prepare('SELECT status FROM sales_orders WHERE tenant_id=? AND id=?')
        .get(actor.tenantId, order.id).status,
      'draft',
    )
  })
})

test('cancelling a confirmed order releases its reservation and serial-tracked fulfillment requires device IDs', () => {
  withFixture(
    { stock: 1, serialTracked: true },
    ({ actor, execute, sales, warehouseId, skuId, db }) => {
      const order = execute(actor, 'salesOrder.create', {
        warehouseId,
        customerReference: 'customer-407',
        lines: [{ skuId, quantity: 1 }],
      })
      execute(actor, 'salesOrder.confirm', { id: order.id })
      const line = sales.snapshot(actor).salesOrders[0].lines[0]

      assert.throws(
        () => execute(actor, 'salesOrder.fulfill', { id: order.id }),
        (error) => error.code === 'SERIAL_REQUIRED',
      )
      assert.equal(sales.snapshot(actor).salesOrders[0].status, 'confirmed')
      assert.equal(
        db
          .prepare('SELECT status FROM reservations WHERE tenant_id=? AND id=?')
          .get(actor.tenantId, line.reservationId).status,
        'active',
      )

      execute(actor, 'salesOrder.cancel', { id: order.id, reason: 'Khách hủy đơn' })
      assert.equal(sales.snapshot(actor).salesOrders[0].status, 'cancelled')
      const reservation = db
        .prepare('SELECT status,quantity_remaining FROM reservations WHERE tenant_id=? AND id=?')
        .get(actor.tenantId, line.reservationId)
      assert.equal(reservation.status, 'released')
      assert.equal(reservation.quantity_remaining, 0)
      assert.equal(
        db
          .prepare('SELECT reserved FROM balances WHERE tenant_id=? AND sku_id=?')
          .get(actor.tenantId, skuId).reserved,
        0,
      )
    },
  )
})

test('sales records and snapshots stay tenant-scoped and composite actions respect inventory roles', () => {
  withFixture({}, ({ actor, sales, execute, warehouseId, skuId }) => {
    const order = execute(actor, 'salesOrder.create', {
      warehouseId,
      customerReference: 'customer-306',
      lines: [{ skuId, quantity: 1 }],
    })
    const otherTenant = {
      tenantId: 'tenant-b',
      userId: 'tenant-b-owner',
      role: 'owner',
    }

    assert.deepEqual(sales.snapshot(otherTenant).salesOrders, [])
    assert.throws(
      () => execute(otherTenant, 'salesOrder.confirm', { id: order.id }),
      (error) => error.code === 'NOT_FOUND',
    )
    assert.deepEqual(salesPermissions('issuer'), [
      'salesOrder.create',
      'salesOrder.confirm',
      'salesOrder.cancel',
    ])
    assert.equal(salesPermissions('staff').includes('salesOrder.fulfill'), false)
    assert.throws(
      () =>
        execute(
          { tenantId: actor.tenantId, userId: 'tenant-a-staff', role: 'staff' },
          'salesOrder.fulfill',
          { id: order.id },
        ),
      (error) => error.code === 'FORBIDDEN',
    )
  })
})

test('sales snapshots remain readable when the inventory module is disabled while mutations stop', () => {
  withFixture({}, ({ db, actor, sales, execute, warehouseId, skuId }) => {
    const config = JSON.parse(
      db.prepare('SELECT config_json FROM tenants WHERE id=?').get(actor.tenantId).config_json,
    )
    config.inventoryEnabled = false
    db.prepare('UPDATE tenants SET config_json=? WHERE id=?').run(
      JSON.stringify(config),
      actor.tenantId,
    )

    assert.deepEqual(sales.snapshot(actor).salesOrders, [])
    assert.throws(
      () =>
        execute(actor, 'salesOrder.create', {
          warehouseId,
          customerReference: 'customer-disabled',
          lines: [{ skuId, quantity: 1 }],
        }),
      (error) => error.code === 'MODULE_DISABLED',
    )
  })
})

test('public inventory commands apply idempotency and return sales state alongside stock changes', () => {
  withFixture({}, ({ inventory, actor, warehouseId, skuId }) => {
    const key = randomUUID()
    const input = {
      warehouseId,
      customerReference: 'customer-retry',
      lines: [{ skuId, quantity: 2 }],
    }
    const created = inventory.command(actor, 'salesOrder.create', input, key)
    const replayed = inventory.command(actor, 'salesOrder.create', input, key)
    assert.equal(created.salesOrders.length, 1)
    assert.deepEqual(replayed.result, created.result)
    assert.equal(replayed.salesOrders.length, 1)

    const confirmationKey = randomUUID()
    const confirmed = inventory.command(
      actor,
      'salesOrder.confirm',
      { id: created.result.id },
      confirmationKey,
    )
    const confirmedRetry = inventory.command(
      actor,
      'salesOrder.confirm',
      { id: created.result.id },
      confirmationKey,
    )
    assert.equal(confirmed.reservations.length, 1)
    assert.equal(confirmedRetry.reservations.length, 1)
    const fulfillmentKey = randomUUID()
    const fulfilled = inventory.command(
      actor,
      'salesOrder.fulfill',
      { id: created.result.id },
      fulfillmentKey,
    )
    const fulfilledRetry = inventory.command(
      actor,
      'salesOrder.fulfill',
      { id: created.result.id },
      fulfillmentKey,
    )
    assert.equal(fulfilled.salesOrders[0].status, 'fulfilled')
    assert.equal(fulfilledRetry.salesOrders[0].status, 'fulfilled')
    assert.equal(fulfilledRetry.documents.filter((document) => document.type === 'issue').length, 1)
    assert.equal(fulfilledRetry.balances[0].onHand, 3)
  })
})

test('sales returns reconcile manual posted receipts and preserve rounded original carrying value', () => {
  withFixture({ stock: 0 }, ({ inventory, actor, warehouseId, skuId }) => {
    const command = (action, input) => inventory.command(actor, action, input, randomUUID())
    for (const [quantity, unitCost] of [
      [1, 1],
      [2, 0],
    ]) {
      const receipt = command('document.create', {
        type: 'receipt',
        warehouseId,
        lines: [{ skuId, quantity, unitCost }],
      }).result.id
      command('document.approve', { id: receipt })
      command('document.post', { id: receipt })
    }
    const created = command('salesOrder.create', {
      warehouseId,
      customerReference: 'return-reconciliation',
      lines: [{ skuId, quantity: 3 }],
    })
    const id = created.result.id
    command('salesOrder.confirm', { id })
    const issued = command('salesOrder.fulfill', { id })
    const sourceDocumentId = issued.result.documentId
    const lineId = issued.salesOrders[0].lines[0].id
    const receipt = command('document.create', {
      type: 'receipt',
      warehouseId,
      returnToStock: true,
      sourceDocumentId,
      reference: 'MANUAL-RETURN',
      reason: 'Khách trả tại kho',
      lines: [{ skuId, quantity: 1, unitCost: 0 }],
    }).result.id
    command('document.approve', { id: receipt })
    const manuallyReturned = command('document.post', { id: receipt })
    assert.equal(manuallyReturned.salesOrders[0].lines[0].returnedQuantity, 1)
    assert.equal(manuallyReturned.salesOrders[0].lines[0].returnableQuantity, 2)
    const completed = command('salesOrder.return', {
      id,
      reason: 'Trả hai thiết bị còn lại',
      lines: [{ lineId, quantity: 2 }],
    })
    assert.equal(completed.salesOrders[0].status, 'returned')
    assert.equal(completed.salesOrders[0].lines[0].returnedQuantity, 3)
    assert.equal(completed.balances[0].onHand, 3)
    assert.equal(completed.balances[0].inventoryValue, 1)
  })
})

test('sales rejects unsafe order amounts before any order line is persisted', () => {
  withFixture({}, ({ inventory, actor, warehouseId, skuId }) => {
    inventory.command(
      actor,
      'sku.update',
      { id: skuId, price: Number.MAX_SAFE_INTEGER },
      randomUUID(),
    )
    assert.throws(
      () =>
        inventory.command(
          actor,
          'salesOrder.create',
          {
            warehouseId,
            customerReference: 'oversized-order',
            lines: [{ skuId, quantity: 2 }],
          },
          randomUUID(),
        ),
      (error) => error.code === 'AMOUNT_OVERFLOW',
    )
    assert.equal(inventory.snapshot(actor).salesOrders.length, 0)
  })
})

test('sales orders use the tenant inventory price and reject missing or tampered client prices', () => {
  withFixture({}, ({ actor, execute, inventory, sales, warehouseId, skuId }) => {
    const unknownPriceSku = inventory.command(
      actor,
      'sku.create',
      { sku: 'NO-PRICE', name: 'No price' },
      randomUUID(),
    ).result.id
    execute(actor, 'salesOrder.create', {
      warehouseId,
      customerReference: 'customer-price',
      lines: [{ skuId, quantity: 2 }],
    })
    assert.equal(sales.snapshot(actor).salesOrders[0].lines[0].unitPrice, 100)
    assert.throws(
      () =>
        execute(actor, 'salesOrder.create', {
          warehouseId,
          customerReference: 'customer-tampered',
          lines: [{ skuId, quantity: 1, unitPrice: 1 }],
        }),
      (error) => error.code === 'PRICE_MISMATCH',
    )
    assert.throws(
      () =>
        execute(actor, 'salesOrder.create', {
          warehouseId,
          customerReference: 'customer-unknown-price',
          lines: [{ skuId: unknownPriceSku, quantity: 1 }],
        }),
      (error) => error.code === 'PRICE_NOT_SET',
    )
    assert.equal(sales.snapshot(actor).salesOrders.length, 1)
  })
})
