import type { InventorySnapshot } from './types'
import { notifyAuthenticationExpired } from '../../services/authSession'

export class InventoryApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface InventoryAccountUser {
  id: string
  name: string
  email: string | null
  role: string
  active: boolean
  isOnline: boolean
  lastActivityAt: string | null
  permissions?: string[]
}

export interface InventoryLoginEvent {
  id: string
  userId: string | null
  userName: string | null
  email: string | null
  succeeded: boolean
  remoteAddress: string
  userAgent: string
  createdAt: string
}

export interface InventoryAccountActivity {
  id: string
  kind: 'login' | 'action'
  action: string
  entityId: string | null
  description: string | null
  succeeded: boolean | null
  createdAt: string
}

export interface InventoryAccountSession {
  actor: { userId: string; tenantId: string; role: string }
  user: { id: string; name: string; email: string | null; role: string }
  tenant: { id: string; name: string }
  permissions: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isRestockRequest = (value: unknown) =>
  isRecord(value) &&
  [
    'id',
    'number',
    'warehouseId',
    'sourceReference',
    'note',
    'createdBy',
    'createdAt',
  ].every((field) => typeof value[field] === 'string') &&
  ['open', 'proposed', 'approved', 'partial', 'received', 'cancelled'].includes(
    String(value.status),
  ) &&
  (value.purchaseOrderId === null || typeof value.purchaseOrderId === 'string') &&
  (value.purchaseOrderNumber === null || typeof value.purchaseOrderNumber === 'string') &&
  Array.isArray(value.lines) &&
  value.lines.length > 0 &&
  value.lines.every(
    (line: unknown) =>
      isRecord(line) &&
      typeof line.id === 'string' &&
      typeof line.skuId === 'string' &&
      Number.isSafeInteger(line.requestedQuantity) &&
      Number(line.requestedQuantity) > 0,
  )
const isAccountUser = (value: unknown): value is InventoryAccountUser =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  (typeof value.email === 'string' || value.email === null) &&
  typeof value.role === 'string' &&
  typeof value.active === 'boolean' &&
  typeof value.isOnline === 'boolean' &&
  (typeof value.lastActivityAt === 'string' || value.lastActivityAt === null) &&
  (value.permissions === undefined ||
    (Array.isArray(value.permissions) &&
      value.permissions.every((item) => typeof item === 'string')))
const isLoginEvent = (value: unknown): value is InventoryLoginEvent =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (typeof value.userId === 'string' || value.userId === null) &&
  (typeof value.userName === 'string' || value.userName === null) &&
  (typeof value.email === 'string' || value.email === null) &&
  typeof value.succeeded === 'boolean' &&
  typeof value.remoteAddress === 'string' &&
  typeof value.userAgent === 'string' &&
  typeof value.createdAt === 'string'
const isAccountActivity = (value: unknown): value is InventoryAccountActivity =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.kind === 'login' || value.kind === 'action') &&
  typeof value.action === 'string' &&
  (typeof value.entityId === 'string' || value.entityId === null) &&
  (typeof value.description === 'string' || value.description === null) &&
  (typeof value.succeeded === 'boolean' || value.succeeded === null) &&
  typeof value.createdAt === 'string'
const isAccountSession = (value: unknown): value is InventoryAccountSession =>
  isRecord(value) &&
  isRecord(value.actor) &&
  typeof value.actor.userId === 'string' &&
  typeof value.actor.tenantId === 'string' &&
  typeof value.actor.role === 'string' &&
  isRecord(value.user) &&
  typeof value.user.id === 'string' &&
  typeof value.user.name === 'string' &&
  (typeof value.user.email === 'string' || value.user.email === null) &&
  typeof value.user.role === 'string' &&
  isRecord(value.tenant) &&
  typeof value.tenant.id === 'string' &&
  typeof value.tenant.name === 'string' &&
  Array.isArray(value.permissions) &&
  value.permissions.every((permission) => typeof permission === 'string')

export function assertInventorySnapshot(value: unknown): asserts value is InventorySnapshot {
  const collections = [
    'warehouses',
    'locations',
    'suppliers',
    'skus',
    'balances',
    'documents',
    'purchaseRequests',
    'purchaseOrders',
    'salesOrders',
    'ledger',
    'reservations',
    'counts',
    'serials',
    'warranties',
    'auditEvents',
  ]
  if (
    !isRecord(value) ||
    !isRecord(value.tenant) ||
    typeof value.tenant.id !== 'string' ||
    typeof value.tenant.name !== 'string' ||
    !isRecord(value.tenant.config) ||
    !isRecord(value.actor) ||
    typeof value.actor.userId !== 'string' ||
    typeof value.actor.role !== 'string' ||
    !isRecord(value.metrics) ||
    !Array.isArray(value.permissions) ||
    !value.permissions.every((item) => typeof item === 'string') ||
    !collections.every((key) => Array.isArray(value[key]) && value[key].every(isRecord))
  ) {
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Dữ liệu API kho không đúng cấu trúc. / Invalid inventory API response.',
    )
  }
  if (!Array.isArray(value.purchaseRequests) || !value.purchaseRequests.every(isRestockRequest))
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Dữ liệu yêu cầu nhập hàng không hợp lệ. / Invalid restock request data.',
    )
  if (
    !Array.isArray(value.purchaseOrders) ||
    !value.purchaseOrders.every(
      (order) =>
        isRecord(order) &&
        [
          'id',
          'number',
          'warehouseId',
          'supplierId',
          'reference',
          'note',
          'createdBy',
          'createdAt',
        ].every((field) => typeof order[field] === 'string') &&
        ['draft', 'approved', 'partial', 'received', 'cancelled'].includes(String(order.status)) &&
        Array.isArray(order.receiptDocumentIds) &&
        order.receiptDocumentIds.every((id) => typeof id === 'string') &&
        Array.isArray(order.lines) &&
        order.lines.length > 0 &&
        order.lines.every(
          (line) =>
            isRecord(line) &&
            ['id', 'purchaseOrderId', 'skuId'].every((field) => typeof line[field] === 'string') &&
            (line.locationId === null || typeof line.locationId === 'string') &&
            [
              'quantity',
              'unitCost',
              'receivedQuantity',
              'outstandingQuantity',
              'pendingReceiptQuantity',
            ].every((field) => Number.isSafeInteger(line[field]) && Number(line[field]) >= 0) &&
            Number(line.quantity) > 0 &&
            Number(line.receivedQuantity) <= Number(line.quantity) &&
            Number(line.outstandingQuantity) ===
              Number(line.quantity) - Number(line.receivedQuantity) &&
            Number(line.pendingReceiptQuantity) <= Number(line.outstandingQuantity),
        ),
    )
  )
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Dữ liệu đơn mua hàng không hợp lệ. / Invalid purchase order data.',
    )
  const safeNumbers = (records: unknown[], fields: string[]) =>
    records.every(
      (record) =>
        isRecord(record) &&
        fields.every(
          (field) => typeof record[field] === 'number' && Number.isSafeInteger(record[field]),
        ),
    )
  if (
    !(value.salesOrders as Record<string, unknown>[]).every(
      (order) =>
        [
          'id',
          'number',
          'warehouseId',
          'customerReference',
          'reference',
          'note',
          'createdAt',
        ].every((field) => typeof order[field] === 'string') &&
        ['draft', 'confirmed', 'fulfilled', 'returned', 'cancelled'].includes(
          String(order.status),
        ) &&
        (order.fulfillmentDocumentId === null || typeof order.fulfillmentDocumentId === 'string') &&
        Array.isArray(order.lines) &&
        order.lines.length > 0 &&
        order.lines.every(
          (line) =>
            isRecord(line) &&
            ['id', 'skuId', 'sku', 'name', 'locationId'].every(
              (field) => typeof line[field] === 'string',
            ) &&
            (line.reservationId === null || typeof line.reservationId === 'string') &&
            ['quantity', 'unitPrice', 'returnedQuantity', 'returnableQuantity'].every(
              (field) => Number.isSafeInteger(line[field]) && Number(line[field]) >= 0,
            ) &&
            Number(line.quantity) > 0 &&
            Number(line.returnedQuantity) <= Number(line.quantity) &&
            Number(line.returnableQuantity) ===
              Number(line.quantity) - Number(line.returnedQuantity),
        ),
    )
  )
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Dữ liệu đơn bán liên kết kho không hợp lệ. / Invalid inventory sales order data.',
    )
  if (
    !safeNumbers(value.balances as unknown[], [
      'onHand',
      'reserved',
      'available',
      'inventoryValue',
    ]) ||
    !(value.documents as Record<string, unknown>[]).every((record) => Array.isArray(record.lines))
  ) {
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Dữ liệu tồn kho không hợp lệ. / Invalid stock data.',
    )
  }
  const requiredStrings: Record<string, string[]> = {
    warehouses: ['id', 'code', 'name'],
    locations: ['id', 'warehouseId', 'code', 'name'],
    suppliers: ['id', 'code', 'name'],
    skus: ['id', 'sku', 'name', 'category', 'unit'],
    balances: ['skuId', 'warehouseId'],
    documents: ['id', 'number', 'type', 'status', 'warehouseId', 'createdAt'],
    ledger: ['id', 'warehouseId', 'skuId', 'kind', 'createdAt'],
    reservations: ['id', 'warehouseId', 'skuId', 'reference', 'status'],
    counts: ['id', 'warehouseId', 'name', 'status', 'createdAt'],
    serials: ['id', 'serialNumber', 'skuId', 'status'],
    warranties: ['id', 'serialId', 'customerName', 'issue', 'status'],
    auditEvents: ['id', 'actorId', 'action', 'entityId', 'createdAt'],
  }
  if (
    !Object.entries(requiredStrings).every(([key, fields]) =>
      (value[key] as Record<string, unknown>[]).every((record) =>
        fields.every((field) => typeof record[field] === 'string'),
      ),
    ) ||
    !(value.documents as Record<string, unknown>[]).every((document) =>
      (document.lines as unknown[]).every(
        (line) =>
          isRecord(line) &&
          typeof line.id === 'string' &&
          typeof line.skuId === 'string' &&
          Number.isSafeInteger(line.quantity) &&
          Number.isSafeInteger(line.unitCost) &&
          (line.inventoryValue === null || Number.isSafeInteger(line.inventoryValue)) &&
          Array.isArray(line.serialNumbers) &&
          line.serialNumbers.every((serial) => typeof serial === 'string'),
      ),
    )
  ) {
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Chi tiết dữ liệu kho không hợp lệ. / Invalid inventory details.',
    )
  }
  for (const [key, fields] of Object.entries({
    dailyMovements: ['receiptQuantity', 'issueQuantity'],
    replenishmentSuggestions: [
      'quantity',
      'available',
      'pendingIncoming',
      'leadTimeDays',
      'reorderPoint',
      'targetStock',
    ],
    transferSuggestions: ['quantity'],
    pendingIncoming: ['quantity', 'value'],
  })) {
    if (
      value.metrics[key] !== undefined &&
      (!Array.isArray(value.metrics[key]) || !safeNumbers(value.metrics[key], fields))
    )
      throw new InventoryApiError(
        502,
        'INVALID_RESPONSE',
        'Dữ liệu chỉ số kho không hợp lệ. / Invalid inventory metrics.',
      )
  }
}

export function createInventoryService(baseUrl = '') {
  let actorScope: string | null = null
  let sessionGeneration = 0
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : isRecord(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value
  const digest = async (value: unknown) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(canonical(value))),
        ),
      ),
    )
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  const persistedKey = async (scope: string, body: unknown) => {
    try {
      const storageKey = `smartsales.inventory.retry.v1.${await digest([baseUrl, scope, body])}`
      const storage = globalThis.sessionStorage
      const saved = storage.getItem(storageKey)
      if (saved && !/^[a-zA-Z0-9-]{16,128}$/.test(saved)) throw new Error('Invalid retry record')
      const key = saved ?? crypto.randomUUID()
      storage.setItem(storageKey, key)
      return {
        key,
        clear: () => {
          storage.removeItem(storageKey)
        },
      }
    } catch {
      throw new InventoryApiError(
        0,
        'RETRY_STORAGE_UNAVAILABLE',
        'Không thể lưu mã chống trùng cho thao tác. Kiểm tra quyền sessionStorage trước khi ghi kho. / Unable to persist the retry key. Enable session storage before changing inventory.',
      )
    }
  }
  const request = async (path: string, method = 'GET', body?: unknown, key?: string) => {
    const generation = sessionGeneration
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const contentType = response.headers.get('content-type')
      if (contentType?.toLowerCase().includes('text/html'))
        throw new InventoryApiError(
          response.status >= 500 ? 0 : response.status,
          'API_NOT_READY',
          'Máy chủ kho chưa sẵn sàng hoặc proxy chưa kết nối API. Chạy npm run server:inventory rồi tải lại trang. / Inventory API is unavailable or the proxy is misconfigured. Run npm run server:inventory and reload.',
        )
      let value: unknown
      try {
        value = await response.json()
      } catch {
        throw new InventoryApiError(
          502,
          'INVALID_RESPONSE',
          'API kho trả về JSON không hợp lệ. / Invalid inventory API JSON.',
        )
      }
      if (!response.ok) {
        if (response.status === 401 && generation === sessionGeneration) {
          sessionGeneration++
          actorScope = null
        }
        if (response.status === 401) notifyAuthenticationExpired()
        const error = isRecord(value) && isRecord(value.error) ? value.error : {}
        throw new InventoryApiError(
          response.status,
          typeof error.code === 'string' ? error.code : 'API_ERROR',
          typeof error.message === 'string' ? error.message : `Inventory API: ${response.status}`,
        )
      }
      return value
    } catch (error) {
      if (error instanceof InventoryApiError) throw error
      throw new InventoryApiError(
        0,
        'CONNECTION_ERROR',
        'Không kết nối được máy chủ kho. Nếu thao tác đã gửi, hãy tải lại hoặc thử lại để xác minh. / Inventory server unavailable. Reload or retry to verify submitted changes.',
      )
    } finally {
      clearTimeout(timeout)
    }
  }
  return {
    async load(
      filters: {
        ledgerLimit?: number
        beforeSequence?: number
        warehouseId?: string
        skuId?: string
      } = {},
    ) {
      const generation = sessionGeneration
      const query = new URLSearchParams()
      if (filters.ledgerLimit !== undefined) query.set('ledgerLimit', String(filters.ledgerLimit))
      if (filters.beforeSequence !== undefined)
        query.set('beforeSequence', String(filters.beforeSequence))
      if (filters.warehouseId) query.set('warehouseId', filters.warehouseId)
      if (filters.skuId) query.set('skuId', filters.skuId)
      const suffix = query.size ? `?${query.toString()}` : ''
      const data = await request(`/inventory/snapshot${suffix}`)
      assertInventorySnapshot(data)
      if (generation === sessionGeneration)
        actorScope = JSON.stringify([data.tenant.id, data.actor.userId])
      return data
    },
    async login(email: string, password: string) {
      sessionGeneration++
      actorScope = null
      await request('/auth/login', 'POST', { email, password })
    },
    async register(input: { companyName: string; name: string; email: string; password: string }) {
      sessionGeneration++
      actorScope = null
      await request('/auth/register', 'POST', input)
    },
    async checkSession(): Promise<InventoryAccountSession> {
      const value: unknown = await request('/auth/me')
      if (!isAccountSession(value))
        throw new InventoryApiError(
          502,
          'INVALID_ACCOUNT_SESSION',
          'Thông tin phiên đăng nhập không hợp lệ. / Invalid account session.',
        )
      return value
    },
    async changePassword(currentPassword: string, newPassword: string) {
      return request('/auth/password', 'POST', { currentPassword, newPassword })
    },
    async listUsers(): Promise<InventoryAccountUser[]> {
      const value: unknown = await request('/auth/users')
      if (!isRecord(value) || !Array.isArray(value.users) || !value.users.every(isAccountUser))
        throw new InventoryApiError(
          502,
          'INVALID_ACCOUNT_USERS',
          'Danh sách tài khoản nhân viên không hợp lệ. / Invalid employee account list.',
        )
      return value.users
    },
    async listLoginEvents(): Promise<InventoryLoginEvent[]> {
      const value: unknown = await request('/auth/login-events')
      if (!isRecord(value) || !Array.isArray(value.events) || !value.events.every(isLoginEvent))
        throw new InventoryApiError(
          502,
          'INVALID_LOGIN_EVENTS',
          'Lịch sử đăng nhập không hợp lệ. / Invalid login history.',
        )
      return value.events
    },
    async listUserActivity(id: string): Promise<InventoryAccountActivity[]> {
      const value: unknown = await request(`/auth/users/${encodeURIComponent(id)}/activity`)
      if (
        !isRecord(value) ||
        !Array.isArray(value.events) ||
        !value.events.every(isAccountActivity)
      )
        throw new InventoryApiError(
          502,
          'INVALID_ACCOUNT_ACTIVITY',
          'Lịch sử hoạt động nhân viên không hợp lệ. / Invalid employee activity history.',
        )
      return value.events
    },
    async createUser(input: { name: string; email: string; password: string; role: string }) {
      return request('/auth/users', 'POST', input)
    },
    async resetUserPassword(id: string, password: string) {
      return request(`/auth/users/${encodeURIComponent(id)}/password`, 'POST', { password })
    },
    async permissionCatalog(): Promise<{
      permissions: string[]
      defaults: Record<string, string[]>
    }> {
      const value: unknown = await request('/auth/permissions')
      if (
        !isRecord(value) ||
        !Array.isArray(value.permissions) ||
        !value.permissions.every((permission) => typeof permission === 'string') ||
        !isRecord(value.defaults) ||
        !Object.values(value.defaults).every(
          (permissions) =>
            Array.isArray(permissions) &&
            permissions.every((permission) => typeof permission === 'string'),
        )
      )
        throw new InventoryApiError(
          502,
          'INVALID_PERMISSION_CATALOG',
          'Danh mục quyền không hợp lệ. / Invalid permission catalog.',
        )
      return value as { permissions: string[]; defaults: Record<string, string[]> }
    },
    async updateUserPermissions(
      id: string,
      overrides: { permission: string; granted: boolean | null }[],
    ) {
      return request(`/auth/users/${encodeURIComponent(id)}/permissions`, 'PATCH', { overrides })
    },
    async updateUser(id: string, input: { role?: string; active?: boolean }) {
      return request(`/auth/users/${encodeURIComponent(id)}`, 'PATCH', input)
    },
    async logout() {
      sessionGeneration++
      actorScope = null
      await request('/auth/session', 'DELETE')
    },
    async command(action: string, input: Record<string, unknown>) {
      if (!actorScope)
        throw new InventoryApiError(
          401,
          'SESSION_CONTEXT_REQUIRED',
          'Tải lại kho để xác minh doanh nghiệp trước khi thao tác. / Reload inventory to verify your business before making changes.',
        )
      const scope = actorScope
      const body = { action, input }
      const { key, clear } = await persistedKey(scope, body)
      if (actorScope !== scope)
        throw new InventoryApiError(
          401,
          'SESSION_CHANGED',
          'Phiên đăng nhập đã thay đổi. / The session changed.',
        )
      try {
        const data = await request('/inventory/commands', 'POST', body, key)
        assertInventorySnapshot(data)
        if (scope !== JSON.stringify([data.tenant.id, data.actor.userId]))
          throw new InventoryApiError(
            401,
            'SESSION_CHANGED',
            'Phiên đăng nhập đã thay đổi. / The session changed.',
          )
        clear()
        return data
      } catch (error) {
        if (
          error instanceof InventoryApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          ![408, 429].includes(error.status)
        )
          clear()
        throw error
      }
    },
  }
}

export const inventoryService = createInventoryService(
  import.meta.env.VITE_INVENTORY_API_BASE_URL || '',
)
