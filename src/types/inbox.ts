export type Channel =
  | 'shopee'
  | 'lazada'
  | 'tiktok'
  | 'zalo'
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'telegram'
  | 'livechat'
  | 'email'
export interface ChannelConnection {
  id: string
  channel: Channel
  accountName: string
  status: 'demo' | 'connected' | 'disconnected' | 'expired' | 'error' | 'unavailable'
  lastSyncedAt: string | null
  detail: string
}
export interface ChannelSyncResult {
  connection: ChannelConnection
  inbox: InboxData
  importedMessages: number
}
export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'closed'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type InboxView =
  'mine' | 'all' | 'unassigned' | 'mentions' | 'bots' | 'teams' | 'views' | 'archive'
export interface Agent {
  id: string
  name: string
  initials: string
  color: string
}
export interface Team {
  id: string
  name: string
}
export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  company: string
  membership: 'Standard' | 'Silver' | 'Gold' | 'Platinum'
  location: string
  avatarColor: string
}
export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  url?: string
}
export interface Message {
  id: string
  type: 'incoming' | 'outgoing' | 'note'
  text: string
  sentAt: string
  delivery: 'sent' | 'delivered' | 'read'
  authorName?: string
  attachments?: Attachment[]
}
export interface Conversation {
  id: string
  customerId: string
  channel: Channel
  status: ConversationStatus
  priority: Priority
  assigneeId: string | null
  teamId: string | null
  subject: string
  unread: number
  lastMessageAt: string
  dueAt: string
  sourceUrl: string | null
  connectionId?: string
  externalId?: string
  category?: string
  shopId?: string
  tags: string[]
  mentioned: boolean
  bot: boolean
  messages: Message[]
}
export interface InboxData {
  customers: Customer[]
  conversations: Conversation[]
  agents: Agent[]
  teams: Team[]
  connections?: ChannelConnection[]
}
export type ConversationPatch = Partial<
  Pick<Conversation, 'status' | 'priority' | 'assigneeId' | 'teamId' | 'unread' | 'tags' | 'dueAt'>
>
export type CustomerPatch = Partial<Omit<Customer, 'id' | 'avatarColor'>>
export type CustomerInput = Omit<Customer, 'id' | 'avatarColor'>
export interface SendMessageInput {
  text: string
  type: 'outgoing' | 'note'
  attachments?: Attachment[]
}
export interface InboxService {
  load(): Promise<InboxData>
  listConnections(): Promise<ChannelConnection[]>
  syncConnection(id: string, requestId: string): Promise<ChannelSyncResult>
  beginChannelConnection(channel: Channel): Promise<string>
  createCustomer(input: CustomerInput): Promise<Customer>
  updateConversation(id: string, patch: ConversationPatch): Promise<Conversation>
  updateCustomer(id: string, patch: CustomerPatch): Promise<Customer>
  sendMessage(id: string, input: SendMessageInput): Promise<Conversation>
  resetConversations(): Promise<InboxData>
  reset(): Promise<InboxData>
}
