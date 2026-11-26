import { CHANNELS } from '../lib/inbox'
import type { Channel, ChannelConnection, Conversation } from '../types/inbox'

export const demoConnections = (): ChannelConnection[] =>
  CHANNELS.map((channel) => ({
    id: `demo-${channel.id}`,
    channel: channel.id,
    accountName: `Mây Home · ${channel.label}`,
    status: 'demo',
    lastSyncedAt: null,
    detail: 'Dữ liệu mẫu trong trình duyệt. Chưa liên kết tài khoản thật.',
  }))

export function channelDemoConversation(channel: Channel, sentAt: string): Conversation {
  const id = `conv-demo-${channel}`
  const label = CHANNELS.find((item) => item.id === channel)!.label
  return {
    id,
    customerId: 'CUS-002',
    channel,
    connectionId: `demo-${channel}`,
    externalId: `sample-thread-${channel}`,
    status: 'open',
    priority: 'high',
    assigneeId: 'agent-linh',
    teamId: 'team-sales',
    subject: `Đặt cốc gốm và nến thơm qua ${label}`,
    unread: 1,
    lastMessageAt: sentAt,
    dueAt: sentAt,
    sourceUrl: null,
    tags: ['Nhu cầu mua hàng', 'Demo'],
    mentioned: false,
    bot: false,
    messages: [
      {
        id: `${id}-purchase-v1`,
        type: 'incoming',
        sentAt,
        delivery: 'delivered',
        text: 'Chốt giúp mình 2 cốc gốm màu kem và 1 nến thơm Santal nhé. SĐT: 0912345678. Địa chỉ: 12 Cầu Giấy, Hà Nội. Thanh toán COD.',
      },
    ],
  }
}
