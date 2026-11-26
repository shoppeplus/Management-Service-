import { describe, expect, it } from 'vitest'
import { returnUnitCost } from './returnValuation'
import type { InventorySnapshot } from './types'

const snapshot = (serialTracked = false): InventorySnapshot => ({
  tenant: { id: 'tenant-a', name: 'A', config: {} },
  actor: { userId: 'user-a', role: 'owner' },
  permissions: [],
  warehouses: [],
  locations: [],
  suppliers: [],
  purchaseRequests: [],
  purchaseOrders: [],
  salesOrders: [],
  balances: [],
  ledger: [],
  reservations: [],
  counts: [],
  serials: [],
  warranties: [],
  auditEvents: [],
  metrics: {},
  skus: [
    {
      id: 'sku-a',
      sku: 'SKU',
      name: 'Item',
      unit: 'unit',
      category: '',
      serialTracked,
      reorderPoint: 0,
      maxStock: 10,
      leadTimeDays: 1,
      active: true,
    },
  ],
  documents: [
    {
      id: 'issue-a',
      number: 'PX-1',
      type: 'issue',
      status: 'posted',
      warehouseId: 'warehouse-a',
      targetWarehouseId: null,
      supplierId: null,
      reference: '',
      reason: '',
      createdAt: '2026-11-17T00:00:00Z',
      postedAt: '2026-11-17T00:00:00Z',
      lines: [
        {
          id: 'line-a',
          skuId: 'sku-a',
          locationId: null,
          targetLocationId: null,
          quantity: 3,
          unitCost: 0,
          inventoryValue: 100,
          serialNumbers: serialTracked ? ['A', 'B', 'C'] : [],
        },
      ],
    },
  ],
})

describe('Return carrying value assistance', () => {
  it('uses remaining original value after earlier nonserial partial returns', () => {
    const data = snapshot()
    data.documents.push({
      ...data.documents[0],
      id: 'return-a',
      type: 'receipt',
      sourceDocumentId: 'issue-a',
      lines: [
        { ...data.documents[0].lines[0], id: 'return-line-a', quantity: 1, inventoryValue: 33 },
      ],
    })
    expect(returnUnitCost(data, 'issue-a', 'sku-a', 1, [])).toBe(34)
    expect(returnUnitCost(data, 'issue-a', 'sku-a', 2, [])).toBe(34)
    expect(returnUnitCost(data, 'issue-a', 'sku-a', 3, [])).toBeNull()
  })
  it('allocates serial remainder consistently with the original issue and rejects missing provenance', () => {
    const data = snapshot(true)
    expect(returnUnitCost(data, 'issue-a', 'sku-a', 1, ['A'])).toBe(34)
    expect(returnUnitCost(data, 'issue-a', 'sku-a', 1, ['B'])).toBe(33)
    expect(returnUnitCost(data, 'issue-a', 'sku-a', 1, ['UNKNOWN'])).toBeNull()
  })
})
