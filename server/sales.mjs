import { randomUUID } from 'node:crypto'
import { DomainError } from './database.mjs'
import { DEFAULT_ROLE_PERMISSIONS, hasPermission, SALES_ACTIONS } from './access-control.mjs'

export { SALES_ACTIONS }

const fail = (code, message, status = 422) => {
  throw new DomainError(status, code, message)
}
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const clean = (value, label, min = 0, max = 500) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)),
    )
  )
    fail('INVALID_INPUT', `${label} không hợp lệ (tối đa ${max} ký tự).`)
  return value.trim()
}
const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail('INVALID_INPUT', `${label} phải là số nguyên từ ${min} đến ${max}.`)
  return value
}
const safeAmount = (value) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n)
    fail('AMOUNT_OVERFLOW', 'Giá trị đơn bán vượt giới hạn số nguyên an toàn.')
  return Number(value)
}
const keys = (value, allowed) => {
  if (!isObject(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    fail('INVALID_INPUT', 'Thông tin đơn hàng có trường không được hỗ trợ.')
}
export function salesPermissions(role) {
  return (DEFAULT_ROLE_PERMISSIONS[role] ?? []).filter((permission) =>
    SALES_ACTIONS.includes(permission),
  )
}

export function createSales(db, { executeInventory, now = () => new Date() } = {}) {
  if (typeof executeInventory !== 'function')
    throw new TypeError('createSales requires a synchronous raw inventory executor')
  const get = (sql, ...values) => db.prepare(sql).get(...values)
  const all = (sql, ...values) => db.prepare(sql).all(...values)
  const run = (sql, ...values) => db.prepare(sql).run(...values)
  const stamp = () => now().toISOString()
  const newId = () => randomUUID()
  const postedReturns = (tenantId, sourceDocumentId, skuId) => {
    if (!sourceDocumentId) return { quantity: 0, value: 0 }
    const rows = all(
      `SELECT l.quantity,l.inventory_value FROM stock_document_returns r
        JOIN stock_documents d ON d.tenant_id=r.tenant_id AND d.id=r.document_id AND d.status='posted'
        JOIN stock_document_lines l ON l.tenant_id=d.tenant_id AND l.document_id=d.id
        WHERE r.tenant_id=? AND r.source_document_id=? AND l.sku_id=?`,
      tenantId,
      sourceDocumentId,
      skuId,
    )
    return rows.reduce(
      (total, row) => ({
        quantity: safeAmount(BigInt(total.quantity) + BigInt(row.quantity)),
        value: safeAmount(BigInt(total.value) + BigInt(row.inventory_value)),
      }),
      { quantity: 0, value: 0 },
    )
  }
  const tenant = (actor) => {
    if (!actor || typeof actor.tenantId !== 'string' || typeof actor.userId !== 'string')
      fail('UNAUTHENTICATED', 'Cần đăng nhập để thao tác đơn hàng.', 401)
    return actor.tenantId
  }
  const authorize = (actor, action) => {
    const tenantId = tenant(actor)
    const user = get(
      'SELECT role FROM users WHERE tenant_id=? AND id=? AND active=1',
      tenantId,
      actor.userId,
    )
    if (!user || (actor.role !== undefined && actor.role !== user.role))
      fail('FORBIDDEN', 'Người dùng không có quyền truy cập doanh nghiệp này.', 403)
    if (action && !hasPermission(db, tenantId, actor.userId, user.role, action))
      fail('FORBIDDEN', 'Vai trò của bạn không được thực hiện thao tác đơn hàng này.', 403)
    const config = get('SELECT config_json FROM tenants WHERE id=?', tenantId)
    if (action && config && JSON.parse(config.config_json).inventoryEnabled === false)
      fail('MODULE_DISABLED', 'Phân hệ kho đang tắt trong cấu hình doanh nghiệp.', 403)
    return { ...actor, role: user.role }
  }
  const order = (actor, id) =>
    get('SELECT * FROM sales_orders WHERE tenant_id=? AND id=?', tenant(actor), id) ??
    fail('NOT_FOUND', 'Đơn bán không tồn tại trong doanh nghiệp.', 404)
  const warehouse = (actor, id) => {
    const row = get(
      'SELECT * FROM warehouses WHERE tenant_id=? AND id=? AND active=1',
      tenant(actor),
      id,
    )
    return row ?? fail('NOT_FOUND', 'Kho không tồn tại hoặc đã ngừng hoạt động.', 404)
  }
  const roleAllowed = (actor, action) => {
    if (!hasPermission(db, actor.tenantId, actor.userId, actor.role, action))
      fail('FORBIDDEN', 'Vai trò của bạn không được thực hiện thao tác đơn hàng này.', 403)
  }

  function create(actor, input) {
    keys(input, ['warehouseId', 'customerReference', 'reference', 'lines', 'note'])
    const tenantId = tenant(actor)
    const warehouseRow = warehouse(actor, input.warehouseId)
    const customerReference = clean(input.customerReference, 'Tham chiếu khách hàng', 1, 200)
    const reference = clean(input.reference ?? '', 'Mã tham chiếu', 0, 200)
    const note = clean(input.note ?? '', 'Ghi chú', 0, 2000)
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100)
      fail('INVALID_INPUT', 'Đơn bán cần từ 1 đến 100 dòng hàng.')

    const seen = new Set()
    let totalPrice = 0n
    const normalized = input.lines.map((line) => {
      keys(line, ['skuId', 'quantity', 'unitPrice', 'locationId'])
      const skuId = clean(line.skuId, 'SKU', 1, 200)
      if (seen.has(skuId))
        fail('DUPLICATE_LINE', 'Mỗi SKU chỉ được xuất hiện một lần trong đơn bán.')
      seen.add(skuId)
      const product = get(
        'SELECT id,sku,name,serial_tracked,price,price_known FROM inventory_skus WHERE tenant_id=? AND id=? AND active=1',
        tenantId,
        skuId,
      )
      if (!product) fail('NOT_FOUND', 'SKU không tồn tại hoặc đã ngừng kinh doanh.', 404)
      if (!product.price_known)
        fail('PRICE_NOT_SET', `SKU ${product.sku} chưa được thiết lập giá bán.`)
      const quantity = integer(line.quantity, 'Số lượng', 1, 999999)
      const unitPrice = integer(product.price, 'Giá bán', 0)
      if (Object.hasOwn(line, 'unitPrice') && line.unitPrice !== unitPrice)
        fail('PRICE_MISMATCH', `Giá bán của SKU ${product.sku} đã thay đổi. Tải lại danh mục.`)
      totalPrice += BigInt(quantity) * BigInt(unitPrice)
      safeAmount(totalPrice)
      const location = line.locationId
        ? get(
            'SELECT id FROM locations WHERE tenant_id=? AND warehouse_id=? AND id=?',
            tenantId,
            warehouseRow.id,
            clean(line.locationId, 'Vị trí', 1, 200),
          )
        : get(
            'SELECT id FROM locations WHERE tenant_id=? AND warehouse_id=? AND is_default=1',
            tenantId,
            warehouseRow.id,
          )
      if (!location) fail('INVALID_LOCATION', 'Vị trí không thuộc kho đã chọn.')
      return {
        product,
        quantity,
        unitPrice,
        locationId: location.id,
      }
    })

    const id = newId()
    const createdAt = stamp()
    const number = `SO-${createdAt.slice(0, 10).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`
    run(
      "INSERT INTO sales_orders(id,tenant_id,number,warehouse_id,customer_reference,reference,note,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?,?)",
      id,
      tenantId,
      number,
      warehouseRow.id,
      customerReference,
      reference,
      note,
      actor.userId,
      createdAt,
      createdAt,
    )
    for (const line of normalized) {
      run(
        'INSERT INTO sales_order_lines(id,tenant_id,sales_order_id,warehouse_id,sku_id,sku_snapshot,name_snapshot,quantity,unit_price,location_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
        newId(),
        tenantId,
        id,
        warehouseRow.id,
        line.product.id,
        line.product.sku,
        line.product.name,
        line.quantity,
        line.unitPrice,
        line.locationId,
      )
    }
    return { id, number }
  }

  function confirm(actor, input) {
    keys(input, ['id'])
    const current = order(actor, clean(input.id, 'ID đơn bán', 1, 200))
    if (current.status !== 'draft')
      fail('INVALID_TRANSITION', 'Chỉ đơn nháp mới được xác nhận.', 409)
    const lines = all(
      'SELECT * FROM sales_order_lines WHERE tenant_id=? AND sales_order_id=? ORDER BY id',
      current.tenant_id,
      current.id,
    )
    for (const line of lines) {
      const reservation = executeInventory(actor, 'reservation.create', {
        warehouseId: current.warehouse_id,
        locationId: line.location_id,
        skuId: line.sku_id,
        quantity: line.quantity,
        reference: current.number,
      })
      if (!reservation || typeof reservation.id !== 'string')
        throw new Error('Inventory reservation did not return its identifier')
      run(
        'INSERT INTO sales_order_line_reservations(tenant_id,sales_order_line_id,reservation_id,created_at) VALUES(?,?,?,?)',
        current.tenant_id,
        line.id,
        reservation.id,
        stamp(),
      )
    }
    const confirmedAt = stamp()
    run(
      "UPDATE sales_orders SET status='confirmed',confirmed_at=?,updated_at=? WHERE tenant_id=? AND id=? AND status='draft'",
      confirmedAt,
      confirmedAt,
      current.tenant_id,
      current.id,
    )
    return { id: current.id }
  }

  function cancel(actor, input) {
    keys(input, ['id', 'reason'])
    const current = order(actor, clean(input.id, 'ID đơn bán', 1, 200))
    if (!['draft', 'confirmed'].includes(current.status))
      fail('INVALID_TRANSITION', 'Chỉ đơn nháp hoặc đã xác nhận, chưa xuất kho, mới được hủy.', 409)
    const reason = clean(input.reason ?? '', 'Lý do hủy', 3, 2000)
    if (current.status === 'confirmed') {
      const reservations = all(
        `SELECT r.id,r.status,r.quantity_remaining FROM sales_order_line_reservations l
          JOIN reservations r ON r.tenant_id=l.tenant_id AND r.id=l.reservation_id
          WHERE l.tenant_id=? AND l.sales_order_line_id IN
            (SELECT id FROM sales_order_lines WHERE tenant_id=? AND sales_order_id=?)`,
        current.tenant_id,
        current.tenant_id,
        current.id,
      )
      for (const reservation of reservations) {
        if (reservation.quantity_remaining > 0)
          executeInventory(actor, 'reservation.release', { id: reservation.id })
      }
    }
    const cancelledAt = stamp()
    run(
      "UPDATE sales_orders SET status='cancelled',note=CASE WHEN note='' THEN ? ELSE note || char(10) || ? END,cancelled_at=?,updated_at=? WHERE tenant_id=? AND id=?",
      `Hủy: ${reason}`,
      `Hủy: ${reason}`,
      cancelledAt,
      cancelledAt,
      current.tenant_id,
      current.id,
    )
    return { id: current.id }
  }

  function fulfillmentSerials(input, lines) {
    keys(input, ['id', 'lines'])
    const supplied = input.lines ?? []
    if (!Array.isArray(supplied) || supplied.length > lines.length)
      fail('INVALID_INPUT', 'Danh sách serial giao hàng không hợp lệ.')
    const byLine = new Map()
    for (const item of supplied) {
      keys(item, ['lineId', 'serialNumbers'])
      const lineId = clean(item.lineId, 'ID dòng đơn hàng', 1, 200)
      if (byLine.has(lineId)) fail('DUPLICATE_LINE', 'Dòng đơn hàng bị lặp trong danh sách serial.')
      if (!Array.isArray(item.serialNumbers) || item.serialNumbers.length > 10000)
        fail('INVALID_INPUT', 'Danh sách serial không hợp lệ.')
      byLine.set(
        lineId,
        item.serialNumbers.map((value) => clean(value, 'Serial Number', 1, 120)),
      )
    }
    return byLine
  }

  function fulfill(actor, input) {
    const current = order(actor, clean(input?.id, 'ID đơn bán', 1, 200))
    if (current.status !== 'confirmed')
      fail('INVALID_TRANSITION', 'Chỉ đơn đã xác nhận và còn giữ đủ hàng mới được xuất kho.', 409)
    const lines = all(
      `SELECT l.*,s.serial_tracked FROM sales_order_lines l JOIN inventory_skus s
        ON s.tenant_id=l.tenant_id AND s.id=l.sku_id
        WHERE l.tenant_id=? AND l.sales_order_id=? ORDER BY l.id`,
      current.tenant_id,
      current.id,
    )
    const serials = fulfillmentSerials(input, lines)
    const reserved = new Map(
      all(
        `SELECT l.sales_order_line_id,r.* FROM sales_order_line_reservations l
          JOIN reservations r ON r.tenant_id=l.tenant_id AND r.id=l.reservation_id
          WHERE l.tenant_id=? AND l.sales_order_line_id IN
            (SELECT id FROM sales_order_lines WHERE tenant_id=? AND sales_order_id=?)`,
        current.tenant_id,
        current.tenant_id,
        current.id,
      ).map((row) => [row.sales_order_line_id, row]),
    )
    const documentLines = lines.map((line) => {
      const reservation = reserved.get(line.id)
      if (
        !reservation ||
        !['active', 'partial'].includes(reservation.status) ||
        reservation.warehouse_id !== current.warehouse_id ||
        reservation.location_id !== line.location_id ||
        reservation.sku_id !== line.sku_id ||
        reservation.quantity_remaining !== line.quantity
      )
        fail('RESERVATION_UNAVAILABLE', 'Đơn hàng không còn giữ đủ lượng đã xác nhận.', 409)
      const serialNumbers = serials.get(line.id) ?? []
      if (line.serial_tracked && serialNumbers.length !== line.quantity)
        fail('SERIAL_REQUIRED', `Cần nhập ${line.quantity} serial cho ${line.name_snapshot}.`)
      if (!line.serial_tracked && serialNumbers.length)
        fail('SERIAL_DISABLED', `${line.name_snapshot} không được cấu hình theo dõi serial.`)
      return {
        line,
        reservation,
        documentLine: {
          skuId: line.sku_id,
          locationId: line.location_id,
          quantity: line.quantity,
          serialNumbers,
          reservationAllocations: [{ reservationId: reservation.id, quantity: line.quantity }],
        },
      }
    })
    if (
      serials.size !== documentLines.filter((item) => item.documentLine.serialNumbers.length).length
    )
      fail('INVALID_INPUT', 'Có serial được gửi cho dòng không thuộc đơn hàng.')

    const created = executeInventory(actor, 'document.create', {
      type: 'issue',
      warehouseId: current.warehouse_id,
      reference: current.number,
      reason: `Xuất bán từ đơn ${current.number}`,
      lines: documentLines.map((item) => item.documentLine),
    })
    if (!created || typeof created.id !== 'string')
      throw new Error('Inventory issue did not return its identifier')
    for (const item of documentLines) {
      const documentLine = get(
        'SELECT * FROM stock_document_lines WHERE tenant_id=? AND document_id=? AND sku_id=? AND location_id=?',
        current.tenant_id,
        created.id,
        item.line.sku_id,
        item.line.location_id,
      )
      if (!documentLine || documentLine.quantity !== item.line.quantity)
        fail('INVENTORY_DOCUMENT_MISMATCH', 'Phiếu xuất không khớp đầy đủ với đơn bán.', 409)
    }
    executeInventory(actor, 'document.approve', { id: created.id })
    executeInventory(actor, 'document.post', { id: created.id })
    const fulfilledAt = stamp()
    run(
      "UPDATE sales_orders SET status='fulfilled',fulfillment_document_id=?,fulfilled_at=?,updated_at=? WHERE tenant_id=? AND id=? AND status='confirmed'",
      created.id,
      fulfilledAt,
      fulfilledAt,
      current.tenant_id,
      current.id,
    )
    return { id: current.id, documentId: created.id }
  }

  function returnedLines(actor, current, input, salesLines) {
    if (
      !Array.isArray(input.lines) ||
      input.lines.length < 1 ||
      input.lines.length > salesLines.length
    )
      fail('INVALID_INPUT', 'Phiếu trả cần chọn từ 1 đến số dòng của đơn bán.')
    const byId = new Map(salesLines.map((line) => [line.id, line]))
    const seen = new Set()
    return input.lines.map((item) => {
      keys(item, ['lineId', 'quantity', 'serialNumbers'])
      const lineId = clean(item.lineId, 'ID dòng đơn hàng', 1, 200)
      if (seen.has(lineId)) fail('DUPLICATE_LINE', 'Dòng hàng trả bị lặp.')
      seen.add(lineId)
      const line = byId.get(lineId)
      if (!line) fail('NOT_FOUND', 'Dòng hàng không thuộc đơn bán.', 404)
      const quantity = integer(item.quantity, 'Số lượng trả', 1, line.quantity)
      const prior = postedReturns(current.tenant_id, current.fulfillment_document_id, line.sku_id)
      const returned = prior.quantity
      if (returned + quantity > line.quantity)
        fail('RETURN_QUANTITY_EXCEEDED', 'Số lượng trả vượt số lượng còn lại của dòng đơn.', 409)
      const serialNumbers = item.serialNumbers ?? []
      if (!Array.isArray(serialNumbers) || serialNumbers.length > 10000)
        fail('INVALID_INPUT', 'Danh sách serial trả không hợp lệ.')
      if (line.serial_tracked && serialNumbers.length !== quantity)
        fail('SERIAL_REQUIRED', `Cần nhập ${quantity} serial khi trả ${line.name_snapshot}.`)
      if (!line.serial_tracked && serialNumbers.length)
        fail('SERIAL_DISABLED', `${line.name_snapshot} không được cấu hình theo dõi serial.`)
      const sourceLine = get(
        'SELECT * FROM stock_document_lines WHERE tenant_id=? AND document_id=? AND sku_id=?',
        current.tenant_id,
        current.fulfillment_document_id,
        line.sku_id,
      )
      if (!sourceLine || sourceLine.inventory_value === null)
        fail('INVALID_RETURN_SOURCE', 'Không tìm thấy giá vốn ghi sổ của phiếu xuất.', 409)
      const returnedValue = prior.value
      const remainingQuantity = line.quantity - returned
      let unitCost
      if (line.serial_tracked) {
        const provenance = serialNumbers.map((serialNumber) => {
          const row = get(
            `SELECT p.unit_value FROM serial_issues p JOIN serials s
              ON s.tenant_id=p.tenant_id AND s.id=p.serial_id
              WHERE p.tenant_id=? AND p.document_id=? AND p.line_id=? AND s.serial_number=?
                AND p.returned_by_document_id IS NULL`,
            current.tenant_id,
            current.fulfillment_document_id,
            sourceLine.id,
            clean(serialNumber, 'Serial Number', 1, 120),
          )
          if (!row)
            fail(
              'INVALID_SERIAL_RETURN',
              `Serial ${serialNumber} không thuộc phiếu xuất này hoặc đã trả.`,
              409,
            )
          return row.unit_value
        })
        if (new Set(serialNumbers).size !== serialNumbers.length)
          fail('DUPLICATE_SERIAL', 'Serial trả bị trùng.')
        unitCost = Math.round(provenance.reduce((sum, value) => sum + value, 0) / quantity)
      } else {
        const remainingValue = sourceLine.inventory_value - returnedValue
        const value =
          quantity === remainingQuantity
            ? remainingValue
            : safeAmount(
                (BigInt(remainingValue) * BigInt(quantity) + BigInt(remainingQuantity) / 2n) /
                  BigInt(remainingQuantity),
              )
        unitCost = Math.round(value / quantity)
      }
      return {
        line,
        quantity,
        unitCost,
        serialNumbers,
      }
    })
  }

  function returnStock(actor, input) {
    keys(input, ['id', 'reason', 'lines'])
    const current = order(actor, clean(input.id, 'ID đơn bán', 1, 200))
    if (!['fulfilled', 'returned'].includes(current.status) || !current.fulfillment_document_id)
      fail('INVALID_TRANSITION', 'Chỉ đơn đã xuất kho mới được nhận hàng trả.', 409)
    const reason = clean(input.reason, 'Lý do trả hàng', 5, 2000)
    const salesLines = all(
      `SELECT l.*,s.serial_tracked FROM sales_order_lines l JOIN inventory_skus s
        ON s.tenant_id=l.tenant_id AND s.id=l.sku_id
        WHERE l.tenant_id=? AND l.sales_order_id=? ORDER BY l.id`,
      current.tenant_id,
      current.id,
    )
    const lines = returnedLines(actor, current, input, salesLines)
    const source = get(
      "SELECT warehouse_id FROM stock_documents WHERE tenant_id=? AND id=? AND type='issue' AND status='posted'",
      current.tenant_id,
      current.fulfillment_document_id,
    )
    if (!source) fail('INVALID_RETURN_SOURCE', 'Phiếu xuất gốc không còn hợp lệ.', 409)
    const receipt = executeInventory(actor, 'document.create', {
      type: 'receipt',
      warehouseId: source.warehouse_id,
      returnToStock: true,
      sourceDocumentId: current.fulfillment_document_id,
      reference: current.reference || current.number,
      reason,
      lines: lines.map((item) => ({
        skuId: item.line.sku_id,
        locationId: item.line.location_id,
        quantity: item.quantity,
        unitCost: item.unitCost,
        serialNumbers: item.serialNumbers,
      })),
    })
    if (!receipt || typeof receipt.id !== 'string')
      throw new Error('Inventory return receipt did not return its identifier')
    executeInventory(actor, 'document.approve', { id: receipt.id })
    executeInventory(actor, 'document.post', { id: receipt.id })
    run(
      'INSERT INTO sales_order_returns(tenant_id,sales_order_id,document_id,created_at) VALUES(?,?,?,?)',
      current.tenant_id,
      current.id,
      receipt.id,
      stamp(),
    )
    for (const item of lines)
      run(
        'INSERT INTO sales_order_return_lines(tenant_id,return_document_id,sales_order_line_id,quantity) VALUES(?,?,?,?)',
        current.tenant_id,
        receipt.id,
        item.line.id,
        item.quantity,
      )
    const totalReturned = salesLines.reduce(
      (total, line) =>
        total +
        postedReturns(current.tenant_id, current.fulfillment_document_id, line.sku_id).quantity,
      0,
    )
    const totalOrdered = salesLines.reduce((sum, line) => sum + line.quantity, 0)
    if (totalReturned === totalOrdered) {
      const returnedAt = stamp()
      run(
        "UPDATE sales_orders SET status='returned',returned_at=?,updated_at=? WHERE tenant_id=? AND id=?",
        returnedAt,
        returnedAt,
        current.tenant_id,
        current.id,
      )
    }
    return { id: current.id, documentId: receipt.id }
  }

  function execute(actor, action, input) {
    if (!SALES_ACTIONS.includes(action))
      fail('UNKNOWN_ACTION', 'Thao tác đơn hàng không được hỗ trợ.', 404)
    const authorized = authorize(actor, action)
    roleAllowed(authorized, action)
    if (action === 'salesOrder.create') return create(authorized, input)
    if (action === 'salesOrder.confirm') return confirm(authorized, input)
    if (action === 'salesOrder.cancel') return cancel(authorized, input)
    if (action === 'salesOrder.fulfill') return fulfill(authorized, input)
    return returnStock(authorized, input)
  }

  return {
    supports: (action) => SALES_ACTIONS.includes(action),
    execute,
    snapshot(actor) {
      const tenantId = tenant(authorize(actor))
      const orders = all(
        'SELECT * FROM sales_orders WHERE tenant_id=? ORDER BY created_at DESC,id DESC',
        tenantId,
      )
      const lines = all('SELECT * FROM sales_order_lines WHERE tenant_id=? ORDER BY id', tenantId)
      const reservations = all(
        'SELECT * FROM sales_order_line_reservations WHERE tenant_id=?',
        tenantId,
      )
      return {
        salesOrders: orders.map((row) => ({
          id: row.id,
          number: row.number,
          warehouseId: row.warehouse_id,
          customerReference: row.customer_reference,
          reference: row.reference,
          note: row.note,
          status:
            row.status === 'fulfilled' &&
            lines
              .filter((line) => line.sales_order_id === row.id)
              .every(
                (line) =>
                  postedReturns(tenantId, row.fulfillment_document_id, line.sku_id).quantity ===
                  line.quantity,
              )
              ? 'returned'
              : row.status,
          fulfillmentDocumentId: row.fulfillment_document_id,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          confirmedAt: row.confirmed_at,
          fulfilledAt: row.fulfilled_at,
          cancelledAt: row.cancelled_at,
          returnedAt: row.returned_at,
          lines: lines
            .filter((line) => line.sales_order_id === row.id)
            .map((line) => {
              const reservation = reservations.find((item) => item.sales_order_line_id === line.id)
              const returnedQuantity = postedReturns(
                tenantId,
                row.fulfillment_document_id,
                line.sku_id,
              ).quantity
              return {
                id: line.id,
                skuId: line.sku_id,
                sku: line.sku_snapshot,
                name: line.name_snapshot,
                quantity: line.quantity,
                unitPrice: line.unit_price,
                locationId: line.location_id,
                reservationId: reservation?.reservation_id ?? null,
                returnedQuantity,
                returnableQuantity: line.quantity - returnedQuantity,
              }
            }),
        })),
      }
    },
  }
}
