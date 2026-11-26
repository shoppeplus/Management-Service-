// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'
import { createInventory } from './inventory.mjs'

test('bulk product import records opening stock through a posted receipt atomically', () => {
  const db = openDatabase()
  try {
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES (?,?,?)').run(
      'tenant-a',
      'Công ty A',
      new Date().toISOString(),
    )
    for (const role of ['owner', 'receiver'])
      db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES (?,?,?,?)').run(
        `user-${role}`,
        'tenant-a',
        role,
        role,
      )
    const inventory = createInventory(db)
    const owner = { tenantId: 'tenant-a', userId: 'user-owner', role: 'owner' }
    const receiver = { tenantId: 'tenant-a', userId: 'user-receiver', role: 'receiver' }
    const command = (actor, action, input) => inventory.command(actor, action, input, randomUUID())
    const warehouseId = command(owner, 'warehouse.create', {
      code: 'MAIN',
      name: 'Kho chính',
    }).result.id

    const imported = command(receiver, 'sku.import', {
      warehouseId,
      rows: [
        {
          sku: 'BULK-001',
          name: 'Đèn bàn',
          unit: 'Cái',
          quantity: 4,
          cost: 50000,
          reorderPoint: 2,
          maxStock: 20,
          leadTimeDays: 5,
          serialTracked: false,
        },
      ],
    })
    const sku = imported.skus.find((item) => item.sku === 'BULK-001')
    assert.ok(sku)
    assert.equal(sku.reorderPoint, 2)
    assert.equal(sku.maxStock, 20)
    assert.equal(sku.leadTimeDays, 5)
    assert.equal(imported.balances.find((balance) => balance.skuId === sku.id).onHand, 4)
    assert.equal(
      imported.documents.find((document) => document.type === 'receipt').status,
      'posted',
    )

    assert.throws(
      () =>
        command(owner, 'sku.import', {
          warehouseId,
          rows: [
            { sku: 'BULK-002', name: 'Quạt bàn', quantity: 0 },
            { sku: 'BULK-001', name: 'Trùng SKU', quantity: 0 },
          ],
        }),
      (error) => error.code === 'DUPLICATE_SKU',
    )
    assert.equal(
      inventory.snapshot(owner).skus.some((item) => item.sku === 'BULK-002'),
      false,
    )
  } finally {
    db.close()
  }
})
