import { CHANNELS } from './inbox'
import type { ChannelConnection } from '../types/inbox'

export function isChannelConnection(value: unknown, allowDemo = false): value is ChannelConnection {
  if (!value || typeof value !== 'object') return false
  const item = value as ChannelConnection
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    CHANNELS.some((channel) => channel.id === item.channel) &&
    typeof item.accountName === 'string' &&
    item.accountName.length > 0 &&
    typeof item.detail === 'string' &&
    [
      'connected',
      'disconnected',
      'expired',
      'error',
      'unavailable',
      ...(allowDemo ? ['demo'] : []),
    ].includes(item.status) &&
    (item.lastSyncedAt === null ||
      (typeof item.lastSyncedAt === 'string' && Number.isFinite(Date.parse(item.lastSyncedAt))))
  )
}

export function assertConnections(
  value: unknown,
  allowDemo = false,
): asserts value is ChannelConnection[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => isChannelConnection(item, allowDemo)) ||
    new Set(value.map((item) => item.id)).size !== value.length
  ) {
    throw new Error('Dữ liệu kết nối kênh không hợp lệ. / Invalid channel connections.')
  }
}
