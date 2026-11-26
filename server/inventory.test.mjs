// @vitest-environment node
import { test as vitestTest } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'
import { createInventory } from './inventory.mjs'

const test = (name, work) =>
  vitestTest(name, async () => {
    const cleanup = []
    try {
      await work({ after: (callback) => cleanup.push(callback) })
    } finally {
      for (const callback of cleanup) await callback()
    }
  })

function fixture(t, path = ':memory:') {
  const db = openDatabase(path)
  t.after(() => db.close())
  for (const tenantId of ['tenant-a', 'tenant-b']) {
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES (?,?,?)').run(
      tenantId,
      tenantId,
      new Date().toISOString(),
    )
    for (const role of [
      'owner',
      'manager',
      'accountant',
      'staff',
      'receiver',
      'issuer',
      'counter',
      'approver',
      'viewer',
    ])
      db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES (?,?,?,?)').run(
        `${tenantId}-${role}`,
        tenantId,
        role,
        role,
      )
  }
  const inventory = createInventory(db)
  const actor = { tenantId: 'tenant-a', userId: 'tenant-a-owner', role: 'owner' }
  const command = (action, input, key = randomUUID(), as = actor) =>
    inventory.command(as, action, input, key)
  const warehouse = command('warehouse.create', { code: 'HCM', name: 'Kho Hồ Chí Minh' }).result.id
  const sku = command('sku.create', {
    sku: 'LUMI-HC',
    name: 'Bộ điều khiển trung tâm Lumi',
    cost: 100,
    reorderPoint: 2,
  }).result.id
  const document = (type, lines, extra = {}) =>
    command('document.create', { type, warehouseId: warehouse, lines, ...extra }).result.id
  const post = (documentId) => {
    command('document.approve', { id: documentId })
    return command('document.post', { id: documentId })
  }
  const receipt = (quantity, unitCost = 100, extra = {}) =>
    post(document('receipt', [{ skuId: sku, quantity, unitCost, ...extra }]))
  return { db, inventory, actor, command, warehouse, sku, document, post, receipt }
}

const errorCode = (code) => (error) => error.code === code

async function postInSeparateProcesses(path, actor, documentIds) {
  const databaseUrl = new URL('./database.mjs', import.meta.url).href
  const inventoryUrl = new URL('./inventory.mjs', import.meta.url).href
  const workerCode = `import {openDatabase} from ${JSON.stringify(databaseUrl)}; import {createInventory} from ${JSON.stringify(inventoryUrl)};
    const [path,actor,document,key]=process.argv.slice(1); const db=openDatabase(path); const engine=createInventory(db);
    process.on('message',()=>{let result;try {engine.command(JSON.parse(actor),'document.post',{id:document},key);result={ok:true}}catch(error){result={ok:false,code:error.code,message:error.message}}finally{db.close()};process.send(result,()=>process.exit(0))});process.send({ready:true});`
  const workers = documentIds.map((documentId) => {
    const child = spawn(
      process.execPath,
      [
        '--experimental-sqlite',
        '--input-type=module',
        '-e',
        workerCode,
        path,
        JSON.stringify(actor),
        documentId,
        randomUUID(),
      ],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    )
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const ready = new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('message', (message) => {
        if (message.ready) resolve()
      })
      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited ${code}: ${stderr}`))
      })
    })
    const result = new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('message', (message) => {
        if (!message.ready) resolve(message)
      })
      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited ${code}: ${stderr}`))
      })
    })
    return { child, ready, result }
  })
  await Promise.all(workers.map((worker) => worker.ready))
  for (const worker of workers) worker.child.send('post')
  return Promise.all(workers.map((worker) => worker.result))
}

test('receipts require explicit cost, use integer weighted valuation, immutable ledger and exact retry replay', (t) => {
  const f = fixture(t)
  assert.throws(
    () => f.document('receipt', [{ skuId: f.sku, quantity: 2 }]),
    errorCode('INVALID_INPUT'),
  )
  f.receipt(3, 100)
  const second = f.receipt(2, 200)
  assert.equal(second.balances[0].onHand, 5)
  assert.equal(second.balances[0].inventoryValue, 700)
  assert.equal(second.balances[0].averageCost, 140)
  const issue = f.document('issue', [{ skuId: f.sku, quantity: 2 }])
  f.command('document.approve', { id: issue })
  const key = randomUUID()
  const posted = f.command('document.post', { id: issue }, key)
  assert.equal(posted.balances[0].inventoryValue, 420)
  const replayed = f.command('document.post', { id: issue }, key)
  assert.deepEqual(replayed.result, posted.result)
  assert.deepEqual(replayed.balances, posted.balances)
  assert.deepEqual(replayed.ledger, posted.ledger)
  assert.equal(f.inventory.snapshot(f.actor).ledger.length, 3)
  assert.throws(
    () => f.command('document.cancel', { id: issue }, key),
    errorCode('IDEMPOTENCY_CONFLICT'),
  )
  assert.throws(() => f.command('document.post', { id: issue }), errorCode('INVALID_TRANSITION'))
  assert.throws(() => f.db.prepare('UPDATE ledger SET quantity=99').run(), /immutable/)
  assert.throws(() => f.db.prepare('DELETE FROM ledger').run(), /immutable/)
  assert.throws(() => f.db.prepare('DELETE FROM audit_events').run(), /immutable/)
})

test('tenant isolation and server-side roles apply to every command and snapshot', (t) => {
  const f = fixture(t)
  const other = { tenantId: 'tenant-b', userId: 'tenant-b-owner', role: 'owner' }
  const viewer = { tenantId: 'tenant-a', userId: 'tenant-a-viewer', role: 'viewer' }
  assert.equal(f.inventory.snapshot(other).warehouses.length, 0)
  assert.throws(
    () => f.command('warehouse.update', { id: f.warehouse, name: 'Leaked' }, randomUUID(), other),
    errorCode('NOT_FOUND'),
  )
  assert.throws(
    () => f.command('warehouse.create', { code: 'X', name: 'X' }, randomUUID(), viewer),
    errorCode('FORBIDDEN'),
  )
  assert.throws(() => f.inventory.snapshot({ ...viewer, role: 'owner' }), errorCode('FORBIDDEN'))
  const receiver = { tenantId: 'tenant-a', userId: 'tenant-a-receiver', role: 'receiver' }
  assert.throws(
    () =>
      f.command(
        'document.create',
        { type: 'issue', warehouseId: f.warehouse, lines: [{ skuId: f.sku, quantity: 1 }] },
        randomUUID(),
        receiver,
      ),
    errorCode('FORBIDDEN'),
  )
  assert.deepEqual(f.inventory.snapshot(viewer).permissions, [])
  assert.throws(
    () =>
      f.db
        .prepare(
          'INSERT INTO balances(tenant_id,warehouse_id,location_id,sku_id,on_hand,reserved,inventory_value,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          'tenant-b',
          f.warehouse,
          f.inventory.snapshot(f.actor).locations[0].id,
          f.sku,
          1,
          0,
          0,
          new Date().toISOString(),
        ),
    /FOREIGN KEY/,
  )
})

test('warehouse receivers cannot receive stock before an approved purchase order', (t) => {
  const f = fixture(t)
  const operator = {
    tenantId: 'tenant-a',
    userId: 'tenant-a-receiver',
    role: 'receiver',
  }
  const permissions = f.inventory.snapshot(operator).permissions
  assert.ok(permissions.includes('sku.create'))
  assert.ok(!permissions.includes('document.create'))
  assert.ok(!permissions.includes('document.approve'))
  assert.ok(!permissions.includes('document.post'))
  assert.ok(!permissions.includes('document.cancel'))

  const skuId = f.command(
    'sku.create',
    { sku: 'STOCK-NEW', name: 'Sản phẩm mới' },
    randomUUID(),
    operator,
  ).result.id
  const manager = { tenantId: 'tenant-a', userId: 'tenant-a-manager', role: 'manager' }
  assert.throws(
    () =>
      f.command(
        'document.create',
        {
          type: 'receipt',
          warehouseId: f.warehouse,
          lines: [{ skuId, quantity: 3, unitCost: 200 }],
        },
        randomUUID(),
        manager,
      ),
    errorCode('PURCHASE_ORDER_REQUIRED'),
  )
  const unlinkedReceipt = f.document('receipt', [{ skuId, quantity: 3, unitCost: 200 }])
  const approver = { tenantId: 'tenant-a', userId: 'tenant-a-approver', role: 'approver' }
  assert.throws(
    () => f.command('document.approve', { id: unlinkedReceipt }, randomUUID(), approver),
    errorCode('PURCHASE_ORDER_REQUIRED'),
  )
  assert.throws(
    () =>
      f.command(
        'document.create',
        { type: 'issue', warehouseId: f.warehouse, lines: [{ skuId, quantity: 1 }] },
        randomUUID(),
        operator,
      ),
    errorCode('FORBIDDEN'),
  )
  assert.throws(
    () =>
      f.command(
        'document.create',
        {
          type: 'adjustment',
          warehouseId: f.warehouse,
          reason: 'Chỉnh số lượng',
          lines: [{ skuId, quantity: 1 }],
        },
        randomUUID(),
        operator,
      ),
    errorCode('FORBIDDEN'),
  )
})

test('multi-line posting rolls back all quantities, values, serials, audit and status on one failure', (t) => {
  const f = fixture(t)
  f.receipt(5)
  const second = f.command('sku.create', { sku: 'SECOND', name: 'Thiết bị thứ hai' }).result.id
  const issue = f.document('issue', [
    { skuId: f.sku, quantity: 2 },
    { skuId: second, quantity: 1 },
  ])
  f.command('document.approve', { id: issue })
  const before = f.inventory.snapshot(f.actor)
  assert.throws(() => f.command('document.post', { id: issue }), errorCode('INSUFFICIENT_STOCK'))
  const after = f.inventory.snapshot(f.actor)
  assert.deepEqual(after.balances, before.balances)
  assert.deepEqual(after.ledger, before.ledger)
  assert.deepEqual(after.auditEvents, before.auditEvents)
  assert.equal(after.documents.find((row) => row.id === issue).status, 'approved')
})

test('reservations protect available stock and release exactly once', (t) => {
  const f = fixture(t)
  f.receipt(5)
  const reserved = f.command('reservation.create', {
    warehouseId: f.warehouse,
    skuId: f.sku,
    quantity: 4,
    reference: 'Đơn bán 001',
  })
  assert.equal(reserved.balances[0].available, 1)
  assert.equal(reserved.balances[0].onHand, 5)
  const issue = f.document('issue', [{ skuId: f.sku, quantity: 2 }])
  f.command('document.approve', { id: issue })
  assert.throws(() => f.command('document.post', { id: issue }), errorCode('INSUFFICIENT_STOCK'))
  const released = f.command('reservation.release', { id: reserved.result.id })
  assert.equal(released.balances[0].reserved, 0)
  assert.throws(
    () => f.command('reservation.release', { id: reserved.result.id }),
    errorCode('INVALID_TRANSITION'),
  )
  assert.equal(f.command('document.post', { id: issue }).balances[0].available, 3)
})

test('issue posting consumes a partial reservation atomically and release frees only the remainder', (t) => {
  const f = fixture(t)
  f.receipt(10)
  const held = f.command('reservation.create', {
    warehouseId: f.warehouse,
    skuId: f.sku,
    quantity: 5,
    reference: 'SO-RESERVED',
  }).result.id
  const line = {
    skuId: f.sku,
    quantity: 3,
    reservationAllocations: [{ reservationId: held, quantity: 3 }],
  }
  const cancelled = f.document('issue', [line])
  assert.equal(f.command('document.cancel', { id: cancelled }).reservations[0].quantityRemaining, 5)
  const issue = f.document('issue', [line])
  f.command('document.approve', { id: issue })
  const posted = f.command('document.post', { id: issue })
  expectReservation(posted.reservations[0], {
    status: 'partial',
    quantity: 5,
    quantityRemaining: 2,
    consumedQuantity: 3,
    releasedQuantity: 0,
  })
  assert.equal(posted.balances[0].onHand, 7)
  assert.equal(posted.balances[0].reserved, 2)
  assert.equal(posted.balances[0].available, 5)
  assert.equal(
    posted.documents.find((row) => row.id === issue).lines[0].reservationAllocations[0]
      .consumedAt !== null,
    true,
  )
  const released = f.command('reservation.release', { id: held })
  expectReservation(released.reservations[0], {
    status: 'released',
    quantity: 5,
    quantityRemaining: 0,
    consumedQuantity: 3,
    releasedQuantity: 2,
  })
  assert.equal(released.balances[0].reserved, 0)
  assert.throws(
    () => f.command('reservation.release', { id: held }),
    errorCode('INVALID_TRANSITION'),
  )
})

const expectReservation = (reservation, expected) => {
  for (const [key, value] of Object.entries(expected)) assert.equal(reservation[key], value)
}

test('transfer dispatch tracks in-transit quantity/value and receive does not duplicate stock', (t) => {
  const f = fixture(t)
  f.receipt(5, 111)
  const target = f.command('warehouse.create', { code: 'HN', name: 'Kho Hà Nội' }).result.id
  const transfer = f.document('transfer', [{ skuId: f.sku, quantity: 3 }], {
    targetWarehouseId: target,
  })
  const dispatched = f.post(transfer)
  assert.equal(dispatched.metrics.onHand, 2)
  assert.equal(dispatched.metrics.inTransitQuantity, 3)
  assert.equal(dispatched.metrics.inTransitValue, 333)
  assert.equal(dispatched.metrics.totalInventoryValue, 555)
  const received = f.command('document.transfer_receive', { id: transfer })
  assert.equal(received.metrics.onHand, 5)
  assert.equal(received.metrics.totalInventoryValue, 555)
  assert.equal(received.metrics.inTransitQuantity, 0)
  assert.equal(received.balances.find((row) => row.warehouseId === target).onHand, 3)
  assert.throws(
    () => f.command('document.transfer_receive', { id: transfer }),
    errorCode('INVALID_TRANSITION'),
  )
})

test('serial tracking rejects duplicates, tracks warehouse transfer and warranty workflow', (t) => {
  const f = fixture(t)
  f.command('sku.update', { id: f.sku, serialTracked: true })
  const received = f.receipt(2, 100, { serialNumbers: ['LUMI-0001', 'LUMI-0002'] })
  assert.equal(received.serials.length, 2)
  const duplicate = f.document('receipt', [
    { skuId: f.sku, quantity: 1, unitCost: 100, serialNumbers: ['LUMI-0001'] },
  ])
  f.command('document.approve', { id: duplicate })
  assert.throws(() => f.command('document.post', { id: duplicate }), errorCode('DUPLICATE_SERIAL'))
  assert.equal(f.inventory.snapshot(f.actor).balances[0].onHand, 2)
  assert.throws(
    () => f.command('sku.update', { id: f.sku, serialTracked: false }),
    errorCode('SKU_IN_USE'),
  )
  const target = f.command('warehouse.create', { code: 'HN', name: 'Kho Hà Nội' }).result.id
  const transfer = f.document(
    'transfer',
    [{ skuId: f.sku, quantity: 1, serialNumbers: ['LUMI-0001'] }],
    { targetWarehouseId: target },
  )
  const dispatched = f.post(transfer)
  assert.equal(
    dispatched.serials.find((serial) => serial.serialNumber === 'LUMI-0001').status,
    'in_transit',
  )
  const delivered = f.command('document.transfer_receive', { id: transfer })
  f.command('sku.update', { id: f.sku, warrantyMonths: 24 })
  const issue = f.command('document.create', {
    type: 'issue',
    warehouseId: target,
    lines: [
      {
        skuId: f.sku,
        quantity: 1,
        locationId: delivered.locations.find((item) => item.warehouseId === target).id,
        serialNumbers: ['LUMI-0001'],
      },
    ],
  }).result.id
  f.command('document.approve', { id: issue })
  const issued = f.command('document.post', { id: issue })
  const serial = issued.serials.find((row) => row.serialNumber === 'LUMI-0001')
  assert.equal(serial.warehouseId, target)
  assert.equal(serial.status, 'issued')
  assert.equal(serial.warrantyMonths, 24)
  assert.ok(serial.warrantyEndAt)
  f.command('sku.update', { id: f.sku, warrantyMonths: 0 })
  const warranty = f.command('warranty.create', {
    serialId: serial.id,
    customerName: 'Nguyễn Văn A',
    issue: 'Thiết bị không kết nối mạng',
  }).result.id
  const warrantyRecord = f.inventory.snapshot(f.actor).warranties.find((row) => row.id === warranty)
  assert.equal(warrantyRecord.warrantyValidAtIntake, true)
  assert.equal(warrantyRecord.warrantyEndsAt, serial.warrantyEndAt)
  assert.equal(warrantyRecord.sourceIssueDocumentId, issue)
  assert.throws(
    () => f.command('warranty.transition', { id: warranty, status: 'completed', note: 'Đã sửa' }),
    errorCode('INVALID_TRANSITION'),
  )
  f.command('warranty.transition', {
    id: warranty,
    status: 'repairing',
    note: 'Đã tiếp nhận kiểm tra',
  })
  f.command('warranty.transition', { id: warranty, status: 'completed', note: 'Đã thay mô-đun' })
  assert.equal(
    f.command('warranty.transition', { id: warranty, status: 'returned', note: 'Đã trả khách' })
      .warranties[0].history.length,
    4,
  )
})

test('count approval posts discrepancies atomically and rejects stale observations', (t) => {
  const f = fixture(t)
  f.receipt(5, 100)
  const count = f.command('count.create', { warehouseId: f.warehouse, name: 'Kiểm kê cuối tháng' })
    .result.id
  assert.throws(() => f.command('count.approve', { id: count }), errorCode('COUNT_INCOMPLETE'))
  f.command('count.record', { id: count, lines: [{ skuId: f.sku, countedQuantity: 3 }] })
  const result = f.command('count.approve', { id: count })
  assert.equal(result.balances[0].onHand, 3)
  assert.equal(result.balances[0].inventoryValue, 300)
  assert.equal(result.ledger[0].kind, 'count_adjustment')
  const stale = f.command('count.create', { warehouseId: f.warehouse, name: 'Kiểm kê khác' }).result
    .id
  f.command('count.record', { id: stale, lines: [{ skuId: f.sku, countedQuantity: 3 }] })
  f.receipt(1)
  assert.throws(() => f.command('count.approve', { id: stale }), errorCode('COUNT_STALE'))
})

test('unsafe integers, value overflow and unknown fields fail before mutation', (t) => {
  const f = fixture(t)
  const before = f.inventory.snapshot(f.actor)
  assert.throws(
    () => f.document('receipt', [{ skuId: f.sku, quantity: 2, unitCost: Number.MAX_SAFE_INTEGER }]),
    errorCode('AMOUNT_OVERFLOW'),
  )
  assert.throws(
    () => f.document('receipt', [{ skuId: f.sku, quantity: 1.5, unitCost: 1 }]),
    errorCode('INVALID_INPUT'),
  )
  assert.throws(
    () => f.command('sku.update', { id: f.sku, stock: 999 }),
    errorCode('INVALID_INPUT'),
  )
  assert.deepEqual(f.inventory.snapshot(f.actor).documents, before.documents)
  assert.equal(f.inventory.snapshot(f.actor).ledger.length, 0)
})

test('quality quarantine excludes damaged/warranty from saleable stock and appends audit without changing physical totals', (t) => {
  const f = fixture(t)
  f.receipt(8)
  const reclassified = f.command('quality.reclassify', {
    warehouseId: f.warehouse,
    skuId: f.sku,
    quantity: 3,
    from: 'available',
    to: 'damaged',
    reason: 'Thiết bị vỡ vỏ trong kiểm tra',
  })
  assert.equal(reclassified.balances[0].onHand, 8)
  assert.equal(reclassified.balances[0].available, 5)
  assert.equal(reclassified.balances[0].damaged, 3)
  assert.equal(reclassified.balances[0].inventoryValue, 800)
  assert.equal(reclassified.ledger[0].quantity, 0)
  assert.equal(reclassified.ledger[0].qualityQuantity, 3)
  assert.equal(reclassified.auditEvents[0].action, 'quality.reclassify')
  assert.throws(
    () =>
      f.command('reservation.create', {
        warehouseId: f.warehouse,
        skuId: f.sku,
        quantity: 6,
        reference: 'SO-001',
      }),
    errorCode('INSUFFICIENT_STOCK'),
  )
  const issue = f.document('issue', [{ skuId: f.sku, quantity: 6 }])
  f.command('document.approve', { id: issue })
  assert.throws(() => f.command('document.post', { id: issue }), errorCode('INSUFFICIENT_STOCK'))
  const restored = f.command('quality.reclassify', {
    warehouseId: f.warehouse,
    skuId: f.sku,
    quantity: 2,
    from: 'damaged',
    to: 'available',
    reason: 'Đã sửa và kiểm định đạt chất lượng',
  })
  assert.equal(restored.balances[0].available, 7)
})

test('serial returns require explicit return receipt and existing issued serial', (t) => {
  const f = fixture(t)
  f.command('sku.update', { id: f.sku, serialTracked: true })
  f.receipt(1, 123, { serialNumbers: ['SERIAL-RETURN'] })
  const serial = f.inventory.snapshot(f.actor).serials[0]
  assert.throws(
    () =>
      f.command('warranty.create', {
        serialId: serial.id,
        customerName: 'Khách A',
        issue: 'Thiết bị lỗi cần sửa chữa',
      }),
    errorCode('WARRANTY_QUARANTINE_REQUIRED'),
  )
  const source = f.document('issue', [
    { skuId: f.sku, quantity: 1, serialNumbers: ['SERIAL-RETURN'] },
  ])
  f.post(source)
  const returning = f.document(
    'receipt',
    [{ skuId: f.sku, quantity: 1, unitCost: 123, serialNumbers: ['SERIAL-RETURN'] }],
    {
      returnToStock: true,
      sourceDocumentId: source,
      reference: 'SO-RETURN-001',
      reason: 'Khách trả lại thiết bị sau kiểm tra',
    },
  )
  const result = f.post(returning)
  assert.equal(result.serials.length, 1)
  assert.equal(result.serials[0].status, 'in_stock')
  assert.equal(result.balances[0].onHand, 1)
  assert.equal(result.balances[0].inventoryValue, 123)
})

test('return provenance prevents scrapped serial revival and arbitrary valuation changes', (t) => {
  const f = fixture(t)
  f.command('sku.update', { id: f.sku, serialTracked: true })
  f.receipt(2, 100, { serialNumbers: ['SALE-SERIAL', 'SCRAP-SERIAL'] })
  const source = f.document('issue', [
    { skuId: f.sku, quantity: 1, serialNumbers: ['SALE-SERIAL'] },
  ])
  f.post(source)
  const scrap = f.document(
    'adjustment',
    [{ skuId: f.sku, quantity: -1, serialNumbers: ['SCRAP-SERIAL'] }],
    { reason: 'Thanh lý thiết bị hỏng không sửa được' },
  )
  f.post(scrap)
  assert.throws(
    () =>
      f.document(
        'receipt',
        [{ skuId: f.sku, quantity: 1, unitCost: 100, serialNumbers: ['SCRAP-SERIAL'] }],
        {
          returnToStock: true,
          sourceDocumentId: scrap,
          reference: 'FAKE-SALE',
          reason: 'Thử hoàn một thiết bị đã thanh lý',
        },
      ),
    errorCode('INVALID_RETURN_SOURCE'),
  )
  const wrongSource = f.document(
    'receipt',
    [{ skuId: f.sku, quantity: 1, unitCost: 100, serialNumbers: ['SCRAP-SERIAL'] }],
    {
      returnToStock: true,
      sourceDocumentId: source,
      reference: 'WRONG-SERIAL',
      reason: 'Thử hoàn thiết bị không thuộc phiếu xuất',
    },
  )
  f.command('document.approve', { id: wrongSource })
  assert.throws(
    () => f.command('document.post', { id: wrongSource }),
    errorCode('INVALID_RETURN_SOURCE'),
  )
  const inflated = f.document(
    'receipt',
    [{ skuId: f.sku, quantity: 1, unitCost: 999999, serialNumbers: ['SALE-SERIAL'] }],
    {
      returnToStock: true,
      sourceDocumentId: source,
      reference: 'PRICE-INFLATION',
      reason: 'Thử nâng sai giá trị hàng được nhập trả',
    },
  )
  f.command('document.approve', { id: inflated })
  assert.throws(
    () => f.command('document.post', { id: inflated }),
    errorCode('RETURN_COST_MISMATCH'),
  )
  assert.equal(f.inventory.snapshot(f.actor).metrics.onHand, 0)
})

test('warranty intake marks an expired serial out of coverage from its posted issue snapshot', (t) => {
  const f = fixture(t)
  f.command('sku.update', { id: f.sku, serialTracked: true, warrantyMonths: 12 })
  f.receipt(1, 500, { serialNumbers: ['EXPIRED-WARRANTY'] })
  const source = f.document('issue', [
    { skuId: f.sku, quantity: 1, serialNumbers: ['EXPIRED-WARRANTY'] },
  ])
  f.post(source)
  const serial = f.inventory.snapshot(f.actor).serials[0]
  const oldEnd = new Date(Date.now() - 86400000).toISOString()
  f.db
    .prepare('UPDATE serial_issues SET warranty_ends_at=? WHERE tenant_id=? AND serial_id=?')
    .run(oldEnd, f.actor.tenantId, serial.id)
  f.command('sku.update', { id: f.sku, warrantyMonths: 60 })
  const warranty = f.command('warranty.create', {
    serialId: serial.id,
    customerName: 'Khách hàng A',
    issue: 'Thiết bị không hoạt động',
  })
  const row = warranty.warranties[0]
  assert.equal(row.warrantyValidAtIntake, false)
  assert.equal(row.warrantyEndsAt, oldEnd)
  assert.equal(row.sourceIssueDocumentId, source)
  const completed = f.command('warranty.transition', {
    id: row.id,
    status: 'repairing',
    note: 'Đã tiếp nhận sửa chữa',
  })
  const resolved = f.command('warranty.transition', {
    id: row.id,
    status: 'completed',
    note: 'Đã thay bộ cấp nguồn',
  })
  assert.equal(
    resolved.warranties.find((item) => item.id === row.id).resolution,
    'Đã thay bộ cấp nguồn',
  )
  assert.equal(completed.warranties.find((item) => item.id === row.id).resolution, '')
})

test('nonserial return entitlement is shared across all destination locations and rolls back an excessive return', (t) => {
  const f = fixture(t)
  f.receipt(5, 100)
  const source = f.document('issue', [{ skuId: f.sku, quantity: 5 }])
  f.post(source)
  const position = f.command('location.create', {
    warehouseId: f.warehouse,
    code: 'SECOND',
    name: 'Kệ thứ hai',
  }).result.id
  const returning = f.document(
    'receipt',
    [
      { skuId: f.sku, quantity: 5, unitCost: 100 },
      { skuId: f.sku, locationId: position, quantity: 5, unitCost: 100 },
    ],
    {
      returnToStock: true,
      sourceDocumentId: source,
      reference: 'RETURN-TO-TWO-BINS',
      reason: 'Thử nhập trả vượt lượng đã xuất gốc',
    },
  )
  f.command('document.approve', { id: returning })
  const before = f.inventory.snapshot(f.actor)
  assert.throws(
    () => f.command('document.post', { id: returning }),
    errorCode('RETURN_QUANTITY_EXCEEDED'),
  )
  const after = f.inventory.snapshot(f.actor)
  assert.deepEqual(after.balances, before.balances)
  assert.deepEqual(after.ledger, before.ledger)
  assert.equal(after.metrics.onHand, 0)
})

test('replaying an earlier command never rewinds the current snapshot', (t) => {
  const f = fixture(t)
  const key = randomUUID()
  const input = { id: f.warehouse, name: 'Earlier' }
  const earlier = f.command('warehouse.update', input, key)
  f.command('warehouse.update', { id: f.warehouse, name: 'Latest' })
  const replay = f.command('warehouse.update', input, key)
  assert.deepEqual(replay.result, earlier.result)
  assert.equal(replay.warehouses[0].name, 'Latest')
  assert.equal(replay.auditEvents.filter((row) => row.action === 'warehouse.update').length, 2)
})

test('stale-days configuration uses receipt/issue dates and quality changes do not disguise old stock', (t) => {
  const f = fixture(t)
  const position = f.inventory.snapshot(f.actor).locations[0].id
  const old = new Date(Date.now() - 100 * 86400000).toISOString()
  f.db
    .prepare(
      'INSERT INTO balances(tenant_id,warehouse_id,location_id,sku_id,on_hand,reserved,inventory_value,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(f.actor.tenantId, f.warehouse, position, f.sku, 5, 0, 500, old)
  f.db
    .prepare(
      'INSERT INTO ledger(id,tenant_id,warehouse_id,location_id,sku_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      randomUUID(),
      f.actor.tenantId,
      f.warehouse,
      position,
      f.sku,
      'receipt',
      5,
      500,
      5,
      500,
      f.actor.userId,
      old,
    )
  const changed = f.command('quality.reclassify', {
    warehouseId: f.warehouse,
    skuId: f.sku,
    quantity: 1,
    from: 'available',
    to: 'damaged',
    reason: 'Kiểm tra định kỳ phát hiện thiết bị hỏng',
  })
  assert.equal(changed.metrics.staleBalanceCount, 1)
  assert.equal(changed.balances[0].stale, true)
  assert.ok(changed.balances[0].daysSinceReceiptOrIssue >= 100)
  f.command('config.update', { config: { staleDays: 120 } })
  assert.equal(f.inventory.snapshot(f.actor).metrics.staleBalanceCount, 0)
})

test('positive counts never invent unknown cost and configuration changes enforce behavior', (t) => {
  const f = fixture(t)
  const count = f.command('count.create', {
    warehouseId: f.warehouse,
    name: 'Hàng phát hiện chưa có số dư',
  }).result.id
  f.command('count.record', { id: count, lines: [{ skuId: f.sku, countedQuantity: 2 }] })
  assert.throws(() => f.command('count.approve', { id: count }), errorCode('COUNT_COST_REQUIRED'))
  f.command('count.record', {
    id: count,
    lines: [{ skuId: f.sku, countedQuantity: 2, unitCost: 0 }],
  })
  assert.equal(f.command('count.approve', { id: count }).balances[0].inventoryValue, 0)
  assert.throws(
    () => f.command('config.update', { config: { allowNegativeStock: true } }),
    errorCode('INVALID_INPUT'),
  )
  f.command('config.update', { config: { multiWarehouseEnabled: false } })
  assert.throws(
    () => f.command('warehouse.create', { code: 'HN', name: 'Kho Hà Nội' }),
    errorCode('MULTI_WAREHOUSE_DISABLED'),
  )
  f.command('config.update', { config: { inventoryEnabled: false } })
  assert.throws(
    () => f.command('sku.create', { sku: 'NEW', name: 'New' }),
    errorCode('MODULE_DISABLED'),
  )
  assert.throws(
    () => f.inventory.snapshot({ tenantId: 'tenant-a', userId: 'tenant-a-viewer', role: 'viewer' }),
    errorCode('MODULE_DISABLED'),
  )
  assert.equal(f.inventory.snapshot(f.actor).tenant.config.inventoryEnabled, false)
  f.command('config.update', { config: { inventoryEnabled: true } })
  assert.equal(f.inventory.snapshot(f.actor).tenant.config.inventoryEnabled, true)
})

test('movement analytics aggregate the complete journal beyond ledger pagination and isolate tenants', (t) => {
  const f = fixture(t)
  f.receipt(500, 100)
  const position = f.inventory.snapshot(f.actor).locations[0].id
  const stamp = new Date().toISOString()
  const insert = f.db.prepare(
    'INSERT INTO ledger(id,tenant_id,warehouse_id,location_id,sku_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  )
  f.db.exec('BEGIN IMMEDIATE')
  for (let index = 0; index < 250; index++)
    insert.run(
      randomUUID(),
      f.actor.tenantId,
      f.warehouse,
      position,
      f.sku,
      'issue',
      -1,
      -100,
      499 - index,
      (499 - index) * 100,
      f.actor.userId,
      stamp,
    )
  f.db
    .prepare('UPDATE balances SET on_hand=250,inventory_value=25000 WHERE tenant_id=?')
    .run(f.actor.tenantId)
  f.db.exec('COMMIT')
  const result = f.inventory.snapshot(f.actor, { ledgerLimit: 5 })
  assert.equal(result.ledger.length, 5)
  assert.equal(result.metrics.period30.issueQuantity, 250)
  assert.equal(result.metrics.period30.issueValue, 25000)
  assert.equal(result.metrics.period30.receiptQuantity, 500)
  assert.equal(
    result.metrics.dailyMovements.reduce((sum, day) => sum + day.issueQuantity, 0),
    250,
  )
  assert.equal(result.metrics.dailyMovements.length, 30)
  assert.equal(result.metrics.skuActivity[0].avgDailyIssue, 250 / 30)
  const other = f.inventory.snapshot({
    tenantId: 'tenant-b',
    userId: 'tenant-b-owner',
    role: 'owner',
  })
  assert.equal(other.metrics.period30.issueQuantity, 0)
  assert.equal(other.metrics.period30.receiptValue, 0)
  assert.equal(other.metrics.pendingIncoming.length, 0)
})

test('pending receipts and transfer suggestions use explicit lead-time consumption rules without adding unreceived stock', (t) => {
  const f = fixture(t)
  f.command('sku.update', { id: f.sku, reorderPoint: 5, maxStock: 20, leadTimeDays: 7 })
  f.receipt(20, 100)
  const target = f.command('warehouse.create', { code: 'HN', name: 'Kho Hà Nội' }).result.id
  const pending = f.command('document.create', {
    type: 'receipt',
    warehouseId: target,
    lines: [{ skuId: f.sku, quantity: 2, unitCost: 150 }],
  }).result.id
  const snapshot = f.command('document.approve', { id: pending })
  assert.equal(snapshot.metrics.onHand, 20)
  assert.equal(
    snapshot.metrics.pendingIncoming.find((row) => row.warehouseId === target).quantity,
    2,
  )
  const need = snapshot.metrics.replenishmentSuggestions.find((row) => row.warehouseId === target)
  assert.equal(need.quantity, 3)
  assert.equal(need.targetStock, 5)
  assert.match(need.rule, /Rule-based, not AI/)
  const transfer = snapshot.metrics.transferSuggestions[0]
  assert.equal(transfer.fromWarehouseId, f.warehouse)
  assert.equal(transfer.toWarehouseId, target)
  assert.equal(transfer.quantity, 3)
  f.command('document.cancel', { id: pending })
  assert.equal(f.inventory.snapshot(f.actor).metrics.pendingIncoming.length, 0)
})

test('purchase orders freeze supplier costs, receive partially through linked drafts, and close only on posted quantities', (t) => {
  const f = fixture(t)
  const supplier = f.command('supplier.create', { code: 'LUMI-DIST', name: 'Nhà phân phối Lumi' })
    .result.id
  const secondSku = f.command('sku.create', { sku: 'LUMI-SENSOR', name: 'Cảm biến chuyển động' })
    .result.id
  const created = f.command('purchaseOrder.create', {
    warehouseId: f.warehouse,
    supplierId: supplier,
    reference: 'SUPPLIER-PO-445',
    note: 'Bổ sung hàng tháng',
    lines: [
      { skuId: f.sku, quantity: 5, unitCost: 120000 },
      { skuId: secondSku, quantity: 3, unitCost: 65000 },
    ],
  })
  const orderId = created.result.id
  const order = created.purchaseOrders.find((item) => item.id === orderId)
  assert.equal(order.status, 'draft')
  assert.deepEqual(
    order.lines.map((line) => [line.quantity, line.receivedQuantity, line.outstandingQuantity]),
    [
      [5, 0, 5],
      [3, 0, 3],
    ],
  )
  const approved = f.command('purchaseOrder.approve', { id: orderId })
  assert.equal(approved.purchaseOrders.find((item) => item.id === orderId).status, 'approved')
  assert.equal(approved.metrics.onHand, 0)
  assert.equal(
    approved.metrics.pendingIncoming.reduce((sum, row) => sum + row.quantity, 0),
    8,
  )
  const firstLine = approved.purchaseOrders.find((item) => item.id === orderId).lines[0]
  const receivingInput = {
    id: orderId,
    lines: [{ purchaseOrderLineId: firstLine.id, quantity: 2 }],
  }
  const receiveKey = randomUUID()
  const staged = f.command('purchaseOrder.receive', receivingInput, receiveKey)
  const replay = f.command('purchaseOrder.receive', receivingInput, receiveKey)
  assert.equal(replay.result.id, staged.result.id)
  assert.equal(
    replay.documents.filter((document) => document.purchaseOrderId === orderId).length,
    1,
  )
  assert.equal(staged.metrics.onHand, 0)
  const receipt = staged.documents.find((document) => document.id === staged.result.id)
  assert.equal(receipt.status, 'draft')
  assert.equal(receipt.purchaseOrderId, orderId)
  assert.equal(receipt.lines[0].purchaseOrderLineId, firstLine.id)
  assert.equal(receipt.lines[0].unitCost, 120000)
  assert.equal(
    staged.purchaseOrders.find((item) => item.id === orderId).lines[0].pendingReceiptQuantity,
    2,
  )
  f.command('document.approve', { id: receipt.id })
  const firstPosted = f.command('document.post', { id: receipt.id })
  assert.equal(firstPosted.purchaseOrders.find((item) => item.id === orderId).status, 'partial')
  assert.equal(
    firstPosted.purchaseOrders.find((item) => item.id === orderId).lines[0].receivedQuantity,
    2,
  )
  assert.equal(
    firstPosted.balances.find((balance) => balance.skuId === f.sku).inventoryValue,
    240000,
  )
  const partialLine = firstPosted.purchaseOrders.find((item) => item.id === orderId).lines[0]
  const lastReceipt = f.command('purchaseOrder.receive', {
    id: orderId,
    lines: [
      { purchaseOrderLineId: partialLine.id, quantity: 3 },
      {
        purchaseOrderLineId: firstPosted.purchaseOrders.find((item) => item.id === orderId).lines[1]
          .id,
        quantity: 3,
      },
    ],
  })
  f.command('document.approve', { id: lastReceipt.result.id })
  const completed = f.command('document.post', { id: lastReceipt.result.id })
  const finalOrder = completed.purchaseOrders.find((item) => item.id === orderId)
  assert.equal(finalOrder.status, 'received')
  assert.equal(finalOrder.lines[0].receivedQuantity, 5)
  assert.equal(finalOrder.lines[1].receivedQuantity, 3)
  assert.equal(finalOrder.lines[0].outstandingQuantity, 0)
  assert.deepEqual(finalOrder.receiptDocumentIds.sort(), [receipt.id, lastReceipt.result.id].sort())
  assert.equal(completed.balances.find((balance) => balance.skuId === f.sku).onHand, 5)
  assert.equal(completed.balances.find((balance) => balance.skuId === f.sku).inventoryValue, 600000)
  assert.throws(
    () =>
      f.command('purchaseOrder.receive', {
        id: orderId,
        lines: [{ purchaseOrderLineId: partialLine.id, quantity: 1 }],
      }),
    errorCode('INVALID_TRANSITION'),
  )
})

test('purchase receipt drafts reserve cumulative outstanding quantity and multiline posting failure rolls back', (t) => {
  const f = fixture(t)
  const supplier = f.command('supplier.create', { code: 'VENDOR-2', name: 'Nhà cung cấp số hai' })
    .result.id
  const secondSku = f.command('sku.create', { sku: 'LUMI-SECOND', name: 'Sản phẩm thứ hai' }).result
    .id
  const orderId = f.command('purchaseOrder.create', {
    warehouseId: f.warehouse,
    supplierId: supplier,
    lines: [
      { skuId: f.sku, quantity: 5, unitCost: 100 },
      { skuId: secondSku, quantity: 5, unitCost: 200 },
    ],
  }).result.id
  const approved = f.command('purchaseOrder.approve', { id: orderId })
  const lines = approved.purchaseOrders.find((item) => item.id === orderId).lines
  const first = f.command('purchaseOrder.receive', {
    id: orderId,
    lines: [{ purchaseOrderLineId: lines[0].id, quantity: 4 }],
  })
  assert.throws(
    () =>
      f.command('purchaseOrder.receive', {
        id: orderId,
        lines: [{ purchaseOrderLineId: lines[0].id, quantity: 2 }],
      }),
    errorCode('PURCHASE_OVER_RECEIPT'),
  )
  f.command('document.approve', { id: first.result.id })
  assert.throws(
    () => f.command('purchaseOrder.cancel', { id: orderId }),
    errorCode('PURCHASE_RECEIPT_PENDING'),
  )
  f.command('document.cancel', { id: first.result.id })
  const staged = f.command('purchaseOrder.receive', {
    id: orderId,
    lines: [
      { purchaseOrderLineId: lines[0].id, quantity: 2 },
      { purchaseOrderLineId: lines[1].id, quantity: 2 },
    ],
  })
  f.command('document.approve', { id: staged.result.id })
  f.db
    .prepare('UPDATE purchase_order_lines SET quantity=1 WHERE tenant_id=? AND id=?')
    .run(f.actor.tenantId, lines[1].id)
  const before = f.inventory.snapshot(f.actor)
  assert.throws(
    () => f.command('document.post', { id: staged.result.id }),
    errorCode('PURCHASE_OVER_RECEIPT'),
  )
  const after = f.inventory.snapshot(f.actor)
  assert.deepEqual(after.balances, before.balances)
  assert.deepEqual(after.ledger, before.ledger)
  assert.equal(
    after.purchaseOrders.find((item) => item.id === orderId).lines[0].receivedQuantity,
    0,
  )
  assert.equal(
    after.documents.find((document) => document.id === staged.result.id).status,
    'approved',
  )
  assert.equal(after.metrics.onHand, 0)
})

test('purchase order tenant, supplier, and role boundaries are revalidated server side', (t) => {
  const f = fixture(t)
  const supplier = f.command('supplier.create', {
    code: 'LOCAL-VENDOR',
    name: 'Nhà cung cấp địa phương',
  }).result.id
  const orderId = f.command('purchaseOrder.create', {
    warehouseId: f.warehouse,
    supplierId: supplier,
    lines: [{ skuId: f.sku, quantity: 2, unitCost: 50 }],
  }).result.id
  const foreignOwner = { tenantId: 'tenant-b', userId: 'tenant-b-owner', role: 'owner' }
  assert.throws(
    () => f.command('purchaseOrder.approve', { id: orderId }, randomUUID(), foreignOwner),
    errorCode('NOT_FOUND'),
  )
  f.command('supplier.update', { id: supplier, active: false })
  assert.throws(
    () => f.command('purchaseOrder.approve', { id: orderId }),
    errorCode('SUPPLIER_INACTIVE'),
  )
  assert.throws(
    () =>
      f.command('purchaseOrder.create', {
        warehouseId: f.warehouse,
        supplierId: 'foreign-supplier',
        lines: [{ skuId: f.sku, quantity: 1, unitCost: 10 }],
      }),
    errorCode('NOT_FOUND'),
  )
  const receiver = { tenantId: 'tenant-a', userId: 'tenant-a-receiver', role: 'receiver' }
  assert.throws(
    () =>
      f.command(
        'purchaseOrder.create',
        {
          warehouseId: f.warehouse,
          supplierId: supplier,
          lines: [{ skuId: f.sku, quantity: 1, unitCost: 10 }],
        },
        randomUUID(),
        receiver,
      ),
    errorCode('FORBIDDEN'),
  )
})

test('restock requests flow from staff through manager proposal and accountant approval to manager receipt', (t) => {
  const f = fixture(t)
  const staff = { tenantId: 'tenant-a', userId: 'tenant-a-staff', role: 'staff' }
  const manager = { tenantId: 'tenant-a', userId: 'tenant-a-manager', role: 'manager' }
  const accountant = {
    tenantId: 'tenant-a',
    userId: 'tenant-a-accountant',
    role: 'accountant',
  }
  const supplier = f.command('supplier.create', {
    code: 'RESTOCK-VENDOR',
    name: 'Nhà cung cấp bổ sung',
  }).result.id
  const request = f.command(
    'purchaseRequest.create',
    {
      warehouseId: f.warehouse,
      sourceReference: 'conversation:conv-1',
      lines: [{ skuId: f.sku, requestedQuantity: 4 }],
    },
    randomUUID(),
    staff,
  )
  const requestId = request.result.id
  assert.equal(request.purchaseRequests.find((item) => item.id === requestId).status, 'open')
  assert.equal(
    f.inventory.snapshot(staff).purchaseRequests.some((item) => item.id === requestId),
    true,
  )
  assert.equal(f.inventory.snapshot(staff).purchaseOrders.length, 0)
  assert.equal(
    f.inventory.snapshot(manager).purchaseRequests.some((item) => item.id === requestId),
    true,
  )
  assert.equal(f.inventory.snapshot(accountant).purchaseRequests.length, 0)
  assert.throws(
    () =>
      f.command(
        'purchaseOrder.create',
        {
          warehouseId: f.warehouse,
          supplierId: supplier,
          lines: [{ skuId: f.sku, quantity: 4, unitCost: 100 }],
        },
        randomUUID(),
        staff,
      ),
    errorCode('FORBIDDEN'),
  )
  assert.throws(
    () =>
      f.command(
        'purchaseOrder.create',
        {
          warehouseId: f.warehouse,
          supplierId: supplier,
          restockRequestId: requestId,
          lines: [{ skuId: f.sku, quantity: 3, unitCost: 100 }],
        },
        randomUUID(),
        manager,
      ),
    errorCode('REQUEST_LINES_INCOMPLETE'),
  )
  const proposal = f.command(
    'purchaseOrder.create',
    {
      warehouseId: f.warehouse,
      supplierId: supplier,
      restockRequestId: requestId,
      lines: [{ skuId: f.sku, quantity: 4, unitCost: 100 }],
    },
    randomUUID(),
    manager,
  )
  const orderId = proposal.result.id
  assert.equal(
    proposal.purchaseRequests.find((item) => item.id === requestId).status,
    'proposed',
  )
  assert.equal(
    f.inventory.snapshot(staff).purchaseRequests.find((item) => item.id === requestId).status,
    'proposed',
  )
  assert.throws(
    () => f.command('purchaseOrder.approve', { id: orderId }, randomUUID(), manager),
    errorCode('FORBIDDEN'),
  )
  const approved = f.command(
    'purchaseOrder.approve',
    { id: orderId },
    randomUUID(),
    accountant,
  )
  assert.equal(approved.purchaseOrders.find((item) => item.id === orderId).status, 'approved')
  assert.equal(approved.purchaseRequests.length, 0)
  assert.equal(
    f.inventory.snapshot(manager).purchaseRequests.find((item) => item.id === requestId).status,
    'approved',
  )
  const approvedLine = approved.purchaseOrders.find((item) => item.id === orderId).lines[0]
  const receipt = f.command(
    'purchaseOrder.receive',
    {
      id: orderId,
      lines: [{ purchaseOrderLineId: approvedLine.id, quantity: 4 }],
    },
    randomUUID(),
    manager,
  )
  assert.equal(receipt.documents.find((item) => item.id === receipt.result.id).status, 'draft')
  assert.equal(receipt.metrics.onHand, 0)
  const receiptApprover = { tenantId: 'tenant-a', userId: 'tenant-a-approver', role: 'approver' }
  assert.throws(
    () =>
      f.command(
        'document.approve',
        { id: receipt.result.id },
        randomUUID(),
        receiptApprover,
      ),
    errorCode('FORBIDDEN'),
  )
  f.command('document.approve', { id: receipt.result.id }, randomUUID(), manager)
  const posted = f.command('document.post', { id: receipt.result.id }, randomUUID(), manager)
  assert.equal(posted.metrics.onHand, 4)
  assert.equal(
    posted.purchaseRequests.find((item) => item.id === requestId).status,
    'received',
  )
})

test('concurrent PO receipt posts serialize without over-receiving ordered quantity', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'smartsales-po-concurrent-'))
  const path = join(folder, 'inventory.sqlite')
  const f = fixture(t, path)
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  const supplier = f.command('supplier.create', {
    code: 'CONCURRENT-PO',
    name: 'Nhà cung cấp cạnh tranh',
  }).result.id
  const orderId = f.command('purchaseOrder.create', {
    warehouseId: f.warehouse,
    supplierId: supplier,
    lines: [{ skuId: f.sku, quantity: 8, unitCost: 90 }],
  }).result.id
  const approved = f.command('purchaseOrder.approve', { id: orderId })
  const lineId = approved.purchaseOrders.find((item) => item.id === orderId).lines[0].id
  const first = f.command('purchaseOrder.receive', {
    id: orderId,
    lines: [{ purchaseOrderLineId: lineId, quantity: 4 }],
  }).result.id
  const second = f.command('purchaseOrder.receive', {
    id: orderId,
    lines: [{ purchaseOrderLineId: lineId, quantity: 4 }],
  }).result.id
  f.command('document.approve', { id: first })
  f.command('document.approve', { id: second })
  const results = await postInSeparateProcesses(path, f.actor, [first, second])
  assert.equal(results.filter((result) => result.ok).length, 2)
  const snapshot = f.inventory.snapshot(f.actor)
  const order = snapshot.purchaseOrders.find((item) => item.id === orderId)
  assert.equal(order.status, 'received')
  assert.equal(order.lines[0].receivedQuantity, 8)
  assert.equal(snapshot.balances[0].onHand, 8)
  assert.equal(snapshot.balances[0].inventoryValue, 720)
  assert.equal(snapshot.ledger.filter((entry) => entry.kind === 'receipt').length, 2)
})

test('concurrent issues cannot consume the same reservation twice', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'smartsales-reservation-concurrent-'))
  const path = join(folder, 'inventory.sqlite')
  const f = fixture(t, path)
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  f.receipt(10)
  const held = f.command('reservation.create', {
    warehouseId: f.warehouse,
    skuId: f.sku,
    quantity: 5,
    reference: 'SO-COMPETING',
  }).result.id
  const line = {
    skuId: f.sku,
    quantity: 3,
    reservationAllocations: [{ reservationId: held, quantity: 3 }],
  }
  const issues = [f.document('issue', [line]), f.document('issue', [line])]
  for (const issue of issues) f.command('document.approve', { id: issue })
  const results = await postInSeparateProcesses(path, f.actor, issues)
  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(results.find((result) => !result.ok).code, 'RESERVATION_UNAVAILABLE')
  const snapshot = f.inventory.snapshot(f.actor)
  assert.equal(snapshot.reservations[0].quantityRemaining, 2)
  assert.equal(snapshot.reservations[0].consumedQuantity, 3)
  assert.equal(snapshot.balances[0].onHand, 7)
  assert.equal(snapshot.balances[0].reserved, 2)
  assert.equal(snapshot.balances[0].available, 5)
  assert.equal(snapshot.ledger.filter((entry) => entry.kind === 'issue').length, 1)
})

test('file-backed state survives reopening and checksum migrations apply exactly once', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'smartsales-reopen-'))
  const path = join(folder, 'inventory.sqlite')
  let db = openDatabase(path)
  t.after(() => {
    db.close()
    rmSync(folder, { recursive: true, force: true })
  })
  db.prepare('INSERT INTO tenants(id,name,created_at) VALUES (?,?,?)').run(
    'persisted',
    'Doanh nghiệp thật',
    new Date().toISOString(),
  )
  db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES (?,?,?,?)').run(
    'owner',
    'persisted',
    'Owner',
    'owner',
  )
  const actor = { tenantId: 'persisted', userId: 'owner', role: 'owner' }
  const warehouse = createInventory(db).command(
    actor,
    'warehouse.create',
    { code: 'PERSIST', name: 'Kho lưu bền' },
    randomUUID(),
  ).result.id
  const migrationCount = db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal')
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  db.close()
  db = openDatabase(path)
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total,
    migrationCount,
  )
  const snapshot = createInventory(db).snapshot(actor)
  assert.equal(snapshot.warehouses[0].id, warehouse)
  assert.equal(snapshot.auditEvents[0].action, 'warehouse.create')
})

test('actual independent processes cannot oversell the same file-backed balance', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'smartsales-inventory-'))
  const path = join(folder, 'inventory.sqlite')
  const f = fixture(t, path)
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  f.receipt(5)
  const issues = [0, 1].map(() => {
    const document = f.document('issue', [{ skuId: f.sku, quantity: 4 }])
    f.command('document.approve', { id: document })
    return document
  })
  const databaseUrl = new URL('./database.mjs', import.meta.url).href
  const inventoryUrl = new URL('./inventory.mjs', import.meta.url).href
  const workerCode = `import {openDatabase} from ${JSON.stringify(databaseUrl)}; import {createInventory} from ${JSON.stringify(inventoryUrl)};
    const [path,actor,document,key]=process.argv.slice(1); const db=openDatabase(path); const engine=createInventory(db);
    process.on('message',()=>{let result;try {engine.command(JSON.parse(actor),'document.post',{id:document},key);result={ok:true}}catch(error){result={ok:false,code:error.code,message:error.message}}finally{db.close()};process.send(result,()=>process.exit(0))});process.send({ready:true});`
  const workers = issues.map((document) => {
    const child = spawn(
      process.execPath,
      [
        '--experimental-sqlite',
        '--input-type=module',
        '-e',
        workerCode,
        path,
        JSON.stringify(f.actor),
        document,
        randomUUID(),
      ],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    )
    t.after(() => {
      if (child.exitCode === null) child.kill()
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const ready = new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('message', (message) => {
        if (message.ready) resolve()
      })
      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited ${code}: ${stderr}`))
      })
    })
    const result = new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('message', (message) => {
        if (!message.ready) resolve(message)
      })
      child.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker exited ${code}: ${stderr}`))
      })
    })
    return { child, ready, result }
  })
  await Promise.all(workers.map((worker) => worker.ready))
  for (const worker of workers) worker.child.send('post')
  const results = await Promise.all(workers.map((worker) => worker.result))
  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(results.find((result) => !result.ok).code, 'INSUFFICIENT_STOCK')
  const snapshot = f.inventory.snapshot(f.actor)
  assert.equal(snapshot.balances[0].onHand, 1)
  assert.equal(snapshot.balances[0].inventoryValue, 100)
  assert.equal(snapshot.ledger.length, 2)
  assert.equal(snapshot.documents.filter((document) => document.status === 'posted').length, 2)
})
