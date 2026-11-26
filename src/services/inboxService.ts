import { createDemoData } from '../data/demo'
import { channelDemoConversation, demoConnections } from '../data/channelDemo'
import { CHANNELS } from '../lib/inbox'
import { assertConnections, isChannelConnection } from '../lib/connections'
import type {
  Attachment,
  ChannelSyncResult,
  Conversation,
  ConversationPatch,
  Customer,
  CustomerPatch,
  CustomerInput,
  InboxData,
  InboxService,
  SendMessageInput,
} from '../types/inbox'
import { notifyAuthenticationExpired } from './authSession'

export const DEMO_STORAGE_KEY = 'smartsales.inbox.demo.v1'
const clone = <T>(value: T): T => structuredClone(value)
const statuses = ['open', 'pending', 'resolved', 'closed']
const priorities = ['low', 'normal', 'high', 'urgent']
const channels: string[] = CHANNELS.map((channel) => channel.id)
const attachmentTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]
type DemoStorage = Pick<Storage, 'getItem' | 'setItem'>

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const textFields = (value: Record<string, unknown>, fields: string[]) =>
  fields.every((key) => typeof value[key] === 'string')
const dateString = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
const nullableId = (value: unknown) =>
  value === null || (typeof value === 'string' && value.length > 0)
const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length
const safeLink = (value: string) => /^https?:\/\//i.test(value)

function isAttachment(value: unknown): value is Attachment {
  if (
    !record(value) ||
    !textFields(value, ['id', 'name', 'type']) ||
    !value.id ||
    !value.name ||
    typeof value.size !== 'number' ||
    !Number.isInteger(value.size) ||
    value.size < 0 ||
    value.size > 1024 * 1024
  )
    return false
  const seedImage = value.type === 'image/svg+xml' && value.url === '/demo-delivery.svg'
  if (!seedImage && !attachmentTypes.includes(value.type as string)) return false
  if (value.url === undefined) return true
  if (typeof value.url !== 'string') return false
  return (
    seedImage ||
    safeLink(value.url) ||
    new RegExp(`^data:${value.type};base64,[A-Za-z0-9+/]*={0,2}$`).test(value.url)
  )
}

function isCustomer(value: unknown): value is Customer {
  return (
    record(value) &&
    textFields(value, [
      'id',
      'name',
      'phone',
      'email',
      'company',
      'membership',
      'location',
      'avatarColor',
    ]) &&
    Boolean(value.id) &&
    Boolean(value.name) &&
    ['Standard', 'Silver', 'Gold', 'Platinum'].includes(value.membership as string)
  )
}

function validateCustomerInput(input: CustomerInput) {
  const clean = { ...input }
  if (
    Object.keys(clean).some(
      (key) => !['name', 'phone', 'email', 'company', 'membership', 'location'].includes(key),
    )
  )
    throw new Error('Trường thông tin khách hàng không được hỗ trợ.')
  for (const key of ['name', 'phone', 'email', 'company', 'location'] as const) {
    if (typeof clean[key] !== 'string' || clean[key].length > 200)
      throw new Error('Thông tin khách hàng không hợp lệ hoặc quá dài.')
    clean[key] = clean[key].trim()
  }
  if (clean.name.length < 2) throw new Error('Họ tên phải có ít nhất 2 ký tự.')
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))
    throw new Error('Địa chỉ email không hợp lệ.')
  if (
    clean.phone &&
    (!/^\+?[\d\s().-]{8,24}$/.test(clean.phone) || clean.phone.replace(/\D/g, '').length < 8)
  )
    throw new Error('Số điện thoại không hợp lệ.')
  if (!['Standard', 'Silver', 'Gold', 'Platinum'].includes(clean.membership))
    throw new Error('Hạng thành viên không hợp lệ.')
  return clean
}

function isConversation(value: unknown): value is Conversation {
  return (
    record(value) &&
    textFields(value, ['id', 'customerId', 'subject']) &&
    Boolean(value.id) &&
    Boolean(value.customerId) &&
    channels.includes(value.channel as string) &&
    statuses.includes(value.status as string) &&
    priorities.includes(value.priority as string) &&
    nullableId(value.assigneeId) &&
    nullableId(value.teamId) &&
    typeof value.unread === 'number' &&
    Number.isInteger(value.unread) &&
    value.unread >= 0 &&
    dateString(value.lastMessageAt) &&
    dateString(value.dueAt) &&
    (value.sourceUrl === null ||
      (typeof value.sourceUrl === 'string' && safeLink(value.sourceUrl))) &&
    (value.connectionId === undefined ||
      (typeof value.connectionId === 'string' && Boolean(value.connectionId))) &&
    (value.externalId === undefined ||
      (typeof value.externalId === 'string' && Boolean(value.externalId))) &&
    typeof value.mentioned === 'boolean' &&
    typeof value.bot === 'boolean' &&
    Array.isArray(value.tags) &&
    value.tags.length <= 10 &&
    value.tags.every(
      (tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 40,
    ) &&
    Array.isArray(value.messages) &&
    value.messages.every(
      (message) =>
        record(message) &&
        textFields(message, ['id', 'text']) &&
        Boolean(message.id) &&
        ['incoming', 'outgoing', 'note'].includes(message.type as string) &&
        ['sent', 'delivered', 'read'].includes(message.delivery as string) &&
        dateString(message.sentAt) &&
        (message.authorName === undefined || typeof message.authorName === 'string') &&
        (message.attachments === undefined ||
          (Array.isArray(message.attachments) &&
            message.attachments.length <= 4 &&
            message.attachments.every(isAttachment))),
    ) &&
    uniqueIds(value.messages)
  )
}

function assertSnapshot(
  value: unknown,
  source: 'demo' | 'api' = 'demo',
): asserts value is InboxData {
  const invalid = () =>
    new Error(
      source === 'demo'
        ? 'Dữ liệu Demo đã lưu không hợp lệ. Hãy đặt lại dữ liệu Demo để tiếp tục.'
        : 'API trả về dữ liệu Inbox không đúng cấu trúc. Vui lòng kiểm tra backend.',
    )
  if (
    !record(value) ||
    !Array.isArray(value.customers) ||
    !value.customers.every(isCustomer) ||
    !uniqueIds(value.customers) ||
    !Array.isArray(value.agents) ||
    !value.agents.every(
      (agent) =>
        record(agent) &&
        textFields(agent, ['id', 'name', 'initials', 'color']) &&
        Boolean(agent.id),
    ) ||
    !uniqueIds(value.agents) ||
    !Array.isArray(value.teams) ||
    !value.teams.every(
      (team) => record(team) && textFields(team, ['id', 'name']) && Boolean(team.id),
    ) ||
    !uniqueIds(value.teams) ||
    !Array.isArray(value.conversations) ||
    !value.conversations.every(isConversation) ||
    !uniqueIds(value.conversations)
  )
    throw invalid()
  if (value.connections !== undefined) assertConnections(value.connections, source === 'demo')
  const { customers, agents, teams, conversations } = value as unknown as InboxData
  if (
    conversations.some(
      (conversation) =>
        !customers.some((customer) => customer.id === conversation.customerId) ||
        (conversation.connectionId !== undefined &&
          Array.isArray(value.connections) &&
          !value.connections.some(
            (connection: { id: string }) => connection.id === conversation.connectionId,
          )) ||
        (conversation.assigneeId !== null &&
          !agents.some((agent) => agent.id === conversation.assigneeId)) ||
        (conversation.teamId !== null && !teams.some((team) => team.id === conversation.teamId)),
    )
  )
    throw invalid()
}

function validateAttachments(attachments: Attachment[] = []) {
  if (!Array.isArray(attachments) || attachments.length > 4)
    throw new Error('Mỗi tin nhắn chỉ được đính kèm tối đa 4 tệp.')
  for (const attachment of attachments) {
    if (!isAttachment(attachment))
      throw new Error('Chọn ảnh PNG/JPEG/WebP/GIF, PDF hoặc TXT hợp lệ; mỗi tệp tối đa 1 MB.')
    if (attachment.url && safeLink(attachment.url)) {
      throw new Error('Demo chỉ lưu tệp được chọn tại trình duyệt, không tải tệp từ URL bên ngoài.')
    }
  }
}

export function createDemoInboxService(
  options: { storage?: DemoStorage; now?: () => Date } = {},
): InboxService {
  let data: InboxData | undefined
  let sequence = 0
  const isTestEnv = import.meta.env.MODE === 'test' || import.meta.env.VITEST === true
  const activeStorageKey = isTestEnv ? DEMO_STORAGE_KEY : 'smartsales.inbox.demo.tiktok.v4'
  const now = options.now ?? (() => new Date())
  const getData = () => {
    if (data) return data
    let stored: string | null = null
    try {
      stored = options.storage?.getItem(activeStorageKey) ?? null
    } catch {
      throw new Error('Không thể đọc dữ liệu Demo trong trình duyệt. Kiểm tra quyền lưu trữ.')
    }
    if (stored) {
      let parsed: unknown
      try {
        parsed = JSON.parse(stored)
      } catch {
        throw new Error('Dữ liệu Demo đã lưu bị lỗi. Hãy đặt lại dữ liệu Demo để tiếp tục.')
      }
      assertSnapshot(parsed)
      data = clone(parsed)
    } else data = createDemoData()
    return data
  }
  const commit = (next: InboxData) => {
    try {
      options.storage?.setItem(activeStorageKey, JSON.stringify(next))
    } catch {
      throw new Error(
        'Không thể lưu thay đổi Demo. Bộ nhớ trình duyệt có thể đã đầy; hãy bỏ bớt tệp đính kèm.',
      )
    }
    data = next
  }
  const findConversation = (next: InboxData, id: string) => {
    const conversation = next.conversations.find((item) => item.id === id)
    if (!conversation) throw new Error('Không tìm thấy hội thoại.')
    return conversation
  }
  return {
    async load() {
      return clone(getData())
    },
    async listConnections() {
      const saved = getData().connections ?? []
      return clone(
        demoConnections().map(
          (connection) => saved.find((item) => item.id === connection.id) ?? connection,
        ),
      )
    },
    async syncConnection(connectionId, requestId) {
      if (!requestId.trim()) throw new Error('Thiếu mã yêu cầu đồng bộ. / Missing sync request ID.')
      const next = clone(getData())
      const connection = (next.connections ?? demoConnections()).find(
        (item) => item.id === connectionId,
      )
      if (!connection || connection.status !== 'demo')
        throw new Error('Không tìm thấy kết nối Demo. / Demo connection not found.')
      const sentAt = now().toISOString()
      const sample = channelDemoConversation(connection.channel, sentAt)
      const existing = next.conversations.find((item) => item.id === sample.id)
      const importedMessages = existing ? 0 : sample.messages.length
      if (!existing) next.conversations.push(sample)
      const updated = { ...connection, lastSyncedAt: sentAt }
      next.connections = demoConnections().map((item) =>
        item.id === connectionId
          ? updated
          : (next.connections?.find((saved) => saved.id === item.id) ?? item),
      )
      assertSnapshot(next)
      commit(next)
      return clone({ connection: updated, inbox: next, importedMessages })
    },
    async beginChannelConnection() {
      throw new Error(
        'Chuyển sang Live Mode để liên kết tài khoản thật. / Use Live Mode to connect an account.',
      )
    },
    async createCustomer(input) {
      const next = clone(getData())
      const clean = validateCustomerInput(input)
      const normalizedPhone = (phone: string) => phone.replace(/\D/g, '').replace(/^84/, '0')
      if (
        next.customers.some(
          (customer) =>
            (clean.email && customer.email.toLowerCase() === clean.email.toLowerCase()) ||
            (clean.phone && normalizedPhone(customer.phone) === normalizedPhone(clean.phone)),
        )
      ) {
        throw new Error('Khách hàng có email hoặc số điện thoại này đã tồn tại.')
      }
      const highest = Math.max(
        0,
        ...next.customers.map((customer) =>
          /^CUS-\d+$/.test(customer.id) ? Number(customer.id.slice(4)) : 0,
        ),
      )
      const customer: Customer = {
        ...clean,
        id: `CUS-${String(highest + 1).padStart(3, '0')}`,
        avatarColor: '#e3ddf0',
      }
      next.customers.push(customer)
      commit(next)
      return clone(customer)
    },
    async updateConversation(id, patch: ConversationPatch) {
      const next = clone(getData())
      const conversation = findConversation(next, id)
      const allowed = ['status', 'priority', 'assigneeId', 'teamId', 'unread', 'tags', 'dueAt']
      if (Object.keys(patch).some((key) => !allowed.includes(key)))
        throw new Error('Trường hội thoại không được hỗ trợ.')
      if (patch.status !== undefined && !statuses.includes(patch.status))
        throw new Error('Trạng thái hội thoại không hợp lệ.')
      if (patch.priority !== undefined && !priorities.includes(patch.priority))
        throw new Error('Mức ưu tiên không hợp lệ.')
      if (
        patch.assigneeId !== undefined &&
        patch.assigneeId !== null &&
        !next.agents.some((agent) => agent.id === patch.assigneeId)
      )
        throw new Error('Nhân viên được chọn không tồn tại.')
      if (
        patch.teamId !== undefined &&
        patch.teamId !== null &&
        !next.teams.some((team) => team.id === patch.teamId)
      )
        throw new Error('Nhóm được chọn không tồn tại.')
      if (patch.unread !== undefined && (!Number.isInteger(patch.unread) || patch.unread < 0))
        throw new Error('Số tin chưa đọc không hợp lệ.')
      if (patch.dueAt !== undefined && !Number.isFinite(Date.parse(patch.dueAt)))
        throw new Error('Thời hạn xử lý không hợp lệ.')
      if (patch.tags !== undefined) {
        if (
          !Array.isArray(patch.tags) ||
          patch.tags.length > 10 ||
          patch.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40)
        )
          throw new Error('Tối đa 10 nhãn, mỗi nhãn từ 1 đến 40 ký tự.')
        patch = { ...patch, tags: [...new Set(patch.tags.map((tag) => tag.trim()))] }
      }
      Object.assign(conversation, patch)
      commit(next)
      return clone(conversation)
    },
    async updateCustomer(id, patch: CustomerPatch) {
      const next = clone(getData())
      const customer = next.customers.find((item) => item.id === id)
      if (!customer) throw new Error('Không tìm thấy khách hàng.')
      if (
        Object.keys(patch).some(
          (key) => !['name', 'phone', 'email', 'company', 'membership', 'location'].includes(key),
        )
      )
        throw new Error('Trường thông tin khách hàng không được hỗ trợ.')
      const { id: customerId, avatarColor, ...currentInput } = customer
      const updated: Customer = {
        ...validateCustomerInput({ ...currentInput, ...patch }),
        id: customerId,
        avatarColor,
      }
      const normalizedPhone = (phone: string) => phone.replace(/\D/g, '').replace(/^84/, '0')
      if (
        next.customers.some(
          (item) =>
            item.id !== id &&
            ((updated.email && item.email.toLowerCase() === updated.email.toLowerCase()) ||
              (updated.phone && normalizedPhone(item.phone) === normalizedPhone(updated.phone))),
        )
      )
        throw new Error('Khách hàng có email hoặc số điện thoại này đã tồn tại.')
      Object.assign(customer, updated)
      commit(next)
      return clone(customer)
    },
    async sendMessage(id, input: SendMessageInput) {
      const next = clone(getData())
      const conversation = findConversation(next, id)
      if (!['outgoing', 'note'].includes(input.type)) throw new Error('Loại tin nhắn không hợp lệ.')
      if (conversation.status === 'closed' && input.type === 'outgoing')
        throw new Error('Hãy mở lại hội thoại trước khi gửi tin nhắn.')
      if (typeof input.text !== 'string') throw new Error('Nội dung tin nhắn không hợp lệ.')
      const text = input.text.trim()
      if (!text && !input.attachments?.length)
        throw new Error('Nhập nội dung hoặc đính kèm tệp trước khi gửi.')
      if (text.length > 10000)
        throw new Error('Nội dung tin nhắn không được vượt quá 10.000 ký tự.')
      validateAttachments(input.attachments)
      const sentAt = now().toISOString()
      const messageId = `message-${Date.parse(sentAt)}-${conversation.messages.length}-${++sequence}`
      conversation.messages.push({
        id: messageId,
        type: input.type,
        text,
        sentAt,
        delivery: 'sent',
        authorName: 'Linh Nguyen',
        ...(input.attachments?.length ? { attachments: clone(input.attachments) } : {}),
      })
      conversation.lastMessageAt = sentAt
      conversation.unread = 0
      if (input.type === 'outgoing' && conversation.status === 'resolved')
        conversation.status = 'open'
      commit(next)
      return clone(conversation)
    },
    async resetConversations() {
      const current = getData()
      const seed = createDemoData()
      const seedIds = new Set(seed.conversations.map((conversation) => conversation.id))
      const next = {
        ...clone(current),
        conversations: [
          ...seed.conversations,
          ...clone(current.conversations.filter((conversation) => !seedIds.has(conversation.id))),
        ],
      }
      assertSnapshot(next)
      commit(next)
      return clone(next)
    },
    async reset() {
      const next = createDemoData()
      commit(next)
      return clone(next)
    },
  }
}

export function createApiInboxService(baseUrl: string): InboxService {
  const validUrl = (() => {
    try {
      return ['http:', 'https:'].includes(new URL(baseUrl).protocol)
    } catch {
      return false
    }
  })()
  let references: { customers: Set<string>; agents: Set<string>; teams: Set<string> } | undefined
  const validateConversation = (result: unknown, id: string): Conversation => {
    if (
      !isConversation(result) ||
      result.id !== id ||
      (references &&
        (!references.customers.has(result.customerId) ||
          (result.assigneeId !== null && !references.agents.has(result.assigneeId)) ||
          (result.teamId !== null && !references.teams.has(result.teamId))))
    ) {
      throw new Error('API trả về hội thoại không hợp lệ. Hãy tải lại dữ liệu để đồng bộ.')
    }
    return result
  }
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!validUrl) throw new Error('Live Mode cần VITE_API_BASE_URL hợp lệ. Chưa kết nối backend.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      if (!response.ok) {
        if (response.status === 401) notifyAuthenticationExpired()
        let message = `API trả về lỗi ${response.status}. Thay đổi chưa được lưu.`
        try {
          const result: unknown = await response.json()
          if (record(result) && record(result.error) && typeof result.error.message === 'string') {
            const apiMessage = result.error.message.trim()
            if (apiMessage) message = apiMessage
          }
        } catch {
          // Keep the explicit HTTP status when the server does not return JSON.
        }
        throw new Error(message)
      }
      let result: unknown
      try {
        result = await response.json()
      } catch {
        throw new Error('API trả về JSON không hợp lệ. Vui lòng kiểm tra backend.')
      }
      return result as T
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
        throw new Error('Không thể kết nối API. Kiểm tra backend và thử lại.')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  return {
    async load() {
      const result = await request<unknown>('/inbox')
      assertSnapshot(result, 'api')
      references = {
        customers: new Set(result.customers.map((item) => item.id)),
        agents: new Set(result.agents.map((item) => item.id)),
        teams: new Set(result.teams.map((item) => item.id)),
      }
      return result
    },
    async listConnections() {
      const result = await request<unknown>('/integrations/channels')
      assertConnections(result)
      return result
    },
    async syncConnection(id, requestId) {
      const result = await request<ChannelSyncResult>(
        `/integrations/channels/${encodeURIComponent(id)}/sync`,
        'POST',
        { requestId },
      )
      if (
        !record(result) ||
        !isChannelConnection(result.connection) ||
        result.connection.id !== id ||
        !Number.isSafeInteger(result.importedMessages) ||
        result.importedMessages < 0
      )
        throw new Error('Kết quả đồng bộ không hợp lệ. / Invalid sync response.')
      assertSnapshot(result.inbox, 'api')
      references = {
        customers: new Set(result.inbox.customers.map((item) => item.id)),
        agents: new Set(result.inbox.agents.map((item) => item.id)),
        teams: new Set(result.inbox.teams.map((item) => item.id)),
      }
      return result
    },
    async beginChannelConnection(channel) {
      if (!channels.includes(channel)) throw new Error('Kênh không hợp lệ. / Invalid channel.')
      const result = await request<unknown>(`/integrations/channels/${channel}/authorize`, 'POST')
      if (record(result) && typeof result.authorizationUrl === 'string') {
        try {
          const url = new URL(result.authorizationUrl)
          if (url.protocol === 'https:' && !url.username && !url.password) return url.href
        } catch {
          /* Rejected below. */
        }
      }
      throw new Error('Liên kết xác thực không hợp lệ. / Invalid authorization URL.')
    },
    async createCustomer(input) {
      const result = await request<unknown>('/customers', 'POST', input)
      if (!isCustomer(result) || references?.customers.has(result.id))
        throw new Error('API trả về khách hàng không hợp lệ. Hãy tải lại dữ liệu để đồng bộ.')
      references?.customers.add(result.id)
      return result
    },
    async updateConversation(id, patch) {
      const result = await request<unknown>(
        `/conversations/${encodeURIComponent(id)}`,
        'PATCH',
        patch,
      )
      return validateConversation(result, id)
    },
    async updateCustomer(id, patch) {
      const result = await request<unknown>(`/customers/${encodeURIComponent(id)}`, 'PATCH', patch)
      if (!isCustomer(result) || result.id !== id)
        throw new Error('API trả về khách hàng không hợp lệ. Hãy tải lại dữ liệu để đồng bộ.')
      return result
    },
    async sendMessage(id, input) {
      const result = await request<unknown>(
        `/conversations/${encodeURIComponent(id)}/messages`,
        'POST',
        input,
      )
      return validateConversation(result, id)
    },
    async resetConversations() {
      throw new Error('Không cho phép đặt lại dữ liệu trong Live Mode.')
    },
    async reset() {
      throw new Error('Không cho phép đặt lại dữ liệu trong Live Mode.')
    },
  }
}

const configuredMode =
  import.meta.env.MODE === 'test' ||
  import.meta.env.MODE === 'demo' ||
  import.meta.env.VITEST === true
    ? 'demo'
    : import.meta.env.VITE_APP_MODE || 'demo'
export const APP_MODE: 'demo' | 'live' = configuredMode === 'live' ? 'live' : 'demo'
let storage: DemoStorage | undefined
try {
  if (typeof window !== 'undefined') storage = window.localStorage
} catch {
  storage = {
    getItem() {
      throw new Error('Browser storage unavailable')
    },
    setItem() {
      throw new Error('Browser storage unavailable')
    },
  }
}
const unsupportedMode: InboxService = {
  async listConnections() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async syncConnection() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async beginChannelConnection() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async load() {
    throw new Error('VITE_APP_MODE phải là demo hoặc live.')
  },
  async updateConversation() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async createCustomer() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async updateCustomer() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async sendMessage() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async resetConversations() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
  async reset() {
    throw new Error('Chế độ ứng dụng không hợp lệ.')
  },
}
export const inboxService: InboxService = !['demo', 'live'].includes(configuredMode)
  ? unsupportedMode
  : APP_MODE === 'live'
    ? createApiInboxService(
        import.meta.env.VITE_API_BASE_URL ||
          (typeof window === 'undefined' ? '' : `${window.location.origin}/api/v1`),
      )
    : createDemoInboxService({ storage })
