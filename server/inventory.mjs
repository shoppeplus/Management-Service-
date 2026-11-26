import { createHash, randomUUID } from 'node:crypto'
import { DomainError, transaction } from './database.mjs'
import { createSales } from './sales.mjs'
import { updatePresentation } from './product-presentation.mjs'
import { importCatalog } from './catalog-import.mjs'
import { ALL_PERMISSIONS, permissionsForUser } from './access-control.mjs'

const fail = (code, message, status = 422) => {
  throw new DomainError(status, code, message)
}
const own = (value, key) => Object.hasOwn(value, key)
const now = () => new Date().toISOString()
const id = () => randomUUID()
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, label, min = 0, max = 500) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)),
    )
  )
    fail('INVALID_INPUT', `${label}: không hợp lệ (tối đa ${max} ký tự).`)
  return value.trim()
}
const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail('INVALID_INPUT', `${label}: phải là số nguyên từ ${min} đến ${max}.`)
  return value
}
const bool = (value, label) => {
  if (typeof value !== 'boolean') fail('INVALID_INPUT', `${label}: phải là true hoặc false.`)
  return value ? 1 : 0
}
const safe = (value) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    fail('AMOUNT_OVERFLOW', 'Số lượng hoặc giá trị vượt giới hạn số nguyên an toàn.')
  return Number(value)
}
const add = (a, b) => safe(BigInt(a) + BigInt(b))
const multiply = (a, b) => safe(BigInt(a) * BigInt(b))
const proportionalValue = (value, quantity, onHand) =>
  quantity === onHand
    ? value
    : safe((BigInt(value) * BigInt(quantity) + BigInt(onHand) / 2n) / BigInt(onHand))
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : object(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
const keys = (input, allowed) => {
  if (!object(input) || Object.keys(input).some((key) => !allowed.includes(key)))
    fail('INVALID_INPUT', 'Thông tin yêu cầu có trường không được hỗ trợ.')
}
const jsonObject = (value, label) => {
  if (!object(value)) fail('INVALID_INPUT', `${label}: cần một object JSON.`)
  const serialized = JSON.stringify(value)
  if (serialized.length > 50000 || /"(?:__proto__|prototype|constructor)"\s*:/.test(serialized))
    fail('INVALID_INPUT', `${label}: cấu trúc không được hỗ trợ.`)
  return serialized
}
export const DEFAULT_INVENTORY_CONFIG = {
  inventoryEnabled: true,
  multiWarehouseEnabled: true,
  staleDays: 90,
}
function validateConfig(input) {
  keys(input, Object.keys(DEFAULT_INVENTORY_CONFIG))
  const result = { ...input }
  for (const field of ['inventoryEnabled', 'multiWarehouseEnabled'])
    if (own(result, field)) bool(result[field], field)
  if (own(result, 'staleDays')) integer(result.staleDays, 'Số ngày tồn lâu', 1, 3650)
  return result
}
const camel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
function record(row) {
  if (!row) return null
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== 'tenant_id')
      .map(([key, value]) => {
        if (key.endsWith('_json')) return [camel(key.slice(0, -5)), JSON.parse(value)]
        if (
          [
            'active',
            'serial_tracked',
            'is_default',
            'return_to_stock',
            'warranty_valid_at_intake',
          ].includes(key)
        )
          return [camel(key), value === null ? null : Boolean(value)]
        return [camel(key), value]
      }),
  )
}

export function createInventory(db) {
  const get = (sql, ...values) => db.prepare(sql).get(...values)
  const all = (sql, ...values) => db.prepare(sql).all(...values)
  const run = (sql, ...values) => db.prepare(sql).run(...values)
  const configuration = (tenantId) => ({
    ...DEFAULT_INVENTORY_CONFIG,
    ...JSON.parse(get('SELECT config_json FROM tenants WHERE id=?', tenantId).config_json),
  })
  const authorize = (actor, action) => {
    if (!actor || typeof actor.tenantId !== 'string' || typeof actor.userId !== 'string')
      fail('UNAUTHENTICATED', 'Cần đăng nhập để truy cập kho.', 401)
    const user = get(
      'SELECT * FROM users WHERE tenant_id = ? AND id = ? AND active = 1',
      actor.tenantId,
      actor.userId,
    )
    if (!user || (actor.role !== undefined && actor.role !== user.role))
      fail('FORBIDDEN', 'Người dùng không có quyền truy cập doanh nghiệp này.', 403)
    const permissions = permissionsForUser(db, user.tenant_id, user.id, user.role)
    if (action && !permissions.includes(action))
      fail('FORBIDDEN', 'Vai trò của bạn không được thực hiện thao tác này.', 403)
    if (
      !configuration(actor.tenantId).inventoryEnabled &&
      (action ? action !== 'config.update' : !['owner', 'admin'].includes(user.role))
    )
      fail('MODULE_DISABLED', 'Phân hệ kho đang tắt trong cấu hình doanh nghiệp.', 403)
    return { ...actor, role: user.role, permissions }
  }
  const requireRecord = (table, tenantId, entityId, label) => {
    text(entityId, 'ID', 1, 200)
    return (
      get(`SELECT * FROM ${table} WHERE tenant_id = ? AND id = ?`, tenantId, entityId) ??
      fail('NOT_FOUND', `${label} không tồn tại trong doanh nghiệp.`, 404)
    )
  }
  const warehouse = (actor, entityId) => {
    const row = requireRecord('warehouses', actor.tenantId, entityId, 'Kho')
    if (!row.active) fail('WAREHOUSE_INACTIVE', 'Kho đã ngừng hoạt động.')
    return row
  }
  const sku = (actor, entityId) => {
    const row = requireRecord('inventory_skus', actor.tenantId, entityId, 'SKU')
    if (!row.active) fail('SKU_INACTIVE', 'SKU đã ngừng hoạt động.')
    return row
  }
  const location = (actor, warehouseId, locationId) => {
    const row = locationId
      ? get(
          'SELECT * FROM locations WHERE tenant_id = ? AND warehouse_id = ? AND id = ?',
          actor.tenantId,
          warehouseId,
          text(locationId, 'Vị trí', 1, 200),
        )
      : get(
          'SELECT * FROM locations WHERE tenant_id = ? AND warehouse_id = ? AND is_default = 1',
          actor.tenantId,
          warehouseId,
        )
    return row ?? fail('INVALID_LOCATION', 'Vị trí không thuộc kho đã chọn.')
  }
  const balance = (actor, warehouseId, locationId, skuId) =>
    get(
      'SELECT * FROM balances WHERE tenant_id = ? AND warehouse_id = ? AND location_id = ? AND sku_id = ?',
      actor.tenantId,
      warehouseId,
      locationId,
      skuId,
    ) ?? { on_hand: 0, reserved: 0, inventory_value: 0, damaged: 0, warranty: 0 }
  const audit = (actor, action, entityId, details) =>
    run(
      'INSERT INTO audit_events(id,tenant_id,actor_id,action,entity_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)',
      id(),
      actor.tenantId,
      actor.userId,
      action,
      entityId,
      JSON.stringify(details),
      now(),
    )
  const ledgerSequence = (actor, warehouseId) =>
    get(
      'SELECT COALESCE(MAX(sequence),0) AS sequence FROM ledger WHERE tenant_id = ? AND warehouse_id = ?',
      actor.tenantId,
      warehouseId,
    ).sequence
  const movement = (actor, input) => {
    const previous = balance(actor, input.warehouseId, input.locationId, input.skuId)
    const nextQuantity = add(previous.on_hand, input.quantity)
    if (nextQuantity < previous.reserved + previous.damaged + previous.warranty || nextQuantity < 0)
      fail(
        'INSUFFICIENT_STOCK',
        'Tồn khả dụng không đủ. Không được xuất hàng đã giữ, hàng hỏng/bảo hành hoặc tạo tồn âm.',
        409,
      )
    const valueChange =
      input.quantity > 0
        ? integer(input.incomingValue, 'Giá trị nhập')
        : -proportionalValue(previous.inventory_value, -input.quantity, previous.on_hand)
    const nextValue = add(previous.inventory_value, valueChange)
    if (nextQuantity === 0 && nextValue !== 0)
      fail('VALUATION_ERROR', 'Giá trị tồn không khớp số lượng.')
    const stamp = now()
    run(
      `INSERT INTO balances(tenant_id,warehouse_id,location_id,sku_id,on_hand,reserved,inventory_value,updated_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id,warehouse_id,location_id,sku_id) DO UPDATE SET on_hand=excluded.on_hand,inventory_value=excluded.inventory_value,updated_at=excluded.updated_at`,
      actor.tenantId,
      input.warehouseId,
      input.locationId,
      input.skuId,
      nextQuantity,
      previous.reserved,
      nextValue,
      stamp,
    )
    run(
      'INSERT INTO ledger(id,tenant_id,warehouse_id,location_id,sku_id,document_id,count_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id(),
      actor.tenantId,
      input.warehouseId,
      input.locationId,
      input.skuId,
      input.documentId ?? null,
      input.countId ?? null,
      input.kind,
      input.quantity,
      valueChange,
      nextQuantity,
      nextValue,
      actor.userId,
      stamp,
    )
    return Math.abs(valueChange)
  }
  const serialMovement = (actor, product, line, document, receivingTransfer = false) => {
    const serialNumbers = JSON.parse(line.serial_numbers_json)
    if (!product.serial_tracked) return
    if (serialNumbers.length !== Math.abs(line.quantity))
      fail('SERIAL_REQUIRED', 'Mỗi thiết bị cần một serial; số serial phải bằng số lượng.')
    const incoming =
      receivingTransfer ||
      document.type === 'receipt' ||
      (document.type === 'adjustment' && line.quantity > 0)
    for (const serialNumber of serialNumbers) {
      const existing = get(
        'SELECT * FROM serials WHERE tenant_id = ? AND serial_number = ?',
        actor.tenantId,
        serialNumber,
      )
      if (incoming && !receivingTransfer) {
        if (document.return_to_stock) {
          if (!existing || existing.sku_id !== product.id || existing.status !== 'issued')
            fail(
              'INVALID_SERIAL_RETURN',
              `Serial ${serialNumber} không phải thiết bị đã xuất của SKU này.`,
              409,
            )
          if (
            get(
              "SELECT 1 FROM warranties WHERE tenant_id=? AND serial_id=? AND status != 'returned'",
              actor.tenantId,
              existing.id,
            )
          )
            fail(
              'WARRANTY_OPEN',
              'Thiết bị đang có bảo hành chưa hoàn tất, chưa thể nhập lại hàng bán.',
              409,
            )
          run(
            "UPDATE serials SET warehouse_id=?,location_id=?,status='in_stock',quality_status='available',updated_at=? WHERE tenant_id=? AND id=?",
            document.warehouse_id,
            line.location_id,
            now(),
            actor.tenantId,
            existing.id,
          )
        } else {
          if (existing) fail('DUPLICATE_SERIAL', `Serial ${serialNumber} đã tồn tại.`, 409)
          run(
            'INSERT INTO serials(id,tenant_id,sku_id,serial_number,warehouse_id,location_id,status,received_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            id(),
            actor.tenantId,
            product.id,
            serialNumber,
            document.warehouse_id,
            line.location_id,
            'in_stock',
            now(),
            now(),
          )
        }
      } else {
        const expected = receivingTransfer ? 'in_transit' : 'in_stock'
        if (
          !existing ||
          existing.sku_id !== product.id ||
          existing.status !== expected ||
          existing.quality_status !== 'available' ||
          (!receivingTransfer &&
            (existing.warehouse_id !== document.warehouse_id ||
              existing.location_id !== line.location_id))
        )
          fail(
            'SERIAL_UNAVAILABLE',
            `Serial ${serialNumber} không có ở vị trí hoặc trạng thái yêu cầu.`,
            409,
          )
        if (receivingTransfer) {
          // A transit serial is tied to this transfer through its immutable document lines.
          run(
            'UPDATE serials SET warehouse_id = ?,location_id = ?,status = ?,updated_at = ? WHERE tenant_id = ? AND id = ?',
            document.target_warehouse_id,
            line.target_location_id,
            'in_stock',
            now(),
            actor.tenantId,
            existing.id,
          )
        } else
          run(
            'UPDATE serials SET status = ?,updated_at = ? WHERE tenant_id = ? AND id = ?',
            document.type === 'transfer' ? 'in_transit' : 'issued',
            now(),
            actor.tenantId,
            existing.id,
          )
      }
    }
  }

  const returnValuation = (actor, product, line, document) => {
    const source = get(
      `SELECT d.* FROM stock_document_returns r JOIN stock_documents d ON d.tenant_id=r.tenant_id AND d.id=r.source_document_id
      WHERE r.tenant_id=? AND r.document_id=? AND d.type='issue' AND d.status='posted'`,
      actor.tenantId,
      document.id,
    )
    if (!source)
      fail(
        'INVALID_RETURN_SOURCE',
        'Hàng trả cần tham chiếu một phiếu xuất đã ghi sổ trong cùng doanh nghiệp.',
        409,
      )
    let value = 0
    if (product.serial_tracked) {
      for (const serialNumber of JSON.parse(line.serial_numbers_json)) {
        const provenance = get(
          `SELECT p.* FROM serial_issues p JOIN serials s ON s.tenant_id=p.tenant_id AND s.id=p.serial_id
          WHERE p.tenant_id=? AND p.document_id=? AND s.sku_id=? AND s.serial_number=? AND p.returned_by_document_id IS NULL
          ORDER BY p.sequence DESC LIMIT 1`,
          actor.tenantId,
          source.id,
          product.id,
          serialNumber,
        )
        if (!provenance)
          fail(
            'INVALID_RETURN_SOURCE',
            `Serial ${serialNumber} không có nguồn xuất hợp lệ hoặc đã được nhập trả.`,
            409,
          )
        value = add(value, provenance.unit_value)
        run(
          'UPDATE serial_issues SET returned_by_document_id=? WHERE sequence=? AND tenant_id=?',
          document.id,
          provenance.sequence,
          actor.tenantId,
        )
      }
    } else {
      const issuedLines = all(
        'SELECT quantity,inventory_value FROM stock_document_lines WHERE tenant_id=? AND document_id=? AND sku_id=?',
        actor.tenantId,
        source.id,
        product.id,
      )
      const sourceQuantity = issuedLines.reduce((total, row) => add(total, row.quantity), 0)
      const sourceValue = issuedLines.reduce((total, row) => add(total, row.inventory_value), 0)
      const prior = all(
        `SELECT l.quantity,l.inventory_value FROM stock_document_returns r JOIN stock_documents d ON d.tenant_id=r.tenant_id AND d.id=r.document_id
        JOIN stock_document_lines l ON l.tenant_id=d.tenant_id AND l.document_id=d.id
        WHERE r.tenant_id=? AND r.source_document_id=? AND l.sku_id=? AND (d.status='posted' OR (d.id=? AND l.inventory_value IS NOT NULL))`,
        actor.tenantId,
        source.id,
        product.id,
        document.id,
      )
      const remainingQuantity =
        sourceQuantity - prior.reduce((total, row) => add(total, row.quantity), 0)
      const remainingValue =
        sourceValue - prior.reduce((total, row) => add(total, row.inventory_value), 0)
      if (line.quantity > remainingQuantity || remainingQuantity <= 0)
        fail('RETURN_QUANTITY_EXCEEDED', 'Số lượng trả vượt số đã xuất còn có thể nhận lại.', 409)
      value = proportionalValue(remainingValue, line.quantity, remainingQuantity)
    }
    if (line.unit_cost !== Math.round(value / line.quantity))
      fail(
        'RETURN_COST_MISMATCH',
        'Giá vốn trả phải khớp giá vốn xuất gốc; không được tự tăng hoặc giảm định giá.',
        409,
      )
    return value
  }

  const recordSerialIssue = (actor, product, line, document, value) => {
    if (!product.serial_tracked || document.type !== 'issue') return
    const serialNumbers = JSON.parse(line.serial_numbers_json)
    const unitValue = Math.floor(value / line.quantity)
    const remainder = value % line.quantity
    const issuedAt = now()
    const warrantyEndsAt = warrantyEnd(issuedAt, product.warranty_months)
    for (const [index, serialNumber] of serialNumbers.entries()) {
      const serial = get(
        'SELECT id FROM serials WHERE tenant_id=? AND serial_number=?',
        actor.tenantId,
        serialNumber,
      )
      run(
        'INSERT INTO serial_issues(tenant_id,serial_id,document_id,line_id,unit_value,created_at,warranty_months,warranty_ends_at) VALUES (?,?,?,?,?,?,?,?)',
        actor.tenantId,
        serial.id,
        document.id,
        line.id,
        unitValue + (index < remainder ? 1 : 0),
        issuedAt,
        product.warranty_months,
        warrantyEndsAt,
      )
    }
  }

  const warrantyEnd = (issuedAt, months) => {
    if (months === null || months === undefined || months === 0) return null
    const issued = new Date(issuedAt)
    const target = new Date(issuedAt)
    const day = target.getUTCDate()
    target.setUTCDate(1)
    target.setUTCMonth(target.getUTCMonth() + months)
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate()
    target.setUTCDate(Math.min(day, lastDay))
    if (target < issued) fail('INVALID_INPUT', 'Hạn bảo hành không hợp lệ.')
    return target.toISOString()
  }

  const purchaseLinePending = (tenantId, lineId) =>
    get(
      `SELECT COALESCE(SUM(l.quantity),0) AS quantity
    FROM purchase_receipt_lines p JOIN stock_document_lines l ON l.tenant_id=p.tenant_id AND l.id=p.document_line_id
    JOIN stock_documents d ON d.tenant_id=l.tenant_id AND d.id=l.document_id
    WHERE p.tenant_id=? AND p.purchase_order_line_id=? AND d.status IN ('draft','approved')`,
      tenantId,
      lineId,
    ).quantity

  const applyPurchaseReceipt = (actor, document, line) => {
    const linked = get(
      `SELECT p.*,o.status AS order_status,o.id AS order_id,o.warehouse_id,o.supplier_id
      FROM purchase_receipt_lines r JOIN purchase_order_lines p ON p.tenant_id=r.tenant_id AND p.id=r.purchase_order_line_id
      JOIN purchase_orders o ON o.tenant_id=p.tenant_id AND o.id=p.purchase_order_id
      WHERE r.tenant_id=? AND r.document_line_id=?`,
      actor.tenantId,
      line.id,
    )
    if (!linked) return null
    if (
      !['approved', 'partial'].includes(linked.order_status) ||
      document.type !== 'receipt' ||
      document.return_to_stock ||
      document.warehouse_id !== linked.warehouse_id ||
      document.supplier_id !== linked.supplier_id ||
      line.sku_id !== linked.sku_id ||
      line.location_id !== linked.location_id ||
      line.unit_cost !== linked.unit_cost
    )
      fail('PURCHASE_RECEIPT_INVALID', 'Phiếu nhập không khớp đơn mua đã duyệt.', 409)
    const supplier = requireRecord('suppliers', actor.tenantId, linked.supplier_id, 'Nhà cung cấp')
    if (!supplier.active) fail('SUPPLIER_INACTIVE', 'Nhà cung cấp đã ngừng hoạt động.')
    if (
      add(linked.received_quantity, purchaseLinePending(actor.tenantId, linked.id)) >
      linked.quantity
    )
      fail('PURCHASE_OVER_RECEIPT', 'Số lượng nhận vượt số đặt mua còn lại.', 409)
    run(
      'UPDATE purchase_order_lines SET received_quantity=received_quantity+? WHERE tenant_id=? AND id=?',
      line.quantity,
      actor.tenantId,
      linked.id,
    )
    return linked.order_id
  }

  const authorizePurchaseReceipt = (actor, document) => {
    if (document.type !== 'receipt' || document.return_to_stock) return
    const receipt = get(
      'SELECT purchase_order_id FROM purchase_order_receipts WHERE tenant_id=? AND document_id=?',
      actor.tenantId,
      document.id,
    )
    if (!receipt) {
      if (!['owner', 'admin'].includes(actor.role))
        fail(
          'PURCHASE_ORDER_REQUIRED',
          'Phiếu nhập mua phải được tạo từ đơn mua; quản lý kho chỉ nhận sau khi kế toán duyệt.',
          403,
        )
      return
    }
    const order = requireRecord(
      'purchase_orders',
      actor.tenantId,
      receipt.purchase_order_id,
      'Đơn mua hàng',
    )
    if (!['approved', 'partial'].includes(order.status))
      fail('PURCHASE_NOT_APPROVED', 'Đơn mua chưa được kế toán duyệt.', 409)
    if (!actor.permissions.includes('purchaseOrder.receive'))
      fail('FORBIDDEN', 'Chỉ quản lý kho mới được ghi nhận phiếu nhận theo đơn mua.', 403)
  }

  const consumeReservations = (actor, document, line) => {
    const allocations = all(
      'SELECT * FROM reservation_allocations WHERE tenant_id=? AND document_line_id=?',
      actor.tenantId,
      line.id,
    )
    if (!allocations.length) return
    if (document.type !== 'issue')
      fail('INVALID_RESERVATION_ALLOCATION', 'Chỉ phiếu xuất được tiêu thụ giữ hàng.')
    let total = 0
    for (const allocation of allocations) {
      const reservation = requireRecord(
        'reservations',
        actor.tenantId,
        allocation.reservation_id,
        'Giữ hàng',
      )
      if (
        !['active', 'partial'].includes(reservation.status) ||
        reservation.warehouse_id !== document.warehouse_id ||
        reservation.location_id !== line.location_id ||
        reservation.sku_id !== line.sku_id ||
        reservation.quantity_remaining < allocation.quantity ||
        allocation.consumed_at
      )
        fail(
          'RESERVATION_UNAVAILABLE',
          'Giữ hàng không còn đủ hoặc không khớp SKU/kho/vị trí của phiếu xuất.',
          409,
        )
      total = add(total, allocation.quantity)
      if (total > line.quantity)
        fail('INVALID_RESERVATION_ALLOCATION', 'Tổng lượng giữ được tiêu thụ vượt lượng xuất.')
      const remaining = reservation.quantity_remaining - allocation.quantity
      run(
        'UPDATE reservations SET quantity_remaining=?,consumed_quantity=consumed_quantity+?,status=?,consumed_at=? WHERE tenant_id=? AND id=?',
        remaining,
        allocation.quantity,
        remaining ? 'partial' : 'consumed',
        now(),
        actor.tenantId,
        reservation.id,
      )
      run(
        'UPDATE balances SET reserved=reserved-?,updated_at=? WHERE tenant_id=? AND warehouse_id=? AND location_id=? AND sku_id=?',
        allocation.quantity,
        now(),
        actor.tenantId,
        document.warehouse_id,
        line.location_id,
        line.sku_id,
      )
      run(
        'UPDATE reservation_allocations SET consumed_at=? WHERE tenant_id=? AND document_line_id=? AND reservation_id=?',
        now(),
        actor.tenantId,
        line.id,
        reservation.id,
      )
    }
  }

  function activityMetrics(actor, warehouses, skus, balances, documents, purchaseOrders) {
    const endAt = now()
    const start = new Date(endAt)
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - 29)
    const startAt = start.toISOString()
    // Aggregate the complete journal. The paginated ledger in the response is display-only.
    const aggregates = all(
      `SELECT sku_id,warehouse_id,
      SUM(CASE WHEN kind='issue' AND created_at>=? AND created_at<=? THEN -quantity ELSE 0 END) AS issue_quantity_30,
      SUM(CASE WHEN kind='receipt' AND created_at>=? AND created_at<=? THEN quantity ELSE 0 END) AS receipt_quantity_30,
      MAX(CASE WHEN kind='receipt' THEN created_at END) AS last_receipt_at,
      MAX(CASE WHEN kind='issue' THEN created_at END) AS last_issue_at
      FROM ledger WHERE tenant_id=? GROUP BY sku_id,warehouse_id`,
      startAt,
      endAt,
      startAt,
      endAt,
      actor.tenantId,
    )
    const periodRow = get(
      `SELECT
      COALESCE(SUM(CASE WHEN kind='receipt' THEN quantity ELSE 0 END),0) AS receipt_quantity,
      COALESCE(SUM(CASE WHEN kind='receipt' THEN value_change ELSE 0 END),0) AS receipt_value,
      COALESCE(SUM(CASE WHEN kind='issue' THEN -quantity ELSE 0 END),0) AS issue_quantity,
      COALESCE(SUM(CASE WHEN kind='issue' THEN -value_change ELSE 0 END),0) AS issue_value
      FROM ledger WHERE tenant_id=? AND created_at>=? AND created_at<=?`,
      actor.tenantId,
      startAt,
      endAt,
    )
    const period30 = {
      ...record(periodRow),
      startAt,
      endAt,
      basis: 'physical_issue_consumption',
      days: 30,
    }
    const groupedDays = all(
      `SELECT SUBSTR(created_at,1,10) AS date,
      SUM(CASE WHEN kind='receipt' THEN quantity ELSE 0 END) AS receipt_quantity,
      SUM(CASE WHEN kind='receipt' THEN value_change ELSE 0 END) AS receipt_value,
      SUM(CASE WHEN kind='issue' THEN -quantity ELSE 0 END) AS issue_quantity,
      SUM(CASE WHEN kind='issue' THEN -value_change ELSE 0 END) AS issue_value
      FROM ledger WHERE tenant_id=? AND created_at>=? AND created_at<=? GROUP BY SUBSTR(created_at,1,10)`,
      actor.tenantId,
      startAt,
      endAt,
    ).map(record)
    const dailyMovements = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10)
      return (
        groupedDays.find((row) => row.date === date) ?? {
          date,
          receiptQuantity: 0,
          receiptValue: 0,
          issueQuantity: 0,
          issueValue: 0,
        }
      )
    })
    const pending = new Map()
    for (const document of documents) {
      const warehouseId =
        document.type === 'receipt' && document.status === 'approved' && !document.purchaseOrderId
          ? document.warehouseId
          : document.type === 'transfer' && document.status === 'in_transit'
            ? document.targetWarehouseId
            : null
      if (!warehouseId) continue
      for (const line of document.lines) {
        const key = `${warehouseId}:${line.skuId}`
        const row = pending.get(key) ?? { skuId: line.skuId, warehouseId, quantity: 0, value: 0 }
        row.quantity = add(row.quantity, line.quantity)
        row.value = add(
          row.value,
          document.type === 'transfer'
            ? line.inventoryValue
            : multiply(line.quantity, line.unitCost),
        )
        pending.set(key, row)
      }
    }
    for (const order of purchaseOrders.filter((row) =>
      ['approved', 'partial'].includes(row.status),
    )) {
      for (const line of order.lines) {
        const quantity = line.quantity - line.receivedQuantity
        if (!quantity) continue
        const key = `${order.warehouseId}:${line.skuId}`
        const row = pending.get(key) ?? {
          skuId: line.skuId,
          warehouseId: order.warehouseId,
          quantity: 0,
          value: 0,
        }
        row.quantity = add(row.quantity, quantity)
        row.value = add(row.value, multiply(quantity, line.unitCost))
        pending.set(key, row)
      }
    }
    const pendingIncoming = [...pending.values()]
    const activeSkus = skus.filter((product) => product.active)
    const activeWarehouses = warehouses.filter((warehouse) => warehouse.active)
    const activity = new Map(aggregates.map((row) => [`${row.warehouse_id}:${row.sku_id}`, row]))
    const balanceGroups = new Map()
    for (const row of balances) {
      const key = `${row.warehouseId}:${row.skuId}`
      const group = balanceGroups.get(key) ?? { onHand: 0, available: 0 }
      group.onHand = add(group.onHand, row.onHand)
      group.available = add(group.available, row.available)
      balanceGroups.set(key, group)
    }
    const skuActivity = activeWarehouses.flatMap((warehouse) =>
      activeSkus.map((product) => {
        const key = `${warehouse.id}:${product.id}`
        const row = activity.get(key)
        const group = balanceGroups.get(key) ?? { onHand: 0, available: 0 }
        const issueQuantity30 = row?.issue_quantity_30 ?? 0
        return {
          skuId: product.id,
          warehouseId: warehouse.id,
          ...group,
          issueQuantity30,
          receiptQuantity30: row?.receipt_quantity_30 ?? 0,
          avgDailyIssue: issueQuantity30 / 30,
          lastReceiptAt: row?.last_receipt_at ?? null,
          lastIssueAt: row?.last_issue_at ?? null,
          pendingIncoming: pending.get(key)?.quantity ?? 0,
          reorderPoint: product.reorderPoint,
          maxStock: product.maxStock,
          leadTimeDays: product.leadTimeDays,
        }
      }),
    )
    const replenishmentSuggestions = skuActivity.flatMap((row) => {
      // Ceil the lead-time consumption with integer arithmetic before applying the SKU's cap.
      const demand =
        (BigInt(row.issueQuantity30) * BigInt(row.leadTimeDays) + 29n) / 30n +
        BigInt(row.reorderPoint)
      const targetStock = Number(demand < BigInt(row.maxStock) ? demand : BigInt(row.maxStock))
      const quantity = Math.max(0, targetStock - row.available - row.pendingIncoming)
      return quantity > 0
        ? [
            {
              skuId: row.skuId,
              warehouseId: row.warehouseId,
              quantity,
              available: row.available,
              pendingIncoming: row.pendingIncoming,
              averageDailyIssue: row.avgDailyIssue,
              leadTimeDays: row.leadTimeDays,
              reorderPoint: row.reorderPoint,
              targetStock,
              rule: '30-day physical issue consumption × lead time + reorder point; capped at maximum; subtract available and pending incoming. Rule-based, not AI forecasting.',
            },
          ]
        : []
    })
    const remainingDonorStock = new Map(
      skuActivity.map((row) => [
        `${row.warehouseId}:${row.skuId}`,
        Math.max(0, row.available - row.reorderPoint),
      ]),
    )
    const transferSuggestions = []
    for (const need of replenishmentSuggestions) {
      let quantityNeeded = need.quantity
      for (const donor of skuActivity
        .filter((row) => row.skuId === need.skuId && row.warehouseId !== need.warehouseId)
        .sort((left, right) => right.available - left.available)) {
        const donorKey = `${donor.warehouseId}:${donor.skuId}`
        const quantity = Math.min(quantityNeeded, remainingDonorStock.get(donorKey) ?? 0)
        if (!quantity) continue
        transferSuggestions.push({
          skuId: need.skuId,
          fromWarehouseId: donor.warehouseId,
          toWarehouseId: need.warehouseId,
          quantity,
          rule: 'Move available stock above the source reorder point to a warehouse below its lead-time target. Suggestion only; approval and dispatch are required.',
        })
        remainingDonorStock.set(donorKey, remainingDonorStock.get(donorKey) - quantity)
        quantityNeeded -= quantity
        if (!quantityNeeded) break
      }
    }
    const globalAvailability = (productId) =>
      balances
        .filter((row) => row.skuId === productId)
        .reduce((sum, row) => add(sum, row.available), 0)
    const globalIssues = (productId) =>
      aggregates
        .filter((row) => row.sku_id === productId)
        .reduce((sum, row) => add(sum, row.issue_quantity_30), 0)
    const outOfStockSkuIds = activeSkus
      .filter((product) => globalAvailability(product.id) === 0)
      .map((product) => product.id)
    const belowMinimumSkuIds = activeSkus
      .filter((product) => globalAvailability(product.id) < product.reorderPoint)
      .map((product) => product.id)
    const slowMovingSkuIds = activeSkus
      .filter(
        (product) =>
          globalIssues(product.id) === 0 &&
          balances.some((row) => row.skuId === product.id && row.onHand > 0),
      )
      .map((product) => product.id)
    const fastMovingSkuIds = activeSkus
      .filter((product) => globalIssues(product.id) > Math.max(0, globalAvailability(product.id)))
      .map((product) => product.id)
    return {
      period30,
      dailyMovements,
      skuActivity,
      pendingIncoming,
      replenishmentSuggestions,
      transferSuggestions,
      outOfStockSkuIds,
      outOfStockCount: outOfStockSkuIds.length,
      belowMinimumSkuIds,
      belowMinimumCount: belowMinimumSkuIds.length,
      slowMovingSkuIds,
      fastMovingSkuIds,
      movementRules: {
        lowStock: 'available <= reorderPoint across all warehouses',
        belowMinimum: 'available < reorderPoint across all warehouses',
        slowMoving:
          'on-hand stock with zero physical issue quantity in the last 30 UTC calendar days',
        fastMoving:
          'physical issue quantity over 30 UTC calendar days exceeds current available units',
        consumption: 'Posted physical issue quantities; not confirmed sales or revenue.',
      },
    }
  }

  function snapshotData(actor, filters = {}) {
    keys(filters, ['warehouseId', 'skuId', 'ledgerLimit', 'beforeSequence'])
    const tenant = record(get('SELECT * FROM tenants WHERE id = ?', actor.tenantId))
    tenant.config = configuration(actor.tenantId)
    const actorPermissions = permissionsForUser(db, actor.tenantId, actor.userId, actor.role)
    const rows = (table, order = '') =>
      all(`SELECT * FROM ${table} WHERE tenant_id = ? ${order}`, actor.tenantId).map(record)
    const warehouses = rows('warehouses', 'ORDER BY code')
    const locations = rows('locations', 'ORDER BY warehouse_id,code')
    const suppliers = rows('suppliers', 'ORDER BY code')
    const skus = rows('inventory_skus', 'ORDER BY sku')
    const lastMovement = all(
      `SELECT warehouse_id,location_id,sku_id,MAX(created_at) AS last_movement_at,
      MAX(CASE WHEN kind='receipt' THEN created_at END) AS last_receipt_at,
      MAX(CASE WHEN kind='issue' THEN created_at END) AS last_issue_at
      FROM ledger WHERE tenant_id=? AND quantity != 0 GROUP BY warehouse_id,location_id,sku_id`,
      actor.tenantId,
    )
    const staleDays = tenant.config.staleDays
    const balances = rows('balances').map((row) => {
      const activity = lastMovement.find(
        (item) =>
          item.warehouse_id === row.warehouseId &&
          item.location_id === row.locationId &&
          item.sku_id === row.skuId,
      )
      const lastMovementAt = activity?.last_movement_at ?? row.updatedAt
      const lastReceiptAt = activity?.last_receipt_at ?? null
      const lastIssueAt = activity?.last_issue_at ?? null
      const lastReceiptOrIssue =
        [lastReceiptAt, lastIssueAt].filter(Boolean).sort().at(-1) ?? lastMovementAt
      const daysSinceLastMovement = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(lastMovementAt)) / 86400000),
      )
      const daysSinceReceiptOrIssue = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(lastReceiptOrIssue)) / 86400000),
      )
      return {
        ...row,
        available: row.onHand - row.reserved - row.damaged - row.warranty,
        averageCost: row.onHand ? Math.round(row.inventoryValue / row.onHand) : 0,
        lastMovementAt,
        lastReceiptAt,
        lastIssueAt,
        daysSinceLastMovement,
        daysSinceReceiptOrIssue,
        stale: row.onHand > 0 && daysSinceReceiptOrIssue >= staleDays,
      }
    })
    const documentLines = rows('stock_document_lines')
    const purchaseOrderLines = rows(
      'purchase_order_lines',
      'ORDER BY purchase_order_id,line_number',
    )
    const purchaseOrderReceipts = rows('purchase_order_receipts')
    const purchaseReceiptLines = rows('purchase_receipt_lines')
    const reservationAllocations = rows('reservation_allocations')
    const purchaseOrders = rows('purchase_orders', 'ORDER BY created_at DESC,id DESC').map(
      (row) => ({
        ...row,
        lines: purchaseOrderLines
          .filter((line) => line.purchaseOrderId === row.id)
          .map((line) => ({
            ...line,
            outstandingQuantity: line.quantity - line.receivedQuantity,
            pendingReceiptQuantity: purchaseLinePending(actor.tenantId, line.id),
          })),
        receiptDocumentIds: purchaseOrderReceipts
          .filter((link) => link.purchaseOrderId === row.id)
          .map((link) => link.documentId),
      }),
    )
    const requestRows = actorPermissions.includes('purchaseRequest.manage')
      ? rows('stock_restock_requests', 'ORDER BY created_at DESC,id DESC')
      : actorPermissions.includes('purchaseRequest.read')
        ? all(
            'SELECT * FROM stock_restock_requests WHERE tenant_id=? AND created_by=? ORDER BY created_at DESC,id DESC',
            actor.tenantId,
            actor.userId,
          ).map(record)
        : []
    const requestLines = rows(
      'stock_restock_request_lines',
      'ORDER BY request_id,line_number',
    )
    const purchaseRequests = requestRows.map((request) => {
      const order = get(
        "SELECT id,number,status FROM purchase_orders WHERE tenant_id=? AND restock_request_id=? AND status!='cancelled' ORDER BY created_at DESC,id DESC LIMIT 1",
        actor.tenantId,
        request.id,
      )
      const status = order
        ? order.status === 'draft'
          ? 'proposed'
          : order.status
        : request.status
      return {
        ...request,
        status,
        purchaseOrderId: order?.id ?? null,
        purchaseOrderNumber: order?.number ?? null,
        lines: requestLines
          .filter((line) => line.requestId === request.id)
          .map((line) => ({
            id: line.id,
            skuId: line.skuId,
            requestedQuantity: line.requestedQuantity,
          })),
      }
    })
    const returnSources = rows('stock_document_returns')
    const documents = rows('stock_documents', 'ORDER BY created_at DESC,id DESC').map((row) => ({
      ...row,
      sourceDocumentId:
        returnSources.find((source) => source.documentId === row.id)?.sourceDocumentId ?? null,
      purchaseOrderId: (() => {
        const link = purchaseReceiptLines.find((link) =>
          documentLines.some(
            (line) => line.id === link.documentLineId && line.documentId === row.id,
          ),
        )
        return (
          purchaseOrderLines.find((line) => line.id === link?.purchaseOrderLineId)
            ?.purchaseOrderId ?? null
        )
      })(),
      lines: documentLines
        .filter((line) => line.documentId === row.id)
        .map((line) => ({
          ...line,
          purchaseOrderLineId:
            purchaseReceiptLines.find((link) => link.documentLineId === line.id)
              ?.purchaseOrderLineId ?? null,
          reservationAllocations: reservationAllocations.filter(
            (allocation) => allocation.documentLineId === line.id,
          ),
        })),
    }))
    const countsLines = rows('stock_count_lines')
    const counts = rows('stock_counts', 'ORDER BY created_at DESC').map((row) => ({
      ...row,
      lines: countsLines.filter((line) => line.countId === row.id),
    }))
    const reservations = rows('reservations', 'ORDER BY created_at DESC')
    const serialIssues = rows('serial_issues', 'ORDER BY sequence DESC')
    const serials = rows('serials', 'ORDER BY serial_number').map((serial) => {
      const issue = serialIssues.find((issue) => issue.serialId === serial.id)
      return {
        ...serial,
        warrantyMonths: issue?.warrantyMonths ?? null,
        warrantyStartAt: issue?.createdAt ?? null,
        warrantyEndAt: issue?.warrantyEndsAt ?? null,
      }
    })
    const warranties = rows('warranties', 'ORDER BY created_at DESC')
    const ledgerLimit = integer(filters.ledgerLimit ?? 200, 'Giới hạn sổ kho', 1, 1000)
    let ledgerSql = 'SELECT * FROM ledger WHERE tenant_id = ?'
    const params = [actor.tenantId]
    if (own(filters, 'warehouseId')) {
      requireRecord('warehouses', actor.tenantId, filters.warehouseId, 'Kho')
      ledgerSql += ' AND warehouse_id = ?'
      params.push(filters.warehouseId)
    }
    if (own(filters, 'skuId')) {
      requireRecord('inventory_skus', actor.tenantId, filters.skuId, 'SKU')
      ledgerSql += ' AND sku_id = ?'
      params.push(filters.skuId)
    }
    if (filters.beforeSequence !== undefined) {
      ledgerSql += ' AND sequence < ?'
      params.push(integer(filters.beforeSequence, 'Mốc sổ kho', 1))
    }
    const ledger = all(`${ledgerSql} ORDER BY sequence DESC LIMIT ?`, ...params, ledgerLimit).map(
      record,
    )
    const auditEvents = rows('audit_events', 'ORDER BY sequence DESC LIMIT 100')
    const totals = balances.reduce(
      (total, row) => ({
        onHand: add(total.onHand, row.onHand),
        reserved: add(total.reserved, row.reserved),
        damaged: add(total.damaged, row.damaged),
        warranty: add(total.warranty, row.warranty),
        available: add(total.available, row.available),
        inventoryValue: add(total.inventoryValue, row.inventoryValue),
      }),
      { onHand: 0, reserved: 0, damaged: 0, warranty: 0, available: 0, inventoryValue: 0 },
    )
    const lowStock = skus.filter(
      (product) =>
        product.active &&
        balances
          .filter((row) => row.skuId === product.id)
          .reduce((sum, row) => add(sum, row.available), 0) <= product.reorderPoint,
    )
    const transitLines = documents
      .filter((item) => item.status === 'in_transit')
      .flatMap((item) => item.lines)
    const inTransitQuantity = transitLines.reduce((total, line) => add(total, line.quantity), 0)
    const inTransitValue = transitLines.reduce((total, line) => add(total, line.inventoryValue), 0)
    const metrics = {
      ...totals,
      ...activityMetrics(actor, warehouses, skus, balances, documents, purchaseOrders),
      inTransitQuantity,
      inTransitValue,
      totalInventoryValue: add(totals.inventoryValue, inTransitValue),
      staleBalanceCount: balances.filter((row) => row.stale).length,
      staleInventoryValue: balances
        .filter((row) => row.stale)
        .reduce((total, row) => add(total, row.inventoryValue), 0),
      skuCount: skus.filter((product) => product.active).length,
      warehouseCount: warehouses.filter((item) => item.active).length,
      lowStockCount: lowStock.length,
      lowStockSkuIds: lowStock.map((product) => product.id),
      pendingApprovalCount: documents.filter((item) => item.status === 'draft').length,
      inTransitCount: documents.filter((item) => item.status === 'in_transit').length,
      activeReservations: reservations.filter((item) => ['active', 'partial'].includes(item.status))
        .length,
      openPurchaseOrderCount: purchaseOrders.filter((item) =>
        ['approved', 'partial'].includes(item.status),
      ).length,
      openWarrantyCount: warranties.filter((item) => item.status !== 'returned').length,
    }
    return {
      tenant,
      actor: { userId: actor.userId, role: actor.role },
      permissions: actorPermissions,
      ...sales.snapshot(actor),
      warehouses,
      locations,
      suppliers,
      skus,
      balances,
      documents,
      purchaseRequests,
      purchaseOrders: actorPermissions.some((permission) =>
        ['purchaseOrder.create', 'purchaseOrder.approve', 'purchaseOrder.cancel', 'purchaseOrder.receive'].includes(
          permission,
        ),
      )
        ? purchaseOrders
        : [],
      ledger,
      reservations,
      counts,
      serials,
      warranties,
      auditEvents,
      metrics,
      pagination: {
        ledgerLimit,
        nextBeforeSequence: ledger.length === ledgerLimit ? ledger.at(-1).sequence : null,
      },
    }
  }

  function execute(actor, action, input) {
    if (sales.supports(action)) return sales.execute(actor, action, input)
    const tenantId = actor.tenantId
    if (action === 'sku.import') return importCatalog(db, actor, input, executeInTransaction)
    if (action === 'warehouse.create') {
      keys(input, ['code', 'name', 'address', 'active'])
      if (
        !configuration(tenantId).multiWarehouseEnabled &&
        get('SELECT 1 FROM warehouses WHERE tenant_id=?', tenantId)
      )
        fail(
          'MULTI_WAREHOUSE_DISABLED',
          'Doanh nghiệp đang cấu hình một kho; cần bật nhiều kho trước.',
          409,
        )
      const entityId = id()
      run(
        'INSERT INTO warehouses(id,tenant_id,code,name,address,active,created_at) VALUES (?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        text(input.code, 'Mã kho', 1, 50).toUpperCase(),
        text(input.name, 'Tên kho', 1, 200),
        text(input.address ?? '', 'Địa chỉ'),
        own(input, 'active') ? bool(input.active, 'Hoạt động') : 1,
        now(),
      )
      run(
        'INSERT INTO locations(id,tenant_id,warehouse_id,code,name,is_default) VALUES (?,?,?,?,?,1)',
        id(),
        tenantId,
        entityId,
        'DEFAULT',
        'Vị trí mặc định',
      )
      return { id: entityId }
    }
    if (action === 'warehouse.update') {
      keys(input, ['id', 'code', 'name', 'address', 'active'])
      const row = requireRecord('warehouses', tenantId, input.id, 'Kho')
      const active = own(input, 'active') ? bool(input.active, 'Hoạt động') : row.active
      if (
        !active &&
        (get(
          'SELECT 1 FROM balances WHERE tenant_id = ? AND warehouse_id = ? AND on_hand > 0',
          tenantId,
          row.id,
        ) ||
          get(
            "SELECT 1 FROM stock_documents WHERE tenant_id = ? AND (warehouse_id = ? OR target_warehouse_id = ?) AND status IN ('draft','approved','in_transit')",
            tenantId,
            row.id,
            row.id,
          ))
      )
        fail(
          'WAREHOUSE_IN_USE',
          'Kho còn tồn hoặc phiếu chưa hoàn tất; chưa thể ngừng hoạt động.',
          409,
        )
      run(
        'UPDATE warehouses SET code = ?,name = ?,address = ?,active = ? WHERE tenant_id = ? AND id = ?',
        own(input, 'code') ? text(input.code, 'Mã kho', 1, 50).toUpperCase() : row.code,
        own(input, 'name') ? text(input.name, 'Tên kho', 1, 200) : row.name,
        own(input, 'address') ? text(input.address, 'Địa chỉ') : row.address,
        active,
        tenantId,
        row.id,
      )
      return { id: row.id }
    }
    if (action === 'location.create') {
      keys(input, ['warehouseId', 'code', 'name'])
      warehouse(actor, input.warehouseId)
      const entityId = id()
      run(
        'INSERT INTO locations(id,tenant_id,warehouse_id,code,name) VALUES (?,?,?,?,?)',
        entityId,
        tenantId,
        input.warehouseId,
        text(input.code, 'Mã vị trí', 1, 50).toUpperCase(),
        text(input.name, 'Tên vị trí', 1, 200),
      )
      return { id: entityId }
    }
    if (action === 'supplier.create' || action === 'supplier.update') {
      keys(input, ['id', 'code', 'name', 'phone', 'email', 'address', 'active'])
      const row = action.endsWith('.update')
        ? requireRecord('suppliers', tenantId, input.id, 'Nhà cung cấp')
        : { id: id(), code: '', name: '', phone: '', email: '', address: '', active: 1 }
      const next = { ...row }
      for (const field of ['code', 'name', 'phone', 'email', 'address'])
        if (own(input, field))
          next[field] = text(
            input[field],
            field,
            ['code', 'name'].includes(field) ? 1 : 0,
            field === 'address' ? 500 : 200,
          )
      next.code = next.code.toUpperCase()
      text(next.code, 'Mã NCC', 1, 50)
      text(next.name, 'Tên NCC', 1, 200)
      if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))
        fail('INVALID_INPUT', 'Email nhà cung cấp không hợp lệ.')
      next.active = own(input, 'active') ? bool(input.active, 'Hoạt động') : row.active
      if (action.endsWith('.create'))
        run(
          'INSERT INTO suppliers(id,tenant_id,code,name,phone,email,address,active) VALUES (?,?,?,?,?,?,?,?)',
          row.id,
          tenantId,
          next.code,
          next.name,
          next.phone,
          next.email,
          next.address,
          next.active,
        )
      else
        run(
          'UPDATE suppliers SET code=?,name=?,phone=?,email=?,address=?,active=? WHERE tenant_id=? AND id=?',
          next.code,
          next.name,
          next.phone,
          next.email,
          next.address,
          next.active,
          tenantId,
          row.id,
        )
      return { id: row.id }
    }
    if (action === 'sku.create' || action === 'sku.update') {
      keys(input, [
        'id',
        'sku',
        'name',
        'category',
        'unit',
        'serialTracked',
        'reorderPoint',
        'maxStock',
        'leadTimeDays',
        'price',
        'cost',
        'productId',
        'active',
        'metadata',
        'imageUrl',
        'description',
        'specifications',
        'sourceUrl',
        'warrantyMonths',
      ])
      const row = action.endsWith('.update')
        ? requireRecord('inventory_skus', tenantId, input.id, 'SKU')
        : {
            id: id(),
            sku: '',
            name: '',
            category: '',
            unit: 'cái',
            serial_tracked: 0,
            reorder_point: 5,
            max_stock: 100,
            lead_time_days: 7,
            price: 0,
            price_known: 0,
            cost: 0,
            active: 1,
            product_id: null,
            metadata_json: '{}',
            warranty_months: null,
            created_at: now(),
          }
      const next = { ...row }
      for (const field of ['sku', 'name', 'category', 'unit'])
        if (own(input, field))
          next[field] = text(
            input[field],
            field,
            ['sku', 'name', 'unit'].includes(field) ? 1 : 0,
            field === 'sku' ? 50 : 200,
          )
      next.sku = next.sku.toUpperCase()
      text(next.sku, 'SKU', 1, 50)
      text(next.name, 'Tên SKU', 1, 200)
      for (const [field, column] of [
        ['reorderPoint', 'reorder_point'],
        ['maxStock', 'max_stock'],
        ['leadTimeDays', 'lead_time_days'],
        ['cost', 'cost'],
      ])
        if (own(input, field)) next[column] = integer(input[field], field)
      if (own(input, 'price')) {
        next.price = input.price === null ? 0 : integer(input.price, 'Giá bán')
        next.price_known = input.price === null ? 0 : 1
      }
      if (own(input, 'warrantyMonths'))
        next.warranty_months =
          input.warrantyMonths === null
            ? null
            : integer(input.warrantyMonths, 'Tháng bảo hành', 0, 1200)
      if (next.max_stock < next.reorder_point)
        fail('INVALID_INPUT', 'Tồn tối đa phải lớn hơn hoặc bằng ngưỡng đặt hàng.')
      if (own(input, 'productId'))
        next.product_id =
          input.productId === null ? null : text(input.productId, 'Mã sản phẩm', 1, 200)
      if (own(input, 'metadata')) next.metadata_json = jsonObject(input.metadata, 'Metadata')
      next.metadata_json = jsonObject(
        updatePresentation(JSON.parse(next.metadata_json), input),
        'Metadata',
      )
      if (own(input, 'active')) next.active = bool(input.active, 'Hoạt động')
      if (own(input, 'serialTracked'))
        next.serial_tracked = bool(input.serialTracked, 'Theo dõi serial')
      if (
        next.serial_tracked !== row.serial_tracked &&
        (get('SELECT 1 FROM ledger WHERE tenant_id=? AND sku_id=?', tenantId, row.id) ||
          get('SELECT 1 FROM serials WHERE tenant_id=? AND sku_id=?', tenantId, row.id))
      )
        fail('SKU_IN_USE', 'Không đổi chế độ serial khi SKU đã có giao dịch.', 409)
      const values = [
        next.product_id,
        next.sku,
        next.name,
        next.category,
        next.unit,
        next.serial_tracked,
        next.reorder_point,
        next.max_stock,
        next.lead_time_days,
        next.price,
        next.cost,
        next.active,
        next.metadata_json,
        next.warranty_months,
        next.price_known,
      ]
      if (action.endsWith('.create'))
        run(
          'INSERT INTO inventory_skus(product_id,sku,name,category,unit,serial_tracked,reorder_point,max_stock,lead_time_days,price,cost,active,metadata_json,warranty_months,price_known,id,tenant_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          ...values,
          row.id,
          tenantId,
          row.created_at,
        )
      else
        run(
          'UPDATE inventory_skus SET product_id=?,sku=?,name=?,category=?,unit=?,serial_tracked=?,reorder_point=?,max_stock=?,lead_time_days=?,price=?,cost=?,active=?,metadata_json=?,warranty_months=?,price_known=? WHERE id=? AND tenant_id=?',
          ...values,
          row.id,
          tenantId,
        )
      return { id: row.id }
    }
    if (action === 'purchaseRequest.create') {
      keys(input, ['warehouseId', 'sourceReference', 'note', 'lines'])
      warehouse(actor, input.warehouseId)
      if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100)
        fail('INVALID_INPUT', 'Yêu cầu nhập hàng cần từ 1 đến 100 dòng.')
      const requestId = id()
      const number = `RR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${requestId.slice(0, 8).toUpperCase()}`
      run(
        'INSERT INTO stock_restock_requests(id,tenant_id,number,warehouse_id,source_reference,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
        requestId,
        tenantId,
        number,
        input.warehouseId,
        text(input.sourceReference ?? '', 'Tham chiếu nguồn', 0, 200),
        text(input.note ?? '', 'Ghi chú', 0, 2000),
        actor.userId,
        now(),
      )
      const seen = new Set()
      for (const [index, line] of input.lines.entries()) {
        keys(line, ['skuId', 'requestedQuantity'])
        const product = sku(actor, line.skuId)
        if (seen.has(product.id)) fail('DUPLICATE_LINE', 'SKU bị trùng trong yêu cầu nhập hàng.')
        seen.add(product.id)
        const quantity = integer(line.requestedQuantity, 'Số lượng cần bổ sung', 1, 1000000000)
        const availability = all(
          'SELECT on_hand,reserved,damaged,warranty FROM balances WHERE tenant_id=? AND warehouse_id=? AND sku_id=?',
          tenantId,
          input.warehouseId,
          product.id,
        ).reduce(
          (total, balance) =>
            add(total, balance.on_hand - balance.reserved - balance.damaged - balance.warranty),
          0,
        )
        if (availability >= quantity)
          fail(
            'STOCK_AVAILABLE',
            `Kho vẫn còn đủ hàng ${product.sku}; chỉ gửi yêu cầu khi số cần bổ sung vượt tồn khả dụng.`,
            409,
          )
        run(
          'INSERT INTO stock_restock_request_lines(id,tenant_id,request_id,sku_id,line_number,requested_quantity) VALUES (?,?,?,?,?,?)',
          id(),
          tenantId,
          requestId,
          product.id,
          index + 1,
          quantity,
        )
      }
      return { id: requestId, number }
    }
    if (action === 'purchaseOrder.create') {
      keys(input, [
        'warehouseId',
        'supplierId',
        'reference',
        'note',
        'lines',
        'restockRequestId',
      ])
      warehouse(actor, input.warehouseId)
      const supplier = requireRecord('suppliers', tenantId, input.supplierId, 'Nhà cung cấp')
      if (!supplier.active) fail('SUPPLIER_INACTIVE', 'Nhà cung cấp đã ngừng hoạt động.')
      if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200)
        fail('INVALID_INPUT', 'Đơn mua cần từ 1 đến 200 dòng hàng.')
      let restockRequest = null
      if (input.restockRequestId !== undefined) {
        restockRequest = requireRecord(
          'stock_restock_requests',
          tenantId,
          input.restockRequestId,
          'Yêu cầu nhập hàng',
        )
        if (restockRequest.status !== 'open')
          fail('INVALID_TRANSITION', 'Yêu cầu nhập hàng đã được xử lý.', 409)
        if (restockRequest.warehouse_id !== input.warehouseId)
          fail('WAREHOUSE_MISMATCH', 'Đơn mua phải nhập vào kho trong yêu cầu.', 409)
        if (
          get(
            "SELECT 1 FROM purchase_orders WHERE tenant_id=? AND restock_request_id=? AND status!='cancelled'",
            tenantId,
            restockRequest.id,
          )
        )
          fail('REQUEST_ALREADY_PROPOSED', 'Yêu cầu đã có đơn mua hàng.', 409)
        const requestedLines = all(
          'SELECT sku_id,requested_quantity FROM stock_restock_request_lines WHERE tenant_id=? AND request_id=?',
          tenantId,
          restockRequest.id,
        )
        const proposedQuantities = new Map()
        for (const line of input.lines) {
          if (!line || typeof line !== 'object' || Array.isArray(line)) continue
          const skuId = text(line.skuId, 'SKU', 1, 200)
          const quantity = integer(line.quantity, 'Số lượng đặt', 1, 1000000000)
          proposedQuantities.set(skuId, (proposedQuantities.get(skuId) ?? 0) + quantity)
        }
        if (
          requestedLines.some(
            (line) => (proposedQuantities.get(line.sku_id) ?? 0) < line.requested_quantity,
          )
        )
          fail(
            'REQUEST_LINES_INCOMPLETE',
            'Đơn mua phải bao gồm đầy đủ mặt hàng và số lượng đã yêu cầu.',
            409,
          )
      }
      const entityId = id()
      const number = `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${entityId.slice(0, 8).toUpperCase()}`
      run(
        'INSERT INTO purchase_orders(id,tenant_id,number,warehouse_id,supplier_id,reference,note,created_by,created_at,restock_request_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        number,
        input.warehouseId,
        supplier.id,
        text(input.reference ?? '', 'Tham chiếu', 0, 200),
        text(input.note ?? '', 'Ghi chú', 0, 2000),
        actor.userId,
        now(),
        restockRequest?.id ?? null,
      )
      const seen = new Set()
      for (const [index, line] of input.lines.entries()) {
        keys(line, ['skuId', 'quantity', 'unitCost', 'locationId'])
        const product = sku(actor, line.skuId)
        const position = location(actor, input.warehouseId, line.locationId)
        const quantity = integer(line.quantity, 'Số lượng đặt', 1, 1000000000)
        const unitCost = integer(line.unitCost, 'Giá vốn đặt')
        multiply(quantity, unitCost)
        const unique = `${product.id}:${position.id}`
        if (seen.has(unique)) fail('DUPLICATE_LINE', 'SKU và vị trí bị trùng trong đơn mua.')
        seen.add(unique)
        run(
          'INSERT INTO purchase_order_lines(id,tenant_id,purchase_order_id,sku_id,location_id,line_number,quantity,unit_cost) VALUES (?,?,?,?,?,?,?,?)',
          id(),
          tenantId,
          entityId,
          product.id,
          position.id,
          index + 1,
          quantity,
          unitCost,
        )
      }
      return { id: entityId, number }
    }
    if (['purchaseOrder.approve', 'purchaseOrder.cancel'].includes(action)) {
      keys(input, ['id'])
      const order = requireRecord('purchase_orders', tenantId, input.id, 'Đơn mua hàng')
      if (action === 'purchaseOrder.approve') {
        if (order.status !== 'draft')
          fail('INVALID_TRANSITION', 'Chỉ đơn mua nháp được duyệt.', 409)
        if (order.created_by === actor.userId && actor.role !== 'owner')
          fail('SELF_APPROVAL', 'Người lập đơn mua không thể tự phê duyệt.', 403)
        warehouse(actor, order.warehouse_id)
        const supplier = requireRecord('suppliers', tenantId, order.supplier_id, 'Nhà cung cấp')
        if (!supplier.active) fail('SUPPLIER_INACTIVE', 'Nhà cung cấp đã ngừng hoạt động.')
        run(
          "UPDATE purchase_orders SET status='approved',approved_by=?,approved_at=? WHERE tenant_id=? AND id=?",
          actor.userId,
          now(),
          tenantId,
          order.id,
        )
      } else {
        if (!['draft', 'approved'].includes(order.status))
          fail(
            'INVALID_TRANSITION',
            'Đơn mua đã nhận một phần hoặc hoàn tất không thể hủy; cần lập nghiệp vụ bù riêng.',
            409,
          )
        if (
          get(
            "SELECT 1 FROM purchase_receipt_lines r JOIN purchase_order_lines l ON l.tenant_id=r.tenant_id AND l.id=r.purchase_order_line_id JOIN stock_document_lines sl ON sl.tenant_id=r.tenant_id AND sl.id=r.document_line_id JOIN stock_documents d ON d.tenant_id=sl.tenant_id AND d.id=sl.document_id WHERE r.tenant_id=? AND l.purchase_order_id=? AND d.status!='cancelled'",
            tenantId,
            order.id,
          )
        )
          fail(
            'PURCHASE_RECEIPT_PENDING',
            'Hãy hủy các phiếu nhận hàng chưa ghi sổ trước khi hủy đơn mua.',
            409,
          )
        run(
          "UPDATE purchase_orders SET status='cancelled',cancelled_at=? WHERE tenant_id=? AND id=?",
          now(),
          tenantId,
          order.id,
        )
      }
      return { id: order.id }
    }
    if (action === 'purchaseOrder.receive') {
      keys(input, ['id', 'lines', 'reference'])
      const order = requireRecord('purchase_orders', tenantId, input.id, 'Đơn mua hàng')
      if (!['approved', 'partial'].includes(order.status))
        fail('INVALID_TRANSITION', 'Chỉ đơn mua đã duyệt và chưa nhận đủ được nhận hàng.', 409)
      warehouse(actor, order.warehouse_id)
      const supplier = requireRecord('suppliers', tenantId, order.supplier_id, 'Nhà cung cấp')
      if (!supplier.active) fail('SUPPLIER_INACTIVE', 'Nhà cung cấp đã ngừng hoạt động.')
      if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 200)
        fail('INVALID_INPUT', 'Phiếu nhận cần từ 1 đến 200 dòng.')
      const seen = new Set()
      const staged = []
      for (const line of input.lines) {
        keys(line, ['purchaseOrderLineId', 'quantity', 'serialNumbers'])
        const poLine = requireRecord(
          'purchase_order_lines',
          tenantId,
          line.purchaseOrderLineId,
          'Dòng đơn mua',
        )
        if (poLine.purchase_order_id !== order.id || seen.has(poLine.id))
          fail('INVALID_PURCHASE_ORDER_LINE', 'Dòng không thuộc đơn mua hoặc bị lặp.', 409)
        seen.add(poLine.id)
        const quantity = integer(line.quantity, 'Số lượng nhận', 1, 1000000000)
        const pending = purchaseLinePending(tenantId, poLine.id)
        if (add(poLine.received_quantity, add(pending, quantity)) > poLine.quantity)
          fail('PURCHASE_OVER_RECEIPT', 'Số lượng nhận vượt số đặt mua còn lại.', 409)
        const product = sku(actor, poLine.sku_id)
        const serialNumbers = line.serialNumbers ?? []
        if (!Array.isArray(serialNumbers) || serialNumbers.length > 10000)
          fail('INVALID_INPUT', 'Danh sách serial không hợp lệ.')
        const cleaned = serialNumbers.map((serial) => text(serial, 'Serial', 1, 120))
        if (product.serial_tracked && cleaned.length !== quantity)
          fail('SERIAL_REQUIRED', 'Số serial nhận phải bằng số lượng đặt nhận.')
        if (!product.serial_tracked && cleaned.length)
          fail('SERIAL_DISABLED', 'SKU này không được cấu hình quản lý serial.')
        if (new Set(cleaned).size !== cleaned.length)
          fail('DUPLICATE_SERIAL', 'Serial bị trùng trong phiếu nhận.')
        staged.push({ poLine, quantity, serialNumbers: cleaned })
      }
      const receiptId = id()
      const number = `PN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${receiptId.slice(0, 8).toUpperCase()}`
      run(
        'INSERT INTO stock_documents(id,tenant_id,number,type,warehouse_id,supplier_id,reference,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        receiptId,
        tenantId,
        number,
        'receipt',
        order.warehouse_id,
        order.supplier_id,
        text(input.reference ?? order.number, 'Tham chiếu', 1, 200),
        `Nhận theo đơn mua ${order.number}`,
        actor.userId,
        now(),
      )
      run(
        'INSERT INTO purchase_order_receipts(tenant_id,purchase_order_id,document_id) VALUES (?,?,?)',
        tenantId,
        order.id,
        receiptId,
      )
      for (const { poLine, quantity, serialNumbers } of staged) {
        const documentLineId = id()
        run(
          'INSERT INTO stock_document_lines(id,tenant_id,document_id,sku_id,location_id,quantity,unit_cost,serial_numbers_json) VALUES (?,?,?,?,?,?,?,?)',
          documentLineId,
          tenantId,
          receiptId,
          poLine.sku_id,
          poLine.location_id,
          quantity,
          poLine.unit_cost,
          JSON.stringify(serialNumbers),
        )
        run(
          'INSERT INTO purchase_receipt_lines(tenant_id,document_line_id,purchase_order_line_id) VALUES (?,?,?)',
          tenantId,
          documentLineId,
          poLine.id,
        )
      }
      return { id: receiptId, number, purchaseOrderId: order.id }
    }
    if (action === 'document.create') {
      keys(input, [
        'type',
        'warehouseId',
        'targetWarehouseId',
        'supplierId',
        'reference',
        'reason',
        'lines',
        'returnToStock',
        'sourceDocumentId',
      ])
      if (!['receipt', 'issue', 'transfer', 'adjustment'].includes(input.type))
        fail('INVALID_INPUT', 'Loại phiếu không hợp lệ.')
      if (actor.role === 'receiver' && !['receipt', 'transfer'].includes(input.type))
        fail('FORBIDDEN', 'Nhân viên nhập kho chỉ lập phiếu nhập/chuyển kho.', 403)
      if (actor.role === 'issuer' && !['issue', 'transfer'].includes(input.type))
        fail('FORBIDDEN', 'Nhân viên xuất kho chỉ lập phiếu xuất/chuyển kho.', 403)
      warehouse(actor, input.warehouseId)
      if (input.type === 'transfer') {
        if (!configuration(tenantId).multiWarehouseEnabled)
          fail('MULTI_WAREHOUSE_DISABLED', 'Chuyển kho chưa được bật trong cấu hình.', 409)
        warehouse(actor, input.targetWarehouseId)
        if (input.targetWarehouseId === input.warehouseId)
          fail('INVALID_INPUT', 'Kho đích phải khác kho nguồn.')
      } else if (input.targetWarehouseId) fail('INVALID_INPUT', 'Chỉ phiếu chuyển kho có kho đích.')
      if (input.supplierId) {
        const supplier = requireRecord('suppliers', tenantId, input.supplierId, 'Nhà cung cấp')
        if (!supplier.active) fail('SUPPLIER_INACTIVE', 'Nhà cung cấp đã ngừng hoạt động.')
      }
      const returning = own(input, 'returnToStock') ? bool(input.returnToStock, 'Nhập hàng trả') : 0
      if (returning && input.type !== 'receipt')
        fail('INVALID_INPUT', 'Nhập hàng trả chỉ dùng phiếu nhập.')
      if (input.type === 'receipt' && !returning && !['owner', 'admin'].includes(actor.role))
        fail(
          'PURCHASE_ORDER_REQUIRED',
          'Phiếu nhập mua phải được tạo từ đơn mua đã được kế toán duyệt.',
          403,
        )
      if (returning) {
        const source = requireRecord(
          'stock_documents',
          tenantId,
          input.sourceDocumentId,
          'Phiếu xuất gốc',
        )
        if (source.type !== 'issue' || source.status !== 'posted')
          fail('INVALID_RETURN_SOURCE', 'Hàng trả phải tham chiếu phiếu xuất đã ghi sổ.')
      } else if (input.sourceDocumentId)
        fail('INVALID_INPUT', 'Chỉ phiếu nhập hàng trả được tham chiếu phiếu xuất gốc.')
      const reference = text(input.reference ?? '', 'Tham chiếu', returning ? 1 : 0, 200)
      const reason = text(
        input.reason ?? '',
        'Lý do',
        input.type === 'adjustment' || returning ? 5 : 0,
        2000,
      )
      if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 200)
        fail('INVALID_INPUT', 'Phiếu cần từ 1 đến 200 dòng hàng.')
      const entityId = id()
      const number = `${{ receipt: 'PN', issue: 'PX', transfer: 'CK', adjustment: 'DC' }[input.type]}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${entityId.slice(0, 8).toUpperCase()}`
      run(
        'INSERT INTO stock_documents(id,tenant_id,number,type,warehouse_id,target_warehouse_id,supplier_id,reference,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        number,
        input.type,
        input.warehouseId,
        input.type === 'transfer' ? input.targetWarehouseId : null,
        input.supplierId || null,
        reference,
        reason,
        actor.userId,
        now(),
      )
      if (returning)
        run(
          'UPDATE stock_documents SET return_to_stock=1 WHERE tenant_id=? AND id=?',
          tenantId,
          entityId,
        )
      if (returning)
        run(
          'INSERT INTO stock_document_returns(tenant_id,document_id,source_document_id) VALUES (?,?,?)',
          tenantId,
          entityId,
          input.sourceDocumentId,
        )
      const seen = new Set()
      const serialsSeen = new Set()
      for (const line of input.lines) {
        keys(line, [
          'skuId',
          'quantity',
          'unitCost',
          'locationId',
          'targetLocationId',
          'serialNumbers',
          'reservationId',
          'reservationIds',
          'reservationAllocations',
        ])
        const product = sku(actor, line.skuId)
        const source = location(actor, input.warehouseId, line.locationId)
        const target =
          input.type === 'transfer'
            ? location(actor, input.targetWarehouseId, line.targetLocationId)
            : null
        const quantity = integer(
          line.quantity,
          'Số lượng',
          input.type === 'adjustment' ? -1000000000 : 1,
          1000000000,
        )
        if (quantity === 0) fail('INVALID_INPUT', 'Số lượng điều chỉnh phải khác 0.')
        const unique = `${product.id}:${source.id}`
        if (seen.has(unique)) fail('DUPLICATE_LINE', 'SKU và vị trí bị trùng trong phiếu.')
        seen.add(unique)
        const incoming = input.type === 'receipt' || (input.type === 'adjustment' && quantity > 0)
        const unitCost = incoming
          ? integer(line.unitCost, 'Giá vốn nhập')
          : integer(line.unitCost ?? 0, 'Giá vốn')
        if (incoming) multiply(quantity, unitCost)
        const serialNumbers = line.serialNumbers ?? []
        if (!Array.isArray(serialNumbers) || serialNumbers.length > 10000)
          fail('INVALID_INPUT', 'Danh sách serial không hợp lệ.')
        const cleaned = serialNumbers.map((serial) => text(serial, 'Serial', 1, 120))
        if (product.serial_tracked && cleaned.length !== Math.abs(quantity))
          fail('SERIAL_REQUIRED', 'Số serial phải bằng số lượng thiết bị.')
        if (!product.serial_tracked && cleaned.length)
          fail('SERIAL_DISABLED', 'SKU này không được cấu hình quản lý serial.')
        for (const serial of cleaned) {
          if (serialsSeen.has(serial)) fail('DUPLICATE_SERIAL', 'Serial bị trùng trong phiếu.')
          serialsSeen.add(serial)
        }
        let allocations = line.reservationAllocations ?? []
        if (own(line, 'reservationId') || own(line, 'reservationIds')) {
          if (
            own(line, 'reservationAllocations') ||
            (own(line, 'reservationId') && own(line, 'reservationIds'))
          )
            fail(
              'INVALID_INPUT',
              'Chọn reservationId(s) hoặc reservationAllocations, không trộn các dạng.',
            )
          const selected = own(line, 'reservationId') ? [line.reservationId] : line.reservationIds
          if (
            !Array.isArray(selected) ||
            selected.length > 100 ||
            new Set(selected).size !== selected.length
          )
            fail('INVALID_INPUT', 'Danh sách giữ hàng không hợp lệ.')
          allocations = selected.map((reservationId) => {
            const held = requireRecord('reservations', tenantId, reservationId, 'Giữ hàng')
            return { reservationId, quantity: held.quantity_remaining }
          })
        }
        if (!Array.isArray(allocations) || allocations.length > 100)
          fail('INVALID_INPUT', 'Danh sách phân bổ giữ hàng không hợp lệ.')
        const allocationIds = new Set()
        let allocationQuantity = 0
        for (const allocation of allocations) {
          keys(allocation, ['reservationId', 'quantity'])
          const held = requireRecord('reservations', tenantId, allocation.reservationId, 'Giữ hàng')
          const reservedQuantity = integer(allocation.quantity, 'Lượng giữ tiêu thụ', 1)
          if (
            allocationIds.has(held.id) ||
            !['active', 'partial'].includes(held.status) ||
            held.warehouse_id !== input.warehouseId ||
            held.location_id !== source.id ||
            held.sku_id !== product.id ||
            held.quantity_remaining < reservedQuantity ||
            input.type !== 'issue'
          )
            fail(
              'RESERVATION_UNAVAILABLE',
              'Giữ hàng không khớp SKU/kho/vị trí hoặc không còn đủ lượng.',
              409,
            )
          allocationIds.add(held.id)
          allocationQuantity = add(allocationQuantity, reservedQuantity)
        }
        if (allocationQuantity > 0 && allocationQuantity > quantity)
          fail('INVALID_RESERVATION_ALLOCATION', 'Tổng lượng giữ tiêu thụ vượt số lượng xuất.')
        const lineId = id()
        run(
          'INSERT INTO stock_document_lines(id,tenant_id,document_id,sku_id,location_id,target_location_id,quantity,unit_cost,serial_numbers_json) VALUES (?,?,?,?,?,?,?,?,?)',
          lineId,
          tenantId,
          entityId,
          product.id,
          source.id,
          target?.id ?? null,
          quantity,
          unitCost,
          JSON.stringify(cleaned),
        )
        for (const allocation of allocations)
          run(
            'INSERT INTO reservation_allocations(tenant_id,document_line_id,reservation_id,quantity) VALUES (?,?,?,?)',
            tenantId,
            lineId,
            allocation.reservationId,
            allocation.quantity,
          )
      }
      return { id: entityId, number }
    }
    if (
      [
        'document.approve',
        'document.post',
        'document.cancel',
        'document.transfer_receive',
      ].includes(action)
    ) {
      keys(input, ['id'])
      const document = requireRecord('stock_documents', tenantId, input.id, 'Phiếu kho')
      authorizePurchaseReceipt(actor, document)
      if (actor.role === 'receiver' && !['receipt', 'transfer'].includes(document.type))
        fail('FORBIDDEN', 'Nhân viên nhận hàng chỉ duyệt/ghi sổ phiếu nhập hoặc chuyển kho.', 403)
      if (action === 'document.approve') {
        if (document.status !== 'draft')
          fail('INVALID_TRANSITION', 'Chỉ phiếu nháp được duyệt.', 409)
        run(
          "UPDATE stock_documents SET status='approved',approved_by=?,approved_at=? WHERE tenant_id=? AND id=?",
          actor.userId,
          now(),
          tenantId,
          document.id,
        )
      } else if (action === 'document.cancel') {
        if (!['draft', 'approved'].includes(document.status))
          fail(
            'INVALID_TRANSITION',
            'Phiếu đã ghi sổ không được hủy. Hãy lập phiếu đảo/điều chỉnh có lý do.',
            409,
          )
        run(
          "UPDATE stock_documents SET status='cancelled' WHERE tenant_id=? AND id=?",
          tenantId,
          document.id,
        )
      } else {
        const receiving = action === 'document.transfer_receive'
        if (receiving && (document.type !== 'transfer' || document.status !== 'in_transit'))
          fail('INVALID_TRANSITION', 'Chỉ nhận phiếu chuyển kho đang vận chuyển.', 409)
        if (!receiving && document.status !== 'approved')
          fail('INVALID_TRANSITION', 'Phiếu phải được duyệt trước khi ghi sổ.', 409)
        warehouse(actor, document.warehouse_id)
        if (document.target_warehouse_id) warehouse(actor, document.target_warehouse_id)
        const lines = all(
          'SELECT * FROM stock_document_lines WHERE tenant_id=? AND document_id=? ORDER BY id',
          tenantId,
          document.id,
        )
        for (const line of lines) {
          const product = sku(actor, line.sku_id)
          const purchaseOrderId = applyPurchaseReceipt(actor, document, line)
          consumeReservations(actor, document, line)
          const returningValue = document.return_to_stock
            ? returnValuation(actor, product, line, document)
            : null
          serialMovement(actor, product, line, document, receiving)
          const quantity =
            receiving || document.type === 'receipt'
              ? Math.abs(line.quantity)
              : ['issue', 'transfer'].includes(document.type)
                ? -line.quantity
                : line.quantity
          const incomingValue =
            returningValue ??
            (receiving
              ? integer(line.inventory_value, 'Giá trị chuyển kho')
              : quantity > 0
                ? multiply(quantity, line.unit_cost)
                : undefined)
          const value = movement(actor, {
            warehouseId: receiving ? document.target_warehouse_id : document.warehouse_id,
            locationId: receiving ? line.target_location_id : line.location_id,
            skuId: line.sku_id,
            documentId: document.id,
            kind: receiving
              ? 'transfer_receive'
              : document.type === 'transfer'
                ? 'transfer_dispatch'
                : document.type,
            quantity,
            incomingValue,
          })
          recordSerialIssue(actor, product, line, document, value)
          if (!receiving)
            run(
              'UPDATE stock_document_lines SET inventory_value=? WHERE tenant_id=? AND id=?',
              value,
              tenantId,
              line.id,
            )
          if (purchaseOrderId) {
            const outstanding = get(
              'SELECT COALESCE(SUM(quantity-received_quantity),0) AS quantity FROM purchase_order_lines WHERE tenant_id=? AND purchase_order_id=?',
              tenantId,
              purchaseOrderId,
            ).quantity
            run(
              'UPDATE purchase_orders SET status=?,completed_at=? WHERE tenant_id=? AND id=?',
              outstanding ? 'partial' : 'received',
              outstanding ? null : now(),
              tenantId,
              purchaseOrderId,
            )
          }
        }
        if (receiving)
          run(
            "UPDATE stock_documents SET status='received',received_at=? WHERE tenant_id=? AND id=?",
            now(),
            tenantId,
            document.id,
          )
        else
          run(
            'UPDATE stock_documents SET status=?,posted_by=?,posted_at=? WHERE tenant_id=? AND id=?',
            document.type === 'transfer' ? 'in_transit' : 'posted',
            actor.userId,
            now(),
            tenantId,
            document.id,
          )
      }
      return { id: document.id }
    }
    if (action === 'reservation.create') {
      keys(input, ['warehouseId', 'locationId', 'skuId', 'quantity', 'reference'])
      warehouse(actor, input.warehouseId)
      sku(actor, input.skuId)
      const position = location(actor, input.warehouseId, input.locationId)
      const quantity = integer(input.quantity, 'Số lượng giữ', 1)
      const reference = text(input.reference, 'Tham chiếu', 1, 200)
      const current = balance(actor, input.warehouseId, position.id, input.skuId)
      if (current.on_hand - current.reserved - current.damaged - current.warranty < quantity)
        fail('INSUFFICIENT_STOCK', 'Tồn khả dụng không đủ để giữ hàng.', 409)
      const entityId = id()
      run(
        'INSERT INTO reservations(id,tenant_id,warehouse_id,location_id,sku_id,quantity,quantity_remaining,reference,status,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        input.warehouseId,
        position.id,
        input.skuId,
        quantity,
        quantity,
        reference,
        'active',
        now(),
        actor.userId,
      )
      run(
        'UPDATE balances SET reserved=reserved+?,updated_at=? WHERE tenant_id=? AND warehouse_id=? AND location_id=? AND sku_id=?',
        quantity,
        now(),
        tenantId,
        input.warehouseId,
        position.id,
        input.skuId,
      )
      return { id: entityId }
    }
    if (action === 'reservation.release') {
      keys(input, ['id'])
      const row = requireRecord('reservations', tenantId, input.id, 'Giữ hàng')
      if (!['active', 'partial'].includes(row.status))
        fail('INVALID_TRANSITION', 'Giữ hàng đã được giải phóng hoặc tiêu thụ.', 409)
      run(
        "UPDATE reservations SET status='released',released_at=?,released_quantity=released_quantity+quantity_remaining,quantity_remaining=0 WHERE tenant_id=? AND id=?",
        now(),
        tenantId,
        row.id,
      )
      run(
        'UPDATE balances SET reserved=reserved-?,updated_at=? WHERE tenant_id=? AND warehouse_id=? AND location_id=? AND sku_id=?',
        row.quantity_remaining,
        now(),
        tenantId,
        row.warehouse_id,
        row.location_id,
        row.sku_id,
      )
      return { id: row.id }
    }
    if (action === 'count.create') {
      keys(input, ['warehouseId', 'name'])
      warehouse(actor, input.warehouseId)
      const entityId = id()
      run(
        'INSERT INTO stock_counts(id,tenant_id,warehouse_id,name,ledger_sequence,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        input.warehouseId,
        text(input.name, 'Tên kiểm kê', 1, 200),
        ledgerSequence(actor, input.warehouseId),
        actor.userId,
        now(),
      )
      for (const row of all(
        'SELECT * FROM balances WHERE tenant_id=? AND warehouse_id=?',
        tenantId,
        input.warehouseId,
      ))
        run(
          'INSERT INTO stock_count_lines(id,tenant_id,count_id,sku_id,location_id,expected_quantity) VALUES (?,?,?,?,?,?)',
          id(),
          tenantId,
          entityId,
          row.sku_id,
          row.location_id,
          row.on_hand,
        )
      return { id: entityId }
    }
    if (action === 'count.record') {
      keys(input, ['id', 'lines'])
      const count = requireRecord('stock_counts', tenantId, input.id, 'Phiếu kiểm kê')
      if (count.status !== 'draft')
        fail('INVALID_TRANSITION', 'Kiểm kê đã duyệt không được sửa.', 409)
      if (!Array.isArray(input.lines) || input.lines.length > 1000 || !input.lines.length)
        fail('INVALID_INPUT', 'Cần từ 1 đến 1.000 dòng kiểm kê.')
      const seen = new Set()
      for (const line of input.lines) {
        keys(line, ['skuId', 'locationId', 'countedQuantity', 'unitCost'])
        sku(actor, line.skuId)
        const position = location(actor, count.warehouse_id, line.locationId)
        const quantity = integer(line.countedQuantity, 'Số kiểm thực tế')
        const unitCost = own(line, 'unitCost')
          ? integer(line.unitCost, 'Giá vốn chênh lệch kiểm kê')
          : null
        const key = `${line.skuId}:${position.id}`
        if (seen.has(key)) fail('DUPLICATE_LINE', 'Dòng kiểm kê bị trùng.')
        seen.add(key)
        const existing = get(
          'SELECT * FROM stock_count_lines WHERE tenant_id=? AND count_id=? AND sku_id=? AND location_id=?',
          tenantId,
          count.id,
          line.skuId,
          position.id,
        )
        if (existing)
          run(
            'UPDATE stock_count_lines SET counted_quantity=?,unit_cost=? WHERE tenant_id=? AND id=?',
            quantity,
            unitCost,
            tenantId,
            existing.id,
          )
        else
          run(
            'INSERT INTO stock_count_lines(id,tenant_id,count_id,sku_id,location_id,expected_quantity,counted_quantity,unit_cost) VALUES (?,?,?,?,?,?,?,?)',
            id(),
            tenantId,
            count.id,
            line.skuId,
            position.id,
            0,
            quantity,
            unitCost,
          )
      }
      return { id: count.id }
    }
    if (action === 'count.approve') {
      keys(input, ['id'])
      const count = requireRecord('stock_counts', tenantId, input.id, 'Phiếu kiểm kê')
      warehouse(actor, count.warehouse_id)
      if (count.status !== 'draft') fail('INVALID_TRANSITION', 'Kiểm kê đã được duyệt.', 409)
      if (ledgerSequence(actor, count.warehouse_id) !== count.ledger_sequence)
        fail(
          'COUNT_STALE',
          'Kho đã có giao dịch sau khi mở kiểm kê. Hãy tạo phiên kiểm kê mới.',
          409,
        )
      const lines = all(
        'SELECT * FROM stock_count_lines WHERE tenant_id=? AND count_id=?',
        tenantId,
        count.id,
      )
      if (!lines.length || lines.some((line) => line.counted_quantity === null))
        fail('COUNT_INCOMPLETE', 'Cần ghi số thực tế cho tất cả dòng trước khi duyệt.')
      for (const line of lines) {
        const difference = line.counted_quantity - line.expected_quantity
        if (!difference) continue
        const product = sku(actor, line.sku_id)
        if (product.serial_tracked)
          fail(
            'SERIAL_COUNT_REQUIRED',
            'Chênh lệch hàng có serial cần phiếu nhập/xuất nêu rõ serial; không điều chỉnh tự suy đoán.',
          )
        const current = balance(actor, count.warehouse_id, line.location_id, line.sku_id)
        if (difference > 0 && !current.on_hand && line.unit_cost === null)
          fail(
            'COUNT_COST_REQUIRED',
            'Chênh lệch nhập thêm chưa có giá vốn; cần nhập unitCost rõ ràng cho dòng kiểm kê.',
          )
        const unitCost =
          line.unit_cost ??
          (current.on_hand ? Math.round(current.inventory_value / current.on_hand) : 0)
        movement(actor, {
          warehouseId: count.warehouse_id,
          locationId: line.location_id,
          skuId: line.sku_id,
          countId: count.id,
          kind: 'count_adjustment',
          quantity: difference,
          incomingValue: difference > 0 ? multiply(difference, unitCost) : undefined,
        })
      }
      run(
        "UPDATE stock_counts SET status='approved',approved_by=?,approved_at=? WHERE tenant_id=? AND id=?",
        actor.userId,
        now(),
        tenantId,
        count.id,
      )
      return { id: count.id }
    }
    if (action === 'warranty.create') {
      keys(input, ['serialId', 'customerName', 'issue'])
      const serial = requireRecord('serials', tenantId, input.serialId, 'Serial')
      if (serial.status === 'in_transit')
        fail('SERIAL_UNAVAILABLE', 'Thiết bị đang chuyển kho; chưa thể tiếp nhận bảo hành.', 409)
      if (serial.status === 'in_stock' && serial.quality_status !== 'warranty')
        fail(
          'WARRANTY_QUARANTINE_REQUIRED',
          'Thiết bị còn trong tồn bán: cần chuyển sang khu bảo hành trước khi lập phiếu.',
          409,
        )
      if (
        get(
          "SELECT 1 FROM warranties WHERE tenant_id=? AND serial_id=? AND status != 'returned'",
          tenantId,
          serial.id,
        )
      )
        fail('WARRANTY_OPEN', 'Serial đang có phiếu bảo hành chưa trả khách.', 409)
      const issue = get(
        `SELECT p.*,d.created_at AS issue_at FROM serial_issues p
        JOIN stock_documents d ON d.tenant_id=p.tenant_id AND d.id=p.document_id
        WHERE p.tenant_id=? AND p.serial_id=? AND d.status='posted'
        ORDER BY p.sequence DESC LIMIT 1`,
        tenantId,
        serial.id,
      )
      if (!issue || (serial.status === 'issued' && issue.returned_by_document_id !== null))
        fail(
          'WARRANTY_PROVENANCE_REQUIRED',
          'Chưa tìm thấy phiếu xuất serial đã ghi sổ để xác nhận thời gian bảo hành.',
          409,
        )
      const entityId = id()
      const stamp = now()
      const warrantyValidAtIntake =
        issue.warranty_ends_at !== null && issue.warranty_ends_at >= stamp ? 1 : 0
      const history = [
        {
          status: 'received',
          note: text(input.issue, 'Mô tả lỗi', 5, 2000),
          actorId: actor.userId,
          createdAt: stamp,
        },
      ]
      run(
        'INSERT INTO warranties(id,tenant_id,serial_id,customer_name,issue,history_json,created_at,updated_at,received_from_customer_at,warranty_valid_at_intake,warranty_ends_at,source_issue_document_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        serial.id,
        text(input.customerName, 'Tên khách hàng', 1, 200),
        history[0].note,
        JSON.stringify(history),
        stamp,
        stamp,
        stamp,
        warrantyValidAtIntake,
        issue.warranty_ends_at,
        issue.document_id,
      )
      return { id: entityId }
    }
    if (action === 'warranty.transition') {
      keys(input, ['id', 'status', 'note'])
      const row = requireRecord('warranties', tenantId, input.id, 'Phiếu bảo hành')
      const transitions = {
        received: ['repairing', 'rejected', 'returned'],
        repairing: ['completed', 'rejected'],
        completed: ['returned'],
        rejected: ['returned'],
        returned: [],
      }
      if (!transitions[row.status].includes(input.status))
        fail('INVALID_TRANSITION', 'Chuyển trạng thái bảo hành không hợp lệ.', 409)
      const note = text(input.note ?? '', 'Nội dung xử lý', 1, 2000)
      const history = JSON.parse(row.history_json)
      history.push({ status: input.status, note, actorId: actor.userId, createdAt: now() })
      run(
        "UPDATE warranties SET status=?,history_json=?,updated_at=?,resolution=CASE WHEN ? IN ('completed','rejected') THEN ? ELSE resolution END WHERE tenant_id=? AND id=?",
        input.status,
        JSON.stringify(history),
        now(),
        input.status,
        note,
        tenantId,
        row.id,
      )
      return { id: row.id }
    }
    if (action === 'config.update') {
      keys(input, ['config'])
      validateConfig(input.config)
      const existing = JSON.parse(
        get('SELECT config_json FROM tenants WHERE id=?', tenantId).config_json,
      )
      const config = { ...existing, ...input.config }
      if (
        config.multiWarehouseEnabled === false &&
        (get('SELECT COUNT(*) AS total FROM warehouses WHERE tenant_id=? AND active=1', tenantId)
          .total > 1 ||
          get(
            "SELECT 1 FROM stock_documents WHERE tenant_id=? AND type='transfer' AND status IN ('draft','approved','in_transit')",
            tenantId,
          ))
      )
        fail(
          'WAREHOUSES_IN_USE',
          'Cần còn một kho hoạt động và hoàn tất chuyển kho trước khi tắt nhiều kho.',
          409,
        )
      run('UPDATE tenants SET config_json=? WHERE id=?', jsonObject(config, 'Cấu hình'), tenantId)
      return { id: tenantId }
    }
    if (action === 'quality.reclassify') {
      keys(input, [
        'warehouseId',
        'locationId',
        'skuId',
        'quantity',
        'from',
        'to',
        'reason',
        'serialNumbers',
      ])
      warehouse(actor, input.warehouseId)
      const product = sku(actor, input.skuId)
      const position = location(actor, input.warehouseId, input.locationId)
      const quantity = integer(input.quantity, 'Số lượng phân loại', 1)
      text(input.reason, 'Lý do phân loại', 5, 2000)
      const buckets = ['available', 'damaged', 'warranty']
      if (!buckets.includes(input.from) || !buckets.includes(input.to) || input.from === input.to)
        fail('INVALID_INPUT', 'Cần chọn hai nhóm tồn khác nhau.')
      const current = balance(actor, input.warehouseId, position.id, input.skuId)
      const available = current.on_hand - current.reserved - current.damaged - current.warranty
      if ((input.from === 'available' ? available : current[input.from]) < quantity)
        fail('INSUFFICIENT_STOCK', 'Số lượng nhóm tồn nguồn không đủ.', 409)
      const serialNumbers = input.serialNumbers ?? []
      if (
        !Array.isArray(serialNumbers) ||
        new Set(serialNumbers).size !== serialNumbers.length ||
        (product.serial_tracked ? serialNumbers.length !== quantity : serialNumbers.length !== 0)
      )
        fail('SERIAL_REQUIRED', 'Danh sách serial phải khớp số thiết bị theo cấu hình SKU.')
      for (const serialNumber of serialNumbers) {
        const serial = get(
          'SELECT * FROM serials WHERE tenant_id=? AND sku_id=? AND serial_number=? AND warehouse_id=? AND location_id=?',
          tenantId,
          product.id,
          text(serialNumber, 'Serial', 1, 120),
          input.warehouseId,
          position.id,
        )
        if (!serial || serial.status !== 'in_stock' || serial.quality_status !== input.from)
          fail('SERIAL_UNAVAILABLE', `Serial ${serialNumber} không thuộc nhóm tồn nguồn.`, 409)
        if (
          input.from === 'warranty' &&
          get(
            "SELECT 1 FROM warranties WHERE tenant_id=? AND serial_id=? AND status != 'returned'",
            tenantId,
            serial.id,
          )
        )
          fail(
            'WARRANTY_OPEN',
            'Phiếu bảo hành phải hoàn tất trước khi đưa thiết bị ra khỏi nhóm bảo hành.',
            409,
          )
        run(
          'UPDATE serials SET quality_status=?,updated_at=? WHERE tenant_id=? AND id=?',
          input.to,
          now(),
          tenantId,
          serial.id,
        )
      }
      const damaged =
        current.damaged +
        (input.to === 'damaged' ? quantity : 0) -
        (input.from === 'damaged' ? quantity : 0)
      const warranty =
        current.warranty +
        (input.to === 'warranty' ? quantity : 0) -
        (input.from === 'warranty' ? quantity : 0)
      run(
        'UPDATE balances SET damaged=?,warranty=?,updated_at=? WHERE tenant_id=? AND warehouse_id=? AND location_id=? AND sku_id=?',
        damaged,
        warranty,
        now(),
        tenantId,
        input.warehouseId,
        position.id,
        product.id,
      )
      const entityId = id()
      run(
        'INSERT INTO ledger(id,tenant_id,warehouse_id,location_id,sku_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at,quality_from,quality_to,quality_quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        entityId,
        tenantId,
        input.warehouseId,
        position.id,
        product.id,
        'quality_reclassify',
        0,
        0,
        current.on_hand,
        current.inventory_value,
        actor.userId,
        now(),
        input.from,
        input.to,
        quantity,
      )
      return { id: entityId }
    }
    fail('UNKNOWN_ACTION', 'Thao tác không được hỗ trợ.', 404)
  }

  const executeInTransaction = (actor, action, input) => {
    const authorized = authorize(actor, action)
    if (!ALL_PERMISSIONS.includes(action)) fail('UNKNOWN_ACTION', 'Thao tác không được hỗ trợ.', 404)
    if (!object(input)) fail('INVALID_INPUT', 'Thông tin yêu cầu phải là object JSON.')
    const result = execute(authorized, action, input)
    audit(authorized, action, result.id, input)
    return result
  }
  const sales = createSales(db, { executeInventory: executeInTransaction })

  return {
    executeInTransaction,
    snapshot(actor, filters = {}) {
      // A read transaction keeps metrics and rows on one consistent database snapshot.
      db.exec('BEGIN')
      try {
        const result = snapshotData(authorize(actor), filters)
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    command(actor, action, input, idempotencyKey) {
      try {
        return transaction(db, () => {
          const authorized = authorize(actor, action)
          if (!ALL_PERMISSIONS.includes(action))
            fail('UNKNOWN_ACTION', 'Thao tác không được hỗ trợ.', 404)
          const key = text(idempotencyKey, 'Idempotency-Key', 8, 200)
          if (!object(input)) fail('INVALID_INPUT', 'Thông tin yêu cầu phải là object JSON.')
          const requestHash = hash({ action, input, userId: authorized.userId })
          const existing = get(
            'SELECT * FROM idempotency_keys WHERE tenant_id=? AND key=?',
            authorized.tenantId,
            key,
          )
          if (existing) {
            if (existing.request_hash !== requestHash)
              fail('IDEMPOTENCY_CONFLICT', 'Mã thao tác đã được dùng với yêu cầu khác.', 409)
            return {
              ...snapshotData(authorized),
              result: JSON.parse(existing.response_json).result,
            }
          }
          const result = execute(authorized, action, input)
          audit(authorized, action, result.id, input)
          const response = { ...snapshotData(authorized), result }
          run(
            'INSERT INTO idempotency_keys(tenant_id,key,request_hash,response_json,created_at) VALUES (?,?,?,?,?)',
            authorized.tenantId,
            key,
            requestHash,
            JSON.stringify({ result }),
            now(),
          )
          return response
        })
      } catch (error) {
        if (error instanceof DomainError) throw error
        if (error.code?.startsWith('ERR_SQLITE') && /UNIQUE constraint failed/.test(error.message))
          fail('DUPLICATE_RECORD', 'Mã hoặc thông tin đã tồn tại trong doanh nghiệp.', 409)
        if (error.code?.startsWith('ERR_SQLITE') && /database is locked/.test(error.message))
          fail(
            'DATABASE_BUSY',
            'Kho đang có giao dịch khác. Hãy thử lại với cùng mã thao tác.',
            409,
          )
        throw error
      }
    },
  }
}
