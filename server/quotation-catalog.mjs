import { DomainError } from './database.mjs'
import { boundedText, publicPresentation } from './product-presentation.mjs'

const fail = (status, code, message) => {
  throw new DomainError(status, code, message)
}
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function createQuotationCatalog(db) {
  return {
    load(actor, filters = {}) {
      if (!actor || typeof actor.tenantId !== 'string' || typeof actor.userId !== 'string')
        fail(401, 'UNAUTHENTICATED', 'Cần đăng nhập kho để lấy dữ liệu báo giá.')
      if (!isObject(filters) || Object.keys(filters).some((key) => key !== 'warehouseId'))
        fail(400, 'INVALID_FILTER', 'Báo giá chỉ hỗ trợ lọc kho; doanh nghiệp lấy từ phiên đăng nhập.')
      if (filters.warehouseId !== undefined && !boundedText(filters.warehouseId, 200))
        fail(400, 'INVALID_FILTER', 'Mã kho không hợp lệ.')
      db.exec('BEGIN')
      try {
        const user = db.prepare('SELECT role FROM users WHERE tenant_id=? AND id=? AND active=1').get(actor.tenantId, actor.userId)
        if (!user || actor.role !== undefined && actor.role !== user.role)
          fail(403, 'FORBIDDEN', 'Người dùng không có quyền truy cập dữ liệu doanh nghiệp này.')
        const tenant = db.prepare('SELECT id,name,config_json FROM tenants WHERE id=?').get(actor.tenantId)
        if (!tenant || JSON.parse(tenant.config_json).inventoryEnabled === false)
          fail(403, 'MODULE_DISABLED', 'Phân hệ kho đang tắt; không thể lấy dữ liệu báo giá.')
        const warehouses = db.prepare('SELECT id,code,name FROM warehouses WHERE tenant_id=? AND active=1 ORDER BY name,id').all(actor.tenantId)
        const warehouseId = filters.warehouseId ?? null
        if (warehouseId && !warehouses.some((warehouse) => warehouse.id === warehouseId))
          fail(404, 'NOT_FOUND', 'Kho không tồn tại hoặc đã ngừng hoạt động trong doanh nghiệp.')
        const balances = db.prepare(`SELECT b.sku_id,SUM(b.on_hand-b.reserved-b.damaged-b.warranty) AS available
          FROM balances b JOIN warehouses w ON w.tenant_id=b.tenant_id AND w.id=b.warehouse_id AND w.active=1
          WHERE b.tenant_id=? AND (? IS NULL OR b.warehouse_id=?) GROUP BY b.sku_id`).all(actor.tenantId, warehouseId, warehouseId)
        const availability = new Map(balances.map((row) => [row.sku_id, row.available]))
        const products = db.prepare('SELECT id,sku,name,category,unit,price,price_known,metadata_json,warranty_months FROM inventory_skus WHERE tenant_id=? AND active=1 ORDER BY name,id').all(actor.tenantId).map((row) => {
          const stock = availability.get(row.id) ?? 0
          if (!Number.isSafeInteger(stock) || stock < 0)
            fail(422, 'AMOUNT_OVERFLOW', 'Tồn khả dụng vượt giới hạn số nguyên an toàn.')
          return {
            id: row.id,
            sku: row.sku,
            name: row.name,
            category: row.category,
            unit: row.unit,
            price: row.price_known ? row.price : null,
            stock,
            warrantyMonths: row.warranty_months,
            ...publicPresentation(JSON.parse(row.metadata_json)),
          }
        })
        const result = {
          tenant: { id: tenant.id, name: tenant.name },
          actor: { userId: actor.userId, role: user.role },
          warehouses,
          warehouseId,
          asOf: new Date().toISOString(),
          products,
        }
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}
