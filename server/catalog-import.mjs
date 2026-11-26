import { randomUUID } from 'node:crypto'
import { DomainError } from './database.mjs'

const fields = [
  'sku',
  'name',
  'unit',
  'category',
  'price',
  'quantity',
  'cost',
  'metadata',
  'imageUrl',
  'description',
  'sourceUrl',
  'specifications',
  'warrantyMonths',
  'serialTracked',
  'reorderPoint',
  'maxStock',
  'leadTimeDays',
]
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = (code, message, status = 422) => {
  throw new DomainError(status, code, message)
}

// Called inside inventory.command's transaction. Nested commands share that
// transaction, so neither products nor opening stock survive a failed import.
export function importCatalog(db, actor, input, executeInventory) {
  if (!object(input) || Object.keys(input).some((key) => !['warehouseId', 'rows'].includes(key)))
    fail('INVALID_INPUT', 'Nhập Excel chỉ chấp nhận warehouseId và rows.')
  if (
    typeof input.warehouseId !== 'string' ||
    !input.warehouseId.trim() ||
    input.warehouseId.length > 200
  )
    fail('INVALID_INPUT', 'Cần chọn kho hợp lệ để nhập danh mục.')
  if (
    !db
      .prepare('SELECT id FROM warehouses WHERE tenant_id=? AND id=? AND active=1')
      .get(actor.tenantId, input.warehouseId)
  )
    fail('NOT_FOUND', 'Kho không tồn tại hoặc đã ngừng hoạt động trong doanh nghiệp.', 404)
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 500)
    fail('INVALID_INPUT', 'Mỗi lần nhập Excel cần từ 1 đến 500 dòng sản phẩm.')

  const seen = new Set()
  const rows = input.rows.map((row, index) => {
    try {
      if (!object(row) || Object.keys(row).some((key) => !fields.includes(key)))
        fail('INVALID_INPUT', 'Dữ liệu sản phẩm có trường không được hỗ trợ.')
      if (typeof row.sku !== 'string' || !row.sku.trim() || row.sku.length > 50)
        fail('INVALID_INPUT', 'SKU cần từ 1 đến 50 ký tự.')
      const sku = row.sku.trim().toUpperCase()
      if (seen.has(sku)) fail('DUPLICATE_SKU', `SKU ${sku} bị lặp trong file Excel.`, 409)
      seen.add(sku)
      if (
        db
          .prepare('SELECT id FROM inventory_skus WHERE tenant_id=? AND sku=?')
          .get(actor.tenantId, sku)
      )
        fail(
          'DUPLICATE_SKU',
          `SKU ${sku} đã có trong danh mục. Đổi SKU hoặc bỏ dòng này; hệ thống không ghi đè.`,
          409,
        )
      const quantity = row.quantity ?? 0
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000000)
        fail('INVALID_INPUT', 'Tồn đầu kỳ phải là số nguyên từ 0 đến 1.000.000.000.')
      if (quantity > 0 && (!Number.isSafeInteger(row.cost) || row.cost < 0))
        fail(
          'COST_REQUIRED',
          'Cần nhập rõ giá vốn khi tồn đầu kỳ lớn hơn 0. Giá vốn 0 chỉ dùng khi hàng thực sự miễn phí.',
        )
      const product = Object.fromEntries(
        Object.entries(row).filter(
          ([key, value]) => !['quantity', 'cost'].includes(key) && value !== undefined,
        ),
      )
      if (row.cost !== undefined && row.cost !== null) product.cost = row.cost
      return { product: { ...product, sku }, quantity, cost: row.cost, rowNumber: index + 2 }
    } catch (error) {
      if (error instanceof DomainError) error.message = `Dòng ${index + 2}: ${error.message}`
      throw error
    }
  })

  const importId = randomUUID()
  const skuIds = []
  const openingStock = []
  for (const row of rows) {
    try {
      const result = executeInventory(actor, 'sku.create', row.product)
      skuIds.push(result.id)
      if (row.quantity > 0)
        openingStock.push({ skuId: result.id, quantity: row.quantity, unitCost: row.cost })
    } catch (error) {
      if (error instanceof DomainError) error.message = `Dòng ${row.rowNumber}: ${error.message}`
      throw error
    }
  }
  const documentIds = []
  for (let offset = 0; offset < openingStock.length; offset += 200) {
    const receipt = executeInventory(actor, 'document.create', {
      type: 'receipt',
      warehouseId: input.warehouseId,
      reference: `EXCEL-${importId}`,
      reason: 'Nhập tồn đầu kỳ từ danh mục Excel đã kiểm tra',
      lines: openingStock.slice(offset, offset + 200),
    })
    executeInventory(actor, 'document.approve', { id: receipt.id })
    executeInventory(actor, 'document.post', { id: receipt.id })
    documentIds.push(receipt.id)
  }
  return {
    id: importId,
    importedCount: skuIds.length,
    stockedCount: openingStock.length,
    skuIds,
    documentId: documentIds[0] ?? null,
    documentIds,
  }
}
