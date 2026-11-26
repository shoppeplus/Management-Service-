import { createHash, randomUUID } from 'node:crypto'
import { DomainError, transaction } from './database.mjs'
import { permissionsForUser } from './access-control.mjs'

const fail = (status, code, message) => {
  throw new DomainError(status, code, message)
}
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const allowed = (value, fields) => {
  if (!object(value) || Object.keys(value).some((key) => !fields.includes(key)))
    fail(400, 'INVALID_FIELDS', 'Yêu cầu có trường không được hỗ trợ.')
}
const text = (value, label, min = 0, max = 500) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 && ![9, 10, 13].includes(code)
    })
  )
    fail(422, 'INVALID_INPUT', `${label} cần ${min}–${max} ký tự hợp lệ.`)
  return value.trim()
}
const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(422, 'INVALID_INPUT', `${label} phải là số nguyên từ ${min} đến ${max}.`)
  return value
}
const json = (value, label, maxLength = 50000) => {
  const result = JSON.stringify(value)
  if (result.length > maxLength) fail(422, 'INVALID_INPUT', `${label} vượt giới hạn lưu trữ.`)
  return result
}
const parse = (value, fallback = []) => {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
const normalizePhone = (value) => value.replace(/\D/g, '').replace(/^84/, '0')
const emailAddress = (value) => {
  const email = text(value, 'Email', 0, 254).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(422, 'INVALID_INPUT', 'Địa chỉ email không hợp lệ.')
  return email
}
const channelIds = [
  'shopee',
  'lazada',
  'tiktok',
  'zalo',
  'whatsapp',
  'instagram',
  'messenger',
  'telegram',
  'livechat',
  'email',
]
const priorities = ['low', 'normal', 'high', 'urgent']
const orderTransitions = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing: ['cancelled'],
  shipped: [],
  delivered: [],
  cancelled: [],
  returned: [],
}
const shipmentTransitions = {
  ready: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'exception', 'returned'],
  exception: ['in_transit', 'returned'],
  delivered: [],
  returned: [],
  cancelled: [],
}
const ticketTransitions = {
  open: ['in_progress', 'waiting', 'resolved'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: ['open'],
}
const slaHours = { urgent: 2, high: 4, normal: 24, low: 48 }
const avatarColors = ['#dedcf5', '#d8e8df', '#f0dfd7', '#dce5f3', '#ead9e1', '#dce7d5']

export function createBusiness(
  db,
  {
    inventory,
    now = () => new Date(),
    telegramToken: fallbackTelegramToken,
    telegramTokenForActor = () => undefined,
    telegramFetch = fetch,
  } = {},
) {
  if (!inventory) throw new TypeError('createBusiness requires the inventory service')
  const get = (sql, ...values) => db.prepare(sql).get(...values)
  const all = (sql, ...values) => db.prepare(sql).all(...values)
  const run = (sql, ...values) => db.prepare(sql).run(...values)
  const stamp = () => now().toISOString()
  const newId = () => randomUUID()
  const requirePermission = (actor, permission) => {
    const user = get(
      'SELECT id,role FROM users WHERE tenant_id=? AND id=? AND active=1',
      actor.tenantId,
      actor.userId,
    )
    if (!user || actor.role !== user.role)
      fail(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
    if (!permissionsForUser(db, actor.tenantId, actor.userId, user.role).includes(permission))
      fail(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.')
  }
  const audit = (actor, action, entityId, details) =>
    run(
      'INSERT INTO audit_events(id,tenant_id,actor_id,action,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)',
      newId(),
      actor.tenantId,
      actor.userId,
      action,
      entityId,
      json(details, 'Thông tin audit', 50000),
      stamp(),
    )
  const telegramApi = async (actor, method, parameters) => {
    const telegramToken = telegramTokenForActor(actor) || fallbackTelegramToken
    if (!telegramToken)
      fail(503, 'TELEGRAM_NOT_CONFIGURED', 'Máy chủ chưa cấu hình TELEGRAM_BOT_TOKEN.')
    let response
    try {
      response = await telegramFetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters),
        signal: AbortSignal.timeout(method === 'getUpdates' ? 30000 : 10000),
      })
    } catch {
      fail(502, 'TELEGRAM_UNAVAILABLE', 'Không kết nối được Telegram. Hãy thử lại.')
    }
    let result
    try {
      result = await response.json()
    } catch {
      fail(502, 'TELEGRAM_INVALID_RESPONSE', 'Telegram trả về phản hồi không hợp lệ.')
    }
    if (!response.ok || !result?.ok) {
      const description =
        typeof result?.description === 'string' ? result.description.slice(0, 200) : ''
      const conflict =
        /getupdates.*webhook|webhook.*getupdates|another getupdates|other getupdates/i.test(
          description,
        )
      fail(
        502,
        'TELEGRAM_API_ERROR',
        conflict
          ? 'Bot đang dùng webhook hoặc một tiến trình polling khác. Hãy dừng tiến trình còn lại rồi thử lại.'
          : 'Telegram từ chối yêu cầu. Kiểm tra token và cấu hình bot.',
      )
    }
    return result.result
  }
  const customerById = (actor, id) => {
    const row = get('SELECT * FROM customers WHERE tenant_id=? AND id=?', actor.tenantId, id)
    if (!row) fail(404, 'NOT_FOUND', 'Không tìm thấy khách hàng.')
    return row
  }
  const customerView = (row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    membership: row.membership,
    location: row.location,
    avatarColor: row.avatar_color,
  })
  const customerInput = (input) => {
    allowed(input, ['name', 'phone', 'email', 'company', 'membership', 'location'])
    const name = text(input.name, 'Họ tên', 2, 200)
    const phone = text(input.phone, 'Số điện thoại', 0, 24)
    if (phone && (!/^\+?[\d\s().-]{8,24}$/.test(phone) || phone.replace(/\D/g, '').length < 8))
      fail(422, 'INVALID_INPUT', 'Số điện thoại không hợp lệ.')
    const email = emailAddress(input.email)
    const company = text(input.company, 'Doanh nghiệp', 0, 200)
    const location = text(input.location, 'Khu vực', 0, 200)
    const membership = input.membership ?? 'Standard'
    if (!['Standard', 'Silver', 'Gold', 'Platinum'].includes(membership))
      fail(422, 'INVALID_INPUT', 'Hạng thành viên không hợp lệ.')
    return {
      name,
      phone,
      email,
      company,
      location,
      membership,
      phoneNormalized: normalizePhone(phone),
    }
  }
  const assertCustomerUnique = (tenantId, input, exceptId = '') => {
    if (
      input.email &&
      get(
        'SELECT id FROM customers WHERE tenant_id=? AND email=? COLLATE NOCASE AND id<>?',
        tenantId,
        input.email,
        exceptId,
      )
    )
      fail(409, 'EMAIL_IN_USE', 'Khách hàng có email này đã tồn tại.')
    if (
      input.phoneNormalized &&
      get(
        'SELECT id FROM customers WHERE tenant_id=? AND phone_normalized=? AND id<>?',
        tenantId,
        input.phoneNormalized,
        exceptId,
      )
    )
      fail(409, 'PHONE_IN_USE', 'Khách hàng có số điện thoại này đã tồn tại.')
  }
  const agentExists = (tenantId, id) =>
    id === null ||
    Boolean(get('SELECT id FROM users WHERE tenant_id=? AND id=? AND active=1', tenantId, id))
  const teamExists = (tenantId, id) =>
    id === null ||
    Boolean(get('SELECT id FROM teams WHERE tenant_id=? AND id=? AND active=1', tenantId, id))
  const inboxSnapshot = (actor) => {
    requirePermission(actor, 'inbox.read')
    const customers = all(
      'SELECT * FROM customers WHERE tenant_id=? ORDER BY name,id',
      actor.tenantId,
    )
    const agents = all(
      'SELECT id,name,active FROM users WHERE tenant_id=? ORDER BY name,id',
      actor.tenantId,
    ).map((row, index) => ({
      id: row.id,
      name: row.name,
      initials: row.name
        .trim()
        .split(/\s+/)
        .slice(-2)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase(),
      color: avatarColors[index % avatarColors.length],
    }))
    const teams = all(
      'SELECT id,name FROM teams WHERE tenant_id=? AND active=1 ORDER BY name,id',
      actor.tenantId,
    )
    const connectionRows = all(
      'SELECT * FROM channel_connections WHERE tenant_id=? ORDER BY channel,account_name,id',
      actor.tenantId,
    )
    const connections = connectionRows.map((row) => ({
      id: row.id,
      channel: row.channel,
      accountName: row.account_name,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      detail: row.detail,
    }))
    const messageRows = all(
      'SELECT * FROM messages WHERE tenant_id=? ORDER BY sent_at,id',
      actor.tenantId,
    )
    const messages = new Map()
    for (const row of messageRows) {
      const list = messages.get(row.conversation_id) ?? []
      list.push({
        id: row.id,
        type: row.type,
        text: row.text,
        sentAt: row.sent_at,
        delivery: row.delivery,
        ...(row.author_name ? { authorName: row.author_name } : {}),
        ...(parse(row.attachments_json).length ? { attachments: parse(row.attachments_json) } : {}),
      })
      messages.set(row.conversation_id, list)
    }
    const conversations = all(
      'SELECT * FROM conversations WHERE tenant_id=? ORDER BY last_message_at DESC,id',
      actor.tenantId,
    ).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      channel: row.channel,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assignee_id,
      teamId: row.team_id,
      subject: row.subject,
      unread: row.unread,
      lastMessageAt: row.last_message_at,
      dueAt: row.due_at,
      sourceUrl: row.source_url,
      ...(row.connection_id ? { connectionId: row.connection_id } : {}),
      ...(row.external_id ? { externalId: row.external_id } : {}),
      tags: parse(row.tags_json),
      mentioned: Boolean(row.mentioned),
      bot: Boolean(row.bot),
      messages: messages.get(row.id) ?? [],
    }))
    return {
      customers: customers.map(customerView),
      conversations,
      agents,
      teams,
      connections,
    }
  }
  const operationsSnapshot = (actor) => {
    requirePermission(actor, 'operations.read')
    inboxSnapshot(actor)
    const warehouse = inventory.snapshot(actor)
    const referencedSkuIds = new Set(
      all(
        'SELECT DISTINCT l.sku_id FROM sales_order_lines l JOIN sales_order_contexts c ON c.tenant_id=l.tenant_id AND c.sales_order_id=l.sales_order_id WHERE l.tenant_id=?',
        actor.tenantId,
      ).map((row) => row.sku_id),
    )
    const products = warehouse.skus
      .filter((sku) => (sku.priceKnown || referencedSkuIds.has(sku.id)) && sku.price !== undefined)
      .map((sku) => ({
        id: sku.id,
        sku: sku.sku,
        name: sku.name,
        price: sku.price ?? 0,
        active: Boolean(sku.active),
        stock: warehouse.balances
          .filter((balance) => balance.skuId === sku.id)
          .reduce((sum, balance) => sum + balance.available, 0),
        ...(sku.metadata?.imageUrl ? { imageUrl: sku.metadata.imageUrl } : {}),
        ...(sku.metadata?.description ? { description: sku.metadata.description } : {}),
        ...(sku.unit ? { unit: sku.unit } : {}),
        ...(sku.category ? { category: sku.category } : {}),
      }))
    const profiles = all(
      `SELECT p.*,c.name FROM customer_profiles p
       JOIN customers c ON c.tenant_id=p.tenant_id AND c.id=p.customer_id
       WHERE p.tenant_id=? ORDER BY c.name,c.id`,
      actor.tenantId,
    ).map((row) => ({
      customerId: row.customer_id,
      status: row.status,
      ownerId: row.owner_id,
      source: row.source,
      tags: parse(row.tags_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      notes: all(
        'SELECT id,text,author_id AS authorId,created_at AS createdAt FROM customer_notes WHERE tenant_id=? AND customer_id=? ORDER BY created_at,id',
        actor.tenantId,
        row.customer_id,
      ),
    }))
    const details = all(
      `SELECT c.*,s.number,s.warehouse_id,s.customer_reference,s.reference,s.note,
          s.status AS inventory_status,s.created_by,s.created_at AS order_created_at,
          s.updated_at AS order_updated_at
       FROM sales_order_contexts c
       JOIN sales_orders s ON s.tenant_id=c.tenant_id AND s.id=c.sales_order_id
       WHERE c.tenant_id=? ORDER BY s.created_at DESC,s.id DESC`,
      actor.tenantId,
    )
    const orders = details.map((row) => {
      const lines = all(
        'SELECT id,sku_id AS productId,sku_snapshot AS sku,name_snapshot AS name,quantity,unit_price AS unitPrice FROM sales_order_lines WHERE tenant_id=? AND sales_order_id=? ORDER BY id',
        actor.tenantId,
        row.sales_order_id,
      )
      const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
      let status = row.fulfillment_status
      if (row.inventory_status === 'cancelled') status = 'cancelled'
      else if (row.inventory_status === 'returned') status = 'returned'
      else if (row.inventory_status === 'confirmed' && status === 'draft') status = 'confirmed'
      else if (
        row.inventory_status === 'fulfilled' &&
        ['draft', 'confirmed', 'packing'].includes(status)
      )
        status = 'shipped'
      return {
        id: row.sales_order_id,
        number: row.number,
        customerId: row.customer_id,
        ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
        ...(row.client_request_id ? { clientRequestId: row.client_request_id } : {}),
        items: lines,
        status,
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method,
        subtotal,
        discount: row.discount,
        shippingFee: row.shipping_fee,
        total: subtotal - row.discount + row.shipping_fee,
        shippingAddress: row.shipping_address,
        recipientName: row.recipient_name,
        recipientPhone: row.recipient_phone,
        note: row.note,
        createdAt: row.order_created_at,
        updatedAt: row.order_updated_at,
      }
    })
    const shipments = all(
      'SELECT * FROM shipments WHERE tenant_id=? ORDER BY created_at DESC,id DESC',
      actor.tenantId,
    ).map((row) => ({
      id: row.id,
      trackingNumber: row.tracking_number,
      orderId: row.sales_order_id,
      carrierId: row.carrier_id,
      status: row.status,
      shippingFee: orders.find((order) => order.id === row.sales_order_id)?.shippingFee ?? 0,
      codAmount: (() => {
        const order = orders.find((item) => item.id === row.sales_order_id)
        return order?.paymentMethod === 'cod' && order.paymentStatus === 'unpaid' ? order.total : 0
      })(),
      estimatedDeliveryAt: row.estimated_delivery_at ?? row.created_at,
      events: all(
        'SELECT id,status,description,created_at AS createdAt FROM shipment_events WHERE tenant_id=? AND shipment_id=? ORDER BY created_at,id',
        actor.tenantId,
        row.id,
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    const tickets = all(
      'SELECT * FROM tickets WHERE tenant_id=? ORDER BY created_at DESC,id DESC',
      actor.tenantId,
    ).map((row) => ({
      id: row.id,
      number: row.number,
      customerId: row.customer_id,
      orderId: row.sales_order_id,
      conversationId: row.conversation_id,
      subject: row.subject,
      description: row.description,
      category: row.category,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assignee_id,
      dueAt: row.due_at,
      resolution: row.resolution,
      comments: all(
        'SELECT id,text,author_id AS authorId,created_at AS createdAt FROM ticket_comments WHERE tenant_id=? AND ticket_id=? ORDER BY created_at,id',
        actor.tenantId,
        row.id,
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    }))
    const auditEvents = all(
      `SELECT id,entity_id AS entityId,action,details_json,created_at AS createdAt,actor_id AS actorId
       FROM audit_events WHERE tenant_id=? AND action GLOB 'customer.*'
          OR tenant_id=? AND action GLOB 'order.*'
          OR tenant_id=? AND action GLOB 'shipment.*'
          OR tenant_id=? AND action GLOB 'ticket.*'
       ORDER BY created_at DESC,id DESC LIMIT 1000`,
      actor.tenantId,
      actor.tenantId,
      actor.tenantId,
      actor.tenantId,
    ).map((row) => ({
      id: row.id,
      entity: row.action.split('.')[0],
      entityId: row.entityId,
      action: row.action,
      description: parse(row.details_json, {}).description ?? row.action,
      createdAt: row.createdAt,
      actorId: row.actorId,
    }))
    return {
      schemaVersion: 1,
      customerProfiles: profiles,
      products,
      orders,
      shipments,
      tickets,
      auditEvents,
    }
  }
  const createCustomer = (actor, input) => {
    requirePermission(actor, 'customers.manage')
    const values = customerInput(input)
    assertCustomerUnique(actor.tenantId, values)
    const id = newId()
    const createdAt = stamp()
    transaction(db, () => {
      run(
        `INSERT INTO customers(
          id,tenant_id,name,phone,phone_normalized,email,company,membership,location,
          avatar_color,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        actor.tenantId,
        values.name,
        values.phone,
        values.phoneNormalized,
        values.email,
        values.company,
        values.membership,
        values.location,
        avatarColors[customersCount(actor.tenantId) % avatarColors.length],
        createdAt,
        createdAt,
      )
      run(
        "INSERT INTO customer_profiles(tenant_id,customer_id,status,source,created_at,updated_at) VALUES(?,?,'lead','manual',?,?)",
        actor.tenantId,
        id,
        createdAt,
        createdAt,
      )
      audit(actor, 'customer.created', id, { description: 'Tạo hồ sơ khách hàng.' })
    })
    return customerView(customerById(actor, id))
  }
  const customersCount = (tenantId) =>
    get('SELECT COUNT(*) AS count FROM customers WHERE tenant_id=?', tenantId).count
  const updateCustomer = (actor, id, patch) => {
    requirePermission(actor, 'customers.manage')
    const current = customerById(actor, id)
    allowed(patch, ['name', 'phone', 'email', 'company', 'membership', 'location'])
    const values = customerInput({
      name: patch.name ?? current.name,
      phone: patch.phone ?? current.phone,
      email: patch.email ?? current.email,
      company: patch.company ?? current.company,
      membership: patch.membership ?? current.membership,
      location: patch.location ?? current.location,
    })
    assertCustomerUnique(actor.tenantId, values, id)
    transaction(db, () => {
      run(
        `UPDATE customers SET name=?,phone=?,phone_normalized=?,email=?,company=?,
          membership=?,location=?,updated_at=? WHERE tenant_id=? AND id=?`,
        values.name,
        values.phone,
        values.phoneNormalized,
        values.email,
        values.company,
        values.membership,
        values.location,
        stamp(),
        actor.tenantId,
        id,
      )
      audit(actor, 'customer.updated', id, { description: 'Cập nhật thông tin khách hàng.' })
    })
    return customerView(customerById(actor, id))
  }
  const updateConversation = (actor, id, patch) => {
    requirePermission(actor, 'inbox.manage')
    allowed(patch, ['status', 'priority', 'assigneeId', 'teamId', 'unread', 'tags', 'dueAt'])
    const row = get('SELECT * FROM conversations WHERE tenant_id=? AND id=?', actor.tenantId, id)
    if (!row) fail(404, 'NOT_FOUND', 'Không tìm thấy hội thoại.')
    const values = {}
    if (patch.status !== undefined) {
      if (!['open', 'pending', 'resolved', 'closed'].includes(patch.status))
        fail(422, 'INVALID_INPUT', 'Trạng thái hội thoại không hợp lệ.')
      values.status = patch.status
    }
    if (patch.priority !== undefined) {
      if (!priorities.includes(patch.priority))
        fail(422, 'INVALID_INPUT', 'Mức ưu tiên không hợp lệ.')
      values.priority = patch.priority
    }
    if (patch.assigneeId !== undefined) {
      if (!agentExists(actor.tenantId, patch.assigneeId))
        fail(422, 'INVALID_INPUT', 'Nhân viên không hoạt động hoặc không thuộc doanh nghiệp.')
      values.assignee_id = patch.assigneeId
    }
    if (patch.teamId !== undefined) {
      if (!teamExists(actor.tenantId, patch.teamId))
        fail(422, 'INVALID_INPUT', 'Nhóm không hoạt động hoặc không thuộc doanh nghiệp.')
      values.team_id = patch.teamId
    }
    if (patch.unread !== undefined)
      values.unread = integer(patch.unread, 'Số tin chưa đọc', 0, 1000000)
    if (patch.tags !== undefined) {
      if (!Array.isArray(patch.tags) || patch.tags.length > 10)
        fail(422, 'INVALID_INPUT', 'Mỗi hội thoại có tối đa 10 nhãn.')
      const tags = patch.tags.map((tag) => text(tag, 'Nhãn', 1, 40))
      if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length)
        fail(422, 'INVALID_INPUT', 'Nhãn hội thoại không được trùng.')
      values.tags_json = json(tags, 'Nhãn hội thoại', 5000)
    }
    if (patch.dueAt !== undefined) {
      if (!Number.isFinite(Date.parse(patch.dueAt)))
        fail(422, 'INVALID_INPUT', 'Thời hạn hội thoại không hợp lệ.')
      values.due_at = new Date(patch.dueAt).toISOString()
    }
    if (!Object.keys(values).length) fail(422, 'INVALID_INPUT', 'Chưa có nội dung cập nhật.')
    transaction(db, () => {
      const entries = Object.entries(values)
      run(
        `UPDATE conversations SET ${entries.map(([key]) => `${key}=?`).join(',')},updated_at=?
         WHERE tenant_id=? AND id=?`,
        ...entries.map(([, value]) => value),
        stamp(),
        actor.tenantId,
        id,
      )
      audit(actor, 'conversation.updated', id, { description: 'Cập nhật trạng thái hội thoại.' })
    })
    return inboxSnapshot(actor).conversations.find((conversation) => conversation.id === id)
  }
  const sendMessage = async (actor, conversationId, input) => {
    allowed(input, ['text', 'type', 'attachments'])
    const conversation = get(
      'SELECT * FROM conversations WHERE tenant_id=? AND id=?',
      actor.tenantId,
      conversationId,
    )
    if (!conversation) fail(404, 'NOT_FOUND', 'Không tìm thấy hội thoại.')
    if (!['outgoing', 'note'].includes(input.type))
      fail(422, 'INVALID_INPUT', 'Loại tin nhắn không hợp lệ.')
    if (input.type === 'outgoing') {
      requirePermission(actor, 'inbox.message')
      if (conversation.channel !== 'telegram')
        fail(
          503,
          'CHANNEL_NOT_CONNECTED',
          'Chưa có adapter gửi tin thật cho kênh này. Nội dung chưa được gửi.',
        )
      if (Array.isArray(input.attachments) && input.attachments.length)
        fail(501, 'UPLOAD_NOT_CONFIGURED', 'Telegram hiện chỉ hỗ trợ gửi tin nhắn văn bản.')
      if (input.attachments !== undefined && !Array.isArray(input.attachments))
        fail(422, 'INVALID_INPUT', 'Danh sách tệp đính kèm không hợp lệ.')
      if (
        !conversation.connection_id ||
        typeof conversation.external_id !== 'string' ||
        !conversation.external_id.startsWith(`${conversation.connection_id}:`)
      )
        fail(422, 'INVALID_INPUT', 'Hội thoại Telegram thiếu thông tin chat nguồn hợp lệ.')
      const chatIdText = conversation.external_id.slice(conversation.connection_id.length + 1)
      if (!/^\d+$/.test(chatIdText) || !Number.isSafeInteger(Number(chatIdText)))
        fail(422, 'INVALID_INPUT', 'Mã chat Telegram không hợp lệ.')
      const connection = get(
        "SELECT id FROM channel_connections WHERE tenant_id=? AND id=? AND channel='telegram' AND status='connected'",
        actor.tenantId,
        conversation.connection_id,
      )
      if (!connection)
        fail(503, 'CHANNEL_NOT_CONNECTED', 'Kết nối Telegram chưa sẵn sàng để gửi tin.')
      const body = text(input.text, 'Nội dung tin nhắn', 1, 4096)
      const sent = await telegramApi(actor, 'sendMessage', {
        chat_id: Number(chatIdText),
        text: body,
      })
      if (!Number.isSafeInteger(sent?.message_id))
        fail(502, 'TELEGRAM_INVALID_RESPONSE', 'Telegram không xác nhận tin nhắn đã gửi.')
      const sentAt =
        Number.isSafeInteger(sent.date) && sent.date > 0
          ? new Date(sent.date * 1000).toISOString()
          : stamp()
      const id = newId()
      const author = get(
        'SELECT name FROM users WHERE tenant_id=? AND id=?',
        actor.tenantId,
        actor.userId,
      )
      transaction(db, () => {
        run(
          `INSERT INTO messages(
            id,tenant_id,conversation_id,external_id,type,text,sent_at,delivery,author_name,created_at
          ) VALUES(?,?,?,?,'outgoing',?,?,'sent',?,?)`,
          id,
          actor.tenantId,
          conversationId,
          String(sent.message_id),
          body,
          sentAt,
          author.name,
          stamp(),
        )
        run(
          'UPDATE conversations SET last_message_at=?,updated_at=? WHERE tenant_id=? AND id=?',
          sentAt,
          stamp(),
          actor.tenantId,
          conversationId,
        )
        audit(actor, 'conversation.message.sent', id, {
          channel: 'telegram',
          description: 'Telegram xác nhận đã gửi tin nhắn.',
        })
      })
      return inboxSnapshot(actor).conversations.find((item) => item.id === conversationId)
    }
    requirePermission(actor, 'inbox.manage')
    if (Array.isArray(input.attachments) && input.attachments.length)
      fail(501, 'UPLOAD_NOT_CONFIGURED', 'Dịch vụ lưu tệp đính kèm chưa được cấu hình.')
    if (input.attachments !== undefined && !Array.isArray(input.attachments))
      fail(422, 'INVALID_INPUT', 'Danh sách tệp đính kèm không hợp lệ.')
    const body = text(input.text, 'Nội dung ghi chú', 1, 10000)
    const id = newId()
    const sentAt = stamp()
    transaction(db, () => {
      run(
        "INSERT INTO messages(id,tenant_id,conversation_id,type,text,sent_at,delivery,author_name,created_at) VALUES(?,?,?,'note',?, ?,'sent',?,?)",
        id,
        actor.tenantId,
        conversationId,
        body,
        sentAt,
        get('SELECT name FROM users WHERE tenant_id=? AND id=?', actor.tenantId, actor.userId).name,
        sentAt,
      )
      run(
        'UPDATE conversations SET last_message_at=?,updated_at=? WHERE tenant_id=? AND id=?',
        sentAt,
        sentAt,
        actor.tenantId,
        conversationId,
      )
      audit(actor, 'conversation.note.created', id, { description: 'Thêm ghi chú nội bộ.' })
    })
    return inboxSnapshot(actor).conversations.find((item) => item.id === conversationId)
  }
  const updateCustomerProfile = (actor, customerId, patch) => {
    requirePermission(actor, 'crm.manage')
    customerById(actor, customerId)
    allowed(patch, ['status', 'ownerId', 'source', 'tags'])
    const current = get(
      'SELECT * FROM customer_profiles WHERE tenant_id=? AND customer_id=?',
      actor.tenantId,
      customerId,
    )
    if (!current) fail(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ CRM.')
    const values = {}
    if (patch.status !== undefined) {
      if (!['lead', 'active', 'inactive'].includes(patch.status))
        fail(422, 'INVALID_INPUT', 'Trạng thái hồ sơ khách hàng không hợp lệ.')
      values.status = patch.status
    }
    if (patch.ownerId !== undefined) {
      if (!agentExists(actor.tenantId, patch.ownerId))
        fail(422, 'INVALID_INPUT', 'Nhân viên không hoạt động hoặc không thuộc doanh nghiệp.')
      values.owner_id = patch.ownerId
    }
    if (patch.source !== undefined) {
      if (![...channelIds, 'referral', 'manual'].includes(patch.source))
        fail(422, 'INVALID_INPUT', 'Nguồn khách hàng không hợp lệ.')
      values.source = patch.source
    }
    if (patch.tags !== undefined) {
      if (!Array.isArray(patch.tags) || patch.tags.length > 10)
        fail(422, 'INVALID_INPUT', 'Mỗi hồ sơ có tối đa 10 nhãn.')
      const tags = patch.tags.map((tag) => text(tag, 'Nhãn', 1, 40))
      if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length)
        fail(422, 'INVALID_INPUT', 'Nhãn khách hàng không được trùng.')
      values.tags_json = json(tags, 'Nhãn khách hàng', 5000)
    }
    if (!Object.keys(values).length) fail(422, 'INVALID_INPUT', 'Chưa có nội dung cập nhật.')
    transaction(db, () => {
      const entries = Object.entries(values)
      run(
        `UPDATE customer_profiles SET ${entries.map(([key]) => `${key}=?`).join(',')},updated_at=?
         WHERE tenant_id=? AND customer_id=?`,
        ...entries.map(([, value]) => value),
        stamp(),
        actor.tenantId,
        customerId,
      )
      audit(actor, 'customer.profile.updated', customerId, {
        description: 'Cập nhật phân loại và người phụ trách khách hàng.',
      })
    })
    return operationsSnapshot(actor)
  }
  const addCustomerNote = (actor, customerId, input) => {
    requirePermission(actor, 'crm.manage')
    customerById(actor, customerId)
    allowed(input, ['text'])
    const id = newId()
    transaction(db, () => {
      run(
        'INSERT INTO customer_notes(id,tenant_id,customer_id,author_id,text,created_at) VALUES(?,?,?,?,?,?)',
        id,
        actor.tenantId,
        customerId,
        actor.userId,
        text(input.text, 'Ghi chú', 1, 5000),
        stamp(),
      )
      run(
        'UPDATE customer_profiles SET updated_at=? WHERE tenant_id=? AND customer_id=?',
        stamp(),
        actor.tenantId,
        customerId,
      )
      audit(actor, 'customer.note.created', id, {
        description: 'Thêm ghi chú chăm sóc khách hàng.',
      })
    })
    return operationsSnapshot(actor)
  }
  const createOrder = (actor, input) => {
    requirePermission(actor, 'orders.manage')
    allowed(input, [
      'customerId',
      'conversationId',
      'clientRequestId',
      'items',
      'discount',
      'shippingFee',
      'paymentMethod',
      'shippingAddress',
      'recipientName',
      'recipientPhone',
      'note',
      'warehouseId',
    ])
    const customer = customerById(actor, text(input.customerId, 'ID khách hàng', 1, 200))
    const conversationId =
      input.conversationId === undefined || input.conversationId === null
        ? null
        : text(input.conversationId, 'ID hội thoại', 1, 200)
    if (
      conversationId &&
      !get(
        'SELECT id FROM conversations WHERE tenant_id=? AND id=? AND customer_id=?',
        actor.tenantId,
        conversationId,
        customer.id,
      )
    )
      fail(422, 'INVALID_INPUT', 'Hội thoại không thuộc khách hàng đã chọn.')
    const clientRequestId =
      input.clientRequestId === undefined ? null : text(input.clientRequestId, 'Mã yêu cầu', 1, 100)
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    if (clientRequestId) {
      const existing = get(
        'SELECT client_request_hash FROM sales_order_contexts WHERE tenant_id=? AND client_request_id=?',
        actor.tenantId,
        clientRequestId,
      )
      if (existing) {
        if (existing.client_request_hash !== requestHash)
          fail(409, 'IDEMPOTENCY_CONFLICT', 'Mã yêu cầu đã dùng cho đơn hàng khác.')
        return operationsSnapshot(actor)
      }
    }
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50)
      fail(422, 'INVALID_INPUT', 'Đơn hàng cần từ 1 đến 50 dòng sản phẩm.')
    const seen = new Set()
    let subtotal = 0n
    const items = input.items.map((line) => {
      allowed(line, ['productId', 'quantity'])
      const productId = text(line.productId, 'SKU', 1, 200)
      if (seen.has(productId)) fail(422, 'DUPLICATE_LINE', 'SKU bị lặp trong đơn hàng.')
      seen.add(productId)
      const sku = get(
        'SELECT id,price FROM inventory_skus WHERE tenant_id=? AND id=? AND active=1 AND price_known=1',
        actor.tenantId,
        productId,
      )
      if (!sku) fail(404, 'NOT_FOUND', 'Sản phẩm không tồn tại hoặc chưa có giá bán.')
      const quantity = integer(line.quantity, 'Số lượng', 1, 999)
      subtotal += BigInt(quantity) * BigInt(integer(sku.price, 'Giá bán'))
      if (subtotal > BigInt(Number.MAX_SAFE_INTEGER))
        fail(422, 'AMOUNT_OVERFLOW', 'Tiền hàng vượt giới hạn số nguyên an toàn.')
      return { skuId: productId, quantity }
    })
    const discount = integer(input.discount, 'Giảm giá')
    const shippingFee = integer(input.shippingFee, 'Phí giao hàng')
    if (BigInt(discount) > subtotal)
      fail(422, 'INVALID_INPUT', 'Giảm giá không được vượt quá tiền hàng.')
    if (subtotal - BigInt(discount) + BigInt(shippingFee) > BigInt(Number.MAX_SAFE_INTEGER))
      fail(422, 'AMOUNT_OVERFLOW', 'Tổng đơn hàng vượt giới hạn số nguyên an toàn.')
    if (!['cod', 'bank_transfer'].includes(input.paymentMethod))
      fail(422, 'INVALID_INPUT', 'Phương thức thanh toán không hợp lệ.')
    const recipientName = text(input.recipientName, 'Tên người nhận', 2, 200)
    const recipientPhone = text(input.recipientPhone, 'Số điện thoại', 8, 24)
    if (
      !/^\+?[\d\s().-]{8,24}$/.test(recipientPhone) ||
      recipientPhone.replace(/\D/g, '').length < 8
    )
      fail(422, 'INVALID_INPUT', 'Số điện thoại người nhận không hợp lệ.')
    const shippingAddress = text(input.shippingAddress, 'Địa chỉ giao hàng', 5, 500)
    const note = text(input.note ?? '', 'Ghi chú', 0, 5000)
    const warehouseId = text(input.warehouseId, 'Kho xuất', 1, 200)
    const warehouse = get(
      'SELECT id FROM warehouses WHERE tenant_id=? AND id=? AND active=1',
      actor.tenantId,
      warehouseId,
    )
    if (!warehouse) fail(404, 'NOT_FOUND', 'Kho không tồn tại hoặc đã ngừng hoạt động.')
    transaction(db, () => {
      const result = inventory.executeInTransaction(actor, 'salesOrder.create', {
        warehouseId,
        customerReference: `${customer.name} (${customer.id})`,
        reference: conversationId ? `conversation:${conversationId}` : '',
        note,
        lines: items,
      })
      const id = result.id
      run(
        `INSERT INTO sales_order_contexts(
          tenant_id,sales_order_id,customer_id,conversation_id,client_request_id,
          client_request_hash,payment_method,payment_status,fulfillment_status,discount,
          shipping_fee,recipient_name,recipient_phone,shipping_address,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,'unpaid','draft',?,?,?,?,?,?,?)`,
        actor.tenantId,
        id,
        customer.id,
        conversationId,
        clientRequestId,
        clientRequestId ? requestHash : null,
        input.paymentMethod,
        discount,
        shippingFee,
        recipientName,
        recipientPhone,
        shippingAddress,
        stamp(),
        stamp(),
      )
      audit(actor, 'order.created', id, { description: `Tạo bản nháp ${result.number}.` })
    })
    return operationsSnapshot(actor)
  }
  const requireOrder = (actor, id) => {
    const row = get(
      `SELECT c.*,s.status AS inventory_status,s.fulfillment_document_id,s.number
       FROM sales_order_contexts c JOIN sales_orders s
         ON s.tenant_id=c.tenant_id AND s.id=c.sales_order_id
       WHERE c.tenant_id=? AND c.sales_order_id=?`,
      actor.tenantId,
      id,
    )
    if (!row) fail(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng.')
    return row
  }
  const changeOrderStatus = (actor, orderId, input) => {
    requirePermission(actor, 'orders.manage')
    allowed(input, ['status'])
    const nextStatus = input.status
    const current = requireOrder(actor, orderId)
    if (!orderTransitions[current.fulfillment_status]?.includes(nextStatus))
      fail(409, 'INVALID_TRANSITION', 'Không thể chuyển trạng thái đơn hàng theo thứ tự này.')
    if (['shipped', 'delivered', 'returned'].includes(nextStatus))
      fail(
        409,
        'SHIPMENT_REQUIRED',
        'Cập nhật trạng thái qua sự kiện vận chuyển hoặc nghiệp vụ trả hàng.',
      )
    transaction(db, () => {
      if (nextStatus === 'confirmed' || nextStatus === 'cancelled') {
        if (current.inventory_status !== nextStatus)
          inventory.executeInTransaction(
            actor,
            nextStatus === 'confirmed' ? 'salesOrder.confirm' : 'salesOrder.cancel',
            { id: orderId },
          )
      }
      run(
        'UPDATE sales_order_contexts SET fulfillment_status=?,updated_at=? WHERE tenant_id=? AND sales_order_id=?',
        nextStatus,
        stamp(),
        actor.tenantId,
        orderId,
      )
      audit(actor, `order.${nextStatus}`, orderId, {
        description: `${current.number}: ${current.fulfillment_status} → ${nextStatus}.`,
      })
    })
    return operationsSnapshot(actor)
  }
  const changePaymentStatus = (actor, orderId, input) => {
    requirePermission(actor, 'orders.manage')
    allowed(input, ['status'])
    const current = requireOrder(actor, orderId)
    const status = input.status
    if (!(
      (status === 'paid' &&
        current.payment_status === 'unpaid' &&
        !['draft', 'cancelled', 'returned'].includes(current.fulfillment_status)) ||
      (status === 'refunded' &&
        current.payment_status === 'paid' &&
        ['cancelled', 'returned'].includes(current.fulfillment_status))
    ))
      fail(409, 'INVALID_TRANSITION', 'Thay đổi trạng thái thanh toán không hợp lệ.')
    transaction(db, () => {
      run(
        'UPDATE sales_order_contexts SET payment_status=?,updated_at=? WHERE tenant_id=? AND sales_order_id=?',
        status,
        stamp(),
        actor.tenantId,
        orderId,
      )
      audit(actor, `order.payment.${status}`, orderId, {
        description: `${current.number}: nhân viên ghi nhận ${status}; chưa có xác nhận từ cổng thanh toán.`,
      })
    })
    return operationsSnapshot(actor)
  }
  const createShipment = (actor, input) => {
    requirePermission(actor, 'logistics.manage')
    allowed(input, ['orderId', 'carrierId'])
    const orderId = text(input.orderId, 'ID đơn hàng', 1, 200)
    const order = requireOrder(actor, orderId)
    if (order.fulfillment_status !== 'packing')
      fail(409, 'INVALID_TRANSITION', 'Chỉ tạo vận đơn cho đơn đang đóng gói.')
    if (input.carrierId !== 'manual')
      fail(503, 'CARRIER_NOT_CONNECTED', 'Chưa cấu hình hãng vận chuyển thật; không đặt lấy hàng.')
    const id = newId()
    const timestamp = stamp()
    transaction(db, () => {
      run(
        `INSERT INTO shipments(
          id,tenant_id,sales_order_id,carrier_id,carrier_name,tracking_number,status,
          created_at,updated_at
        ) VALUES(?,?,?,'manual','Vận chuyển thủ công',?,'ready',?,?)`,
        id,
        actor.tenantId,
        orderId,
        `SHIP-${id.slice(0, 8).toUpperCase()}`,
        timestamp,
        timestamp,
      )
      run(
        "INSERT INTO shipment_events(id,tenant_id,shipment_id,status,description,created_at) VALUES(?,?,?,'ready',?,?)",
        newId(),
        actor.tenantId,
        id,
        'Tạo phiếu vận chuyển nội bộ; chưa đặt dịch vụ hãng vận chuyển.',
        timestamp,
      )
      audit(actor, 'shipment.created', id, {
        description: `Tạo phiếu vận chuyển nội bộ cho ${order.number}.`,
      })
    })
    return operationsSnapshot(actor)
  }
  const advanceShipment = (actor, shipmentId, input) => {
    requirePermission(actor, 'logistics.manage')
    allowed(input, ['status', 'description'])
    const current = get(
      'SELECT * FROM shipments WHERE tenant_id=? AND id=?',
      actor.tenantId,
      shipmentId,
    )
    if (!current) fail(404, 'NOT_FOUND', 'Không tìm thấy vận đơn.')
    const status = input.status
    if (!shipmentTransitions[current.status]?.includes(status))
      fail(409, 'INVALID_TRANSITION', 'Không thể chuyển trạng thái vận đơn theo thứ tự này.')
    const description = text(
      input.description ?? `Cập nhật vận chuyển nội bộ: ${status}.`,
      'Diễn giải',
      1,
      2000,
    )
    const order = requireOrder(actor, current.sales_order_id)
    transaction(db, () => {
      if (status === 'in_transit' && order.inventory_status === 'confirmed')
        inventory.executeInTransaction(actor, 'salesOrder.fulfill', { id: order.sales_order_id })
      run(
        'UPDATE shipments SET status=?,updated_at=? WHERE tenant_id=? AND id=?',
        status,
        stamp(),
        actor.tenantId,
        shipmentId,
      )
      run(
        'INSERT INTO shipment_events(id,tenant_id,shipment_id,status,description,created_at) VALUES(?,?,?,?,?,?)',
        newId(),
        actor.tenantId,
        shipmentId,
        status,
        description,
        stamp(),
      )
      const mappedStatus =
        status === 'in_transit'
          ? 'shipped'
          : status === 'delivered'
            ? 'delivered'
            : status === 'returned'
              ? 'returned'
              : null
      if (mappedStatus)
        run(
          'UPDATE sales_order_contexts SET fulfillment_status=?,updated_at=? WHERE tenant_id=? AND sales_order_id=?',
          mappedStatus,
          stamp(),
          actor.tenantId,
          order.sales_order_id,
        )
      audit(actor, `shipment.${status}`, shipmentId, { description })
    })
    return operationsSnapshot(actor)
  }
  const createTicket = (actor, input) => {
    requirePermission(actor, 'care.manage')
    allowed(input, [
      'customerId',
      'orderId',
      'conversationId',
      'subject',
      'description',
      'category',
      'priority',
      'assigneeId',
    ])
    const customerId = text(input.customerId, 'ID khách hàng', 1, 200)
    customerById(actor, customerId)
    const orderId =
      input.orderId === undefined || input.orderId === null || input.orderId === ''
        ? null
        : text(input.orderId, 'ID đơn hàng', 1, 200)
    const conversationId = input.conversationId ?? null
    if (
      orderId &&
      requireOrder(actor, text(orderId, 'ID đơn hàng', 1, 200)).customer_id !== customerId
    )
      fail(422, 'INVALID_INPUT', 'Đơn hàng không thuộc khách hàng được chọn.')
    if (
      conversationId &&
      !get(
        'SELECT id FROM conversations WHERE tenant_id=? AND id=? AND customer_id=?',
        actor.tenantId,
        text(conversationId, 'ID hội thoại', 1, 200),
        customerId,
      )
    )
      fail(422, 'INVALID_INPUT', 'Hội thoại không thuộc khách hàng được chọn.')
    if (!['delivery', 'return', 'payment', 'product', 'other'].includes(input.category))
      fail(422, 'INVALID_INPUT', 'Danh mục yêu cầu chăm sóc không hợp lệ.')
    if (!Object.hasOwn(slaHours, input.priority))
      fail(422, 'INVALID_INPUT', 'Mức ưu tiên không hợp lệ.')
    const assigneeId = input.assigneeId ?? null
    if (assigneeId !== null && typeof assigneeId !== 'string')
      fail(422, 'INVALID_INPUT', 'Nhân viên được giao không hợp lệ.')
    if (!agentExists(actor.tenantId, assigneeId))
      fail(422, 'INVALID_INPUT', 'Nhân viên không hoạt động hoặc không thuộc doanh nghiệp.')
    const number =
      (get(
        'SELECT MAX(CAST(substr(number,4) AS INTEGER)) AS max FROM tickets WHERE tenant_id=?',
        actor.tenantId,
      ).max ?? 1000) + 1
    const id = newId()
    const ticketNumber = `CS-${number}`
    const createdAt = stamp()
    const dueAt = new Date(now().getTime() + slaHours[input.priority] * 3600000).toISOString()
    transaction(db, () => {
      run(
        `INSERT INTO tickets(
          id,tenant_id,number,customer_id,sales_order_id,conversation_id,subject,description,
          category,status,priority,assignee_id,due_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?, ?,?,'open',?,?,?, ?,?)`,
        id,
        actor.tenantId,
        ticketNumber,
        customerId,
        orderId,
        conversationId,
        text(input.subject, 'Tiêu đề', 3, 200),
        text(input.description, 'Mô tả', 3, 5000),
        input.category,
        input.priority,
        assigneeId,
        dueAt,
        createdAt,
        createdAt,
      )
      audit(actor, 'ticket.created', id, { description: `Tiếp nhận ${ticketNumber}.` })
    })
    return operationsSnapshot(actor)
  }
  const updateTicket = (actor, ticketId, patch) => {
    requirePermission(actor, 'care.manage')
    allowed(patch, ['status', 'priority', 'assigneeId', 'resolution', 'dueAt'])
    const current = get(
      'SELECT * FROM tickets WHERE tenant_id=? AND id=?',
      actor.tenantId,
      ticketId,
    )
    if (!current) fail(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu chăm sóc.')
    const nextStatus = patch.status ?? current.status
    if (
      patch.status !== undefined &&
      patch.status !== current.status &&
      !ticketTransitions[current.status]?.includes(patch.status)
    )
      fail(409, 'INVALID_TRANSITION', 'Không thể chuyển trạng thái yêu cầu theo thứ tự này.')
    const priority = patch.priority ?? current.priority
    if (!Object.hasOwn(slaHours, priority)) fail(422, 'INVALID_INPUT', 'Mức ưu tiên không hợp lệ.')
    const assigneeId = patch.assigneeId === undefined ? current.assignee_id : patch.assigneeId
    if (!agentExists(actor.tenantId, assigneeId))
      fail(422, 'INVALID_INPUT', 'Nhân viên không hoạt động hoặc không thuộc doanh nghiệp.')
    const resolution =
      patch.resolution === undefined
        ? current.resolution
        : text(patch.resolution, 'Kết quả xử lý', 0, 5000)
    if (['resolved', 'closed'].includes(nextStatus) && resolution.length < 3)
      fail(422, 'INVALID_INPUT', 'Nhập kết quả xử lý trước khi đóng yêu cầu.')
    const dueAt =
      patch.dueAt === undefined
        ? current.due_at
        : Number.isFinite(Date.parse(patch.dueAt))
          ? new Date(patch.dueAt).toISOString()
          : fail(422, 'INVALID_INPUT', 'Hạn xử lý không hợp lệ.')
    transaction(db, () => {
      run(
        'UPDATE tickets SET status=?,priority=?,assignee_id=?,resolution=?,due_at=?,updated_at=?,resolved_at=? WHERE tenant_id=? AND id=?',
        nextStatus,
        priority,
        assigneeId,
        resolution,
        dueAt,
        stamp(),
        ['resolved', 'closed'].includes(nextStatus) ? (current.resolved_at ?? stamp()) : null,
        actor.tenantId,
        ticketId,
      )
      audit(actor, 'ticket.updated', ticketId, { description: 'Cập nhật yêu cầu chăm sóc.' })
    })
    return operationsSnapshot(actor)
  }
  const addTicketComment = (actor, ticketId, input) => {
    requirePermission(actor, 'care.manage')
    allowed(input, ['text'])
    if (!get('SELECT id FROM tickets WHERE tenant_id=? AND id=?', actor.tenantId, ticketId))
      fail(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu chăm sóc.')
    const id = newId()
    const timestamp = stamp()
    transaction(db, () => {
      run(
        'INSERT INTO ticket_comments(id,tenant_id,ticket_id,author_id,text,created_at) VALUES(?,?,?,?,?,?)',
        id,
        actor.tenantId,
        ticketId,
        actor.userId,
        text(input.text, 'Ghi chú', 1, 5000),
        timestamp,
      )
      run(
        'UPDATE tickets SET updated_at=? WHERE tenant_id=? AND id=?',
        timestamp,
        actor.tenantId,
        ticketId,
      )
      audit(actor, 'ticket.comment.created', id, { description: 'Thêm ghi chú nội bộ.' })
    })
    return operationsSnapshot(actor)
  }
  const unavailable = () =>
    fail(
      503,
      'CHANNEL_NOT_CONFIGURED',
      'Chưa cấu hình OAuth/API nhà cung cấp. Không có kênh nào được đồng bộ hoặc gửi tin.',
    )

  return {
    inbox: inboxSnapshot,
    operations: operationsSnapshot,
    createCustomer,
    updateCustomer,
    updateConversation,
    sendMessage,
    updateCustomerProfile,
    addCustomerNote,
    createOrder,
    changeOrderStatus,
    changePaymentStatus,
    createShipment,
    advanceShipment,
    createTicket,
    updateTicket,
    addTicketComment,
    listConnections(actor) {
      requirePermission(actor, 'inbox.read')
      return inboxSnapshot(actor).connections ?? []
    },
    async beginChannelConnection(actor, channel) {
      requirePermission(actor, 'inbox.manage')
      if (!channelIds.includes(channel)) fail(404, 'NOT_FOUND', 'Kênh không được hỗ trợ.')
      if (channel === 'telegram') {
        const bot = await telegramApi(actor, 'getMe', {})
        if (!bot || !Number.isSafeInteger(bot.id) || typeof bot.username !== 'string')
          fail(502, 'TELEGRAM_INVALID_RESPONSE', 'Thông tin bot Telegram không hợp lệ.')
        const accountName = `@${text(bot.username, 'Tên bot', 1, 100)}`
        const assigned = get(
          "SELECT tenant_id FROM channel_connections WHERE channel='telegram' AND account_name=? AND tenant_id<>? LIMIT 1",
          accountName,
          actor.tenantId,
        )
        if (assigned)
          fail(409, 'TELEGRAM_BOT_IN_USE', 'Bot Telegram này đã được gắn với doanh nghiệp khác.')
        const existing = get(
          "SELECT id FROM channel_connections WHERE tenant_id=? AND channel='telegram' AND account_name=? ORDER BY created_at LIMIT 1",
          actor.tenantId,
          accountName,
        )
        const id = existing?.id ?? newId()
        const connectedAt = stamp()
        if (existing) {
          run(
            "UPDATE channel_connections SET status='connected',detail=?,updated_at=? WHERE tenant_id=? AND id=?",
            'Telegram Bot API · đồng bộ thủ công',
            connectedAt,
            actor.tenantId,
            id,
          )
        } else {
          run(
            "INSERT INTO channel_connections(id,tenant_id,channel,account_name,status,detail,created_at,updated_at) VALUES(?,?,'telegram',?,'connected',?,?,?)",
            id,
            actor.tenantId,
            accountName,
            'Telegram Bot API · đồng bộ thủ công',
            connectedAt,
            connectedAt,
          )
        }
        return { authorizationUrl: `https://t.me/${encodeURIComponent(bot.username)}` }
      }
      return unavailable()
    },
    async syncConnection(actor, connectionId, requestId) {
      requirePermission(actor, 'inbox.manage')
      text(connectionId, 'ID kết nối', 1, 200)
      text(requestId, 'Mã yêu cầu đồng bộ', 1, 100)
      const connection = get(
        "SELECT * FROM channel_connections WHERE tenant_id=? AND id=? AND channel='telegram'",
        actor.tenantId,
        connectionId,
      )
      if (!connection) fail(404, 'NOT_FOUND', 'Không tìm thấy kết nối Telegram.')
      const updates = await telegramApi(actor, 'getUpdates', {
        offset: connection.provider_cursor + 1,
        limit: 100,
        timeout: 0,
        allowed_updates: ['message'],
      })
      if (!Array.isArray(updates))
        fail(502, 'TELEGRAM_INVALID_RESPONSE', 'Telegram trả về danh sách tin nhắn không hợp lệ.')
      const stampNow = stamp()
      let importedMessages = 0
      let cursor = connection.provider_cursor
      transaction(db, () => {
        for (const update of updates) {
          if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) continue
          cursor = Math.max(cursor, update.update_id)
          const message = update.message
          const chat = message?.chat
          const sender = message?.from
          const body =
            typeof message?.text === 'string'
              ? message.text
              : typeof message?.caption === 'string'
                ? message.caption
                : ''
          if (
            chat?.type !== 'private' ||
            !Number.isSafeInteger(chat.id) ||
            !Number.isSafeInteger(message?.message_id) ||
            sender?.is_bot ||
            !body.trim()
          )
            continue
          const externalConversationId = `${connection.id}:${chat.id}`
          let conversation = get(
            'SELECT id,customer_id FROM conversations WHERE tenant_id=? AND channel=? AND external_id=?',
            actor.tenantId,
            'telegram',
            externalConversationId,
          )
          if (
            conversation &&
            get(
              'SELECT id FROM messages WHERE tenant_id=? AND conversation_id=? AND external_id=?',
              actor.tenantId,
              conversation.id,
              String(message.message_id),
            )
          )
            continue
          const sentAt =
            Number.isSafeInteger(message.date) && message.date > 0
              ? new Date(message.date * 1000).toISOString()
              : stampNow
          const cleanBody = text(body, 'Tin nhắn Telegram', 1, 10000)
          if (!conversation) {
            const senderName = [sender?.first_name, sender?.last_name]
              .filter((name) => typeof name === 'string' && name.trim())
              .join(' ')
              .trim()
            const customerName =
              senderName.length >= 2
                ? senderName
                : typeof sender?.username === 'string' && sender.username.trim()
                  ? `@${sender.username.trim()}`
                  : `Khách Telegram ${chat.id}`
            const customerId = newId()
            run(
              `INSERT INTO customers(
                id,tenant_id,name,phone,phone_normalized,email,company,membership,location,
                avatar_color,created_at,updated_at
              ) VALUES(?,?,?,'','','','','Standard','','#dedcf5',?,?)`,
              customerId,
              actor.tenantId,
              customerName.slice(0, 200),
              stampNow,
              stampNow,
            )
            run(
              "INSERT INTO customer_profiles(tenant_id,customer_id,status,source,created_at,updated_at) VALUES(?,?,'lead','telegram',?,?)",
              actor.tenantId,
              customerId,
              stampNow,
              stampNow,
            )
            const conversationId = newId()
            run(
              `INSERT INTO conversations(
                id,tenant_id,customer_id,channel,connection_id,external_id,status,priority,
                subject,unread,last_message_at,due_at,created_at,updated_at
              ) VALUES(?,?,?,'telegram',?,?,'open','normal',?,0,?,?,?,?)`,
              conversationId,
              actor.tenantId,
              customerId,
              connection.id,
              externalConversationId,
              cleanBody.slice(0, 200),
              sentAt,
              new Date(new Date(stampNow).getTime() + slaHours.normal * 3600000).toISOString(),
              stampNow,
              stampNow,
            )
            conversation = { id: conversationId, customer_id: customerId }
          }
          run(
            `INSERT INTO messages(
              id,tenant_id,conversation_id,external_id,type,text,sent_at,delivery,author_name,created_at
            ) VALUES(?,?,?,?,'incoming',?,?, 'delivered',?,?)`,
            newId(),
            actor.tenantId,
            conversation.id,
            String(message.message_id),
            cleanBody,
            sentAt,
            typeof sender?.username === 'string' && sender.username.trim()
              ? `@${sender.username.trim()}`
              : null,
            stampNow,
          )
          run(
            'UPDATE conversations SET unread=unread+1,last_message_at=?,updated_at=? WHERE tenant_id=? AND id=?',
            sentAt,
            stampNow,
            actor.tenantId,
            conversation.id,
          )
          importedMessages += 1
        }
        run(
          "UPDATE channel_connections SET provider_cursor=MAX(provider_cursor,?),status='connected',last_synced_at=?,detail=?,updated_at=? WHERE tenant_id=? AND id=?",
          cursor,
          stampNow,
          `Telegram Bot API · đồng bộ thủ công (${importedMessages} tin nhắn mới)`,
          stampNow,
          actor.tenantId,
          connection.id,
        )
        if (importedMessages)
          audit(actor, 'telegram.messages.synced', connection.id, {
            importedMessages,
            requestId,
          })
      })
      return {
        connection: inboxSnapshot(actor).connections.find((item) => item.id === connection.id),
        inbox: inboxSnapshot(actor),
        importedMessages,
      }
    },
    reset() {
      fail(405, 'METHOD_NOT_ALLOWED', 'Không cho phép khôi phục dữ liệu ở chế độ thật.')
    },
  }
}
