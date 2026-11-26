// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'
import { createInventory } from './inventory.mjs'

describe('composed inventory and sales application', () => {
  it('reserves and fulfills a sales order through audited, idempotent stock commands', () => {
    const db = openDatabase()
    try {
      db.prepare('INSERT INTO tenants(id,name,created_at) VALUES (?,?,?)').run(
        'tenant-a',
        'Company A',
        '2026-01-01T00:00:00.000Z',
      )
      db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES (?,?,?,?)').run(
        'user-a',
        'tenant-a',
        'Owner',
        'owner',
      )
      db.prepare('INSERT INTO tenants(id,name,created_at) VALUES (?,?,?)').run(
        'tenant-b',
        'Company B',
        '2026-01-01T00:00:00.000Z',
      )
      db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES (?,?,?,?)').run(
        'user-b',
        'tenant-b',
        'Owner B',
        'owner',
      )
      const actor = { tenantId: 'tenant-a', userId: 'user-a', role: 'owner' }
      const inventory = createInventory(db)
      const command = (action, input, key = randomUUID()) =>
        inventory.command(actor, action, input, key)

      const warehouseId = command('warehouse.create', {
        code: 'MAIN',
        name: 'Main warehouse',
      }).result.id
      const skuId = command('sku.create', {
        sku: 'SMART-001',
        name: 'Smart device',
        price: 2500,
      }).result.id
      const receiptId = command('document.create', {
        type: 'receipt',
        warehouseId,
        lines: [{ skuId, quantity: 8, unitCost: 1000 }],
      }).result.id
      command('document.approve', { id: receiptId })
      command('document.post', { id: receiptId })

      const createKey = 'sales-order-create-001'
      const salesInput = {
        warehouseId,
        customerReference: 'Customer 24',
        reference: 'EXT-24',
        lines: [{ skuId, quantity: 3 }],
      }
      const created = command('salesOrder.create', salesInput, createKey)
      const replayed = command('salesOrder.create', salesInput, createKey)
      expect(replayed.result).toEqual(created.result)
      expect(replayed.salesOrders).toHaveLength(1)

      command('salesOrder.confirm', { id: created.result.id })
      expect(inventory.snapshot(actor).balances[0]).toMatchObject({
        onHand: 8,
        reserved: 3,
        available: 5,
      })

      const fulfilled = command('salesOrder.fulfill', { id: created.result.id })
      expect(fulfilled.salesOrders[0]).toMatchObject({ status: 'fulfilled' })
      expect(
        fulfilled.documents.find((document) => document.id === fulfilled.result.documentId),
      ).toMatchObject({
        type: 'issue',
        status: 'posted',
      })
      expect(fulfilled.balances[0]).toMatchObject({
        onHand: 5,
        reserved: 0,
        available: 5,
        inventoryValue: 5000,
      })

      const actions = fulfilled.auditEvents.map((event) => event.action)
      expect(actions).toEqual(
        expect.arrayContaining([
          'salesOrder.create',
          'salesOrder.confirm',
          'salesOrder.fulfill',
          'reservation.create',
          'document.create',
          'document.approve',
          'document.post',
        ]),
      )
      expect(
        inventory.snapshot({ tenantId: 'tenant-a', userId: 'user-a', role: 'owner' }).salesOrders,
      ).toHaveLength(1)
      expect(
        inventory.snapshot({ tenantId: 'tenant-b', userId: 'user-b', role: 'owner' }).salesOrders,
      ).toEqual([])
    } finally {
      db.close()
    }
  })
})
