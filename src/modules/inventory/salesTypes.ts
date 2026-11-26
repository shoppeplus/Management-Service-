export interface InventorySalesLine {
  id: string
  skuId: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
  locationId: string
  reservationId: string | null
  returnedQuantity: number
  returnableQuantity: number
}

export interface InventorySalesOrder {
  id: string
  number: string
  warehouseId: string
  customerReference: string
  reference: string
  note: string
  status: 'draft' | 'confirmed' | 'fulfilled' | 'returned' | 'cancelled'
  fulfillmentDocumentId: string | null
  createdAt: string
  lines: InventorySalesLine[]
}
