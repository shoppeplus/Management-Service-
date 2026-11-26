import type { InventorySalesOrder } from './salesTypes'

export interface Warehouse {
  id: string
  code: string
  name: string
  address: string
  active: boolean | number
}
export interface StorageLocation {
  id: string
  warehouseId: string
  code: string
  name: string
}
export interface Supplier {
  id: string
  code: string
  name: string
  phone?: string
  email?: string
  address?: string
  active?: boolean | number
}
export interface InventorySku {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  serialTracked: boolean | number
  reorderPoint: number
  maxStock: number
  leadTimeDays: number
  warrantyMonths?: number | null
  active: boolean | number
  price?: number
  priceKnown?: boolean | number
  metadata?: {
    imageUrl?: string
    description?: string
    specifications?: { label: string; value: string }[]
    sourceUrl?: string
    [key: string]: unknown
  }
}
export interface StockBalance {
  warehouseId: string
  locationId: string | null
  skuId: string
  onHand: number
  reserved: number
  damaged: number
  warranty: number
  available: number
  inventoryValue: number
  averageCost: number
  updatedAt: string
}
export type DocumentType = 'receipt' | 'issue' | 'transfer' | 'adjustment'
export interface StockDocumentLine {
  id: string
  skuId: string
  locationId: string | null
  targetLocationId: string | null
  quantity: number
  unitCost: number
  inventoryValue: number | null
  serialNumbers: string[]
  purchaseOrderLineId?: string | null
}
export interface StockDocument {
  id: string
  number: string
  type: DocumentType
  status: 'draft' | 'approved' | 'posted' | 'in_transit' | 'received' | 'cancelled'
  warehouseId: string
  targetWarehouseId: string | null
  supplierId: string | null
  reference: string
  reason: string
  createdAt: string
  postedAt: string | null
  sourceDocumentId?: string | null
  purchaseOrderId?: string | null
  lines: StockDocumentLine[]
}
export type PurchaseOrderStatus = 'draft' | 'approved' | 'partial' | 'received' | 'cancelled'
export interface PurchaseOrderLine {
  id: string
  purchaseOrderId: string
  skuId: string
  locationId: string | null
  quantity: number
  unitCost: number
  receivedQuantity: number
  outstandingQuantity: number
  pendingReceiptQuantity: number
}
export interface PurchaseOrder {
  id: string
  number: string
  warehouseId: string
  supplierId: string
  status: PurchaseOrderStatus
  reference: string
  note: string
  createdBy: string
  approvedBy: string | null
  createdAt: string
  approvedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  lines: PurchaseOrderLine[]
  receiptDocumentIds: string[]
}
export interface StockRestockRequestLine {
  id: string
  skuId: string
  requestedQuantity: number
}
export type StockRestockRequestStatus =
  | 'open'
  | 'proposed'
  | 'approved'
  | 'partial'
  | 'received'
  | 'cancelled'
export interface StockRestockRequest {
  id: string
  number: string
  warehouseId: string
  status: StockRestockRequestStatus
  sourceReference: string
  note: string
  createdBy: string
  createdAt: string
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  lines: StockRestockRequestLine[]
}
export interface StockLedgerEntry {
  id: string
  sequence: number
  warehouseId: string
  locationId: string | null
  skuId: string
  documentId: string | null
  countId: string | null
  kind: string
  quantity: number
  valueChange: number
  onHandAfter: number
  valueAfter: number
  createdAt: string
}
export interface Reservation {
  id: string
  warehouseId: string
  skuId: string
  quantity: number
  reference: string
  status: string
}
export interface StockCount {
  id: string
  warehouseId: string
  name: string
  status: string
  createdAt: string
  lines?: {
    skuId: string
    locationId: string | null
    expectedQuantity: number
    countedQuantity: number | null
  }[]
}
export interface TrackedSerial {
  id: string
  serialNumber: string
  skuId: string
  warehouseId: string | null
  status: string
  qualityStatus?: string
  warrantyMonths?: number | null
  warrantyStartAt?: string | null
  warrantyEndAt?: string | null
}
export interface WarrantyCase {
  id: string
  serialId: string
  customerName: string
  issue: string
  status: string
  warrantyValidAtIntake?: boolean | null
  warrantyEndsAt?: string | null
  receivedFromCustomerAt?: string | null
  sourceIssueDocumentId?: string | null
  history?: { status: string; note: string; actorId: string; createdAt: string }[]
}
export interface InventoryAuditEvent {
  id: string
  action: string
  entityId: string
  actorId: string
  createdAt: string
}
export interface InventoryMetrics {
  dailyMovements?: {
    date: string
    receiptQuantity: number
    receiptValue: number
    issueQuantity: number
    issueValue: number
  }[]
  replenishmentSuggestions?: {
    skuId: string
    warehouseId: string
    quantity: number
    available: number
    pendingIncoming: number
    averageDailyIssue: number
    leadTimeDays: number
    reorderPoint: number
    targetStock: number
    rule: string
  }[]
  transferSuggestions?: {
    skuId: string
    fromWarehouseId: string
    toWarehouseId: string
    quantity: number
    rule: string
  }[]
  pendingIncoming?: { skuId: string; warehouseId: string; quantity: number; value: number }[]
  skuActivity?: {
    skuId: string
    warehouseId: string
    issueQuantity30: number
    receiptQuantity30: number
    avgDailyIssue: number
    lastReceiptAt: string | null
    lastIssueAt: string | null
    pendingIncoming: number
    onHand: number
    available: number
    reorderPoint: number
    maxStock: number
    leadTimeDays: number
  }[]
  slowMovingSkuIds?: string[]
  fastMovingSkuIds?: string[]
  staleSkuIds?: string[]
  [key: string]: unknown
}
export interface InventorySnapshot {
  tenant: { id: string; name: string; config: Record<string, unknown> }
  actor: { userId: string; role: string }
  permissions: string[]
  warehouses: Warehouse[]
  locations: StorageLocation[]
  suppliers: Supplier[]
  skus: InventorySku[]
  balances: StockBalance[]
  documents: StockDocument[]
  purchaseRequests: StockRestockRequest[]
  purchaseOrders: PurchaseOrder[]
  salesOrders: InventorySalesOrder[]
  ledger: StockLedgerEntry[]
  reservations: Reservation[]
  counts: StockCount[]
  serials: TrackedSerial[]
  warranties: WarrantyCase[]
  auditEvents: InventoryAuditEvent[]
  metrics: InventoryMetrics
  pagination?: { ledgerLimit: number; nextBeforeSequence: number | null }
  result?: { id: string; number?: string; purchaseOrderId?: string }
}

export interface InventoryTenantConfig {
  inventoryEnabled: boolean
  multiWarehouseEnabled: boolean
  staleDays: number
  [key: string]: unknown
}
