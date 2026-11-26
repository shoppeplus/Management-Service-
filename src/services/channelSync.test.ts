import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiInboxService, createDemoInboxService } from './inboxService'
import { createDemoData } from '../data/demo'
import { demoConnections } from '../data/channelDemo'

afterEach(() => vi.unstubAllGlobals())
describe('Channel message synchronization', () => {
  it('imports once per provider message, preserves local edits and persists account timestamps', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    const service = createDemoInboxService({ storage })
    expect((await service.listConnections()).some((item) => item.channel === 'shopee')).toBe(true)
    const first = await service.syncConnection('demo-shopee', 'r1')
    expect(first.importedMessages).toBe(1)
    const chat = first.inbox.conversations.find((item) => item.channel === 'shopee')!
    await service.sendMessage(chat.id, { type: 'note', text: 'Đã tư vấn cho khách.' })
    const second = await service.syncConnection('demo-shopee', 'r2')
    expect(second.importedMessages).toBe(0)
    expect(second.inbox.conversations.filter((item) => item.id === chat.id)).toHaveLength(1)
    expect(second.inbox.conversations.find((item) => item.id === chat.id)?.messages).toHaveLength(2)
    const reloaded = createDemoInboxService({ storage })
    expect(
      (await reloaded.listConnections()).find((item) => item.id === 'demo-shopee')?.lastSyncedAt,
    ).not.toBeNull()
    expect((await reloaded.load()).conversations.find((item) => item.id === chat.id)).toMatchObject(
      { connectionId: 'demo-shopee', externalId: 'sample-thread-shopee' },
    )
  })
  it('does not report imported data if browser persistence fails', async () => {
    const service = createDemoInboxService({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('full')
        },
      },
    })
    await expect(service.syncConnection('demo-zalo', 'r1')).rejects.toThrow('Không thể lưu')
    expect((await service.load()).conversations.some((item) => item.channel === 'zalo')).toBe(false)
  })
  it('uses authenticated backend synchronization and validates the matching account', async () => {
    const connection = { ...demoConnections()[0], status: 'connected' }
    const inbox = createDemoData()
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connection, inbox, importedMessages: 4 }),
    })
    vi.stubGlobal('fetch', fetch)
    const service = createApiInboxService('https://api.example.com/api')
    expect((await service.syncConnection(connection.id, 'retry-key')).importedMessages).toBe(4)
    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.com/api/integrations/channels/${connection.id}/sync`,
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({ requestId: 'retry-key' }),
      }),
    )
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        connection: { ...connection, id: 'wrong' },
        inbox,
        importedMessages: 4,
      }),
    })
    await expect(service.syncConnection(connection.id, 'retry-key')).rejects.toThrow('không hợp lệ')
  })
  it('keeps backend failures explicit and rejects unsafe authorization redirects or Demo Live data', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetch)
    const service = createApiInboxService('https://api.example.com/api')
    await expect(service.listConnections()).rejects.toThrow('503')
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: 'TELEGRAM_NOT_CONFIGURED',
          message: 'Máy chủ chưa cấu hình TELEGRAM_BOT_TOKEN.',
        },
      }),
    })
    await expect(service.beginChannelConnection('telegram')).rejects.toThrow(
      'Máy chủ chưa cấu hình TELEGRAM_BOT_TOKEN.',
    )
    fetch.mockResolvedValue({ ok: true, json: async () => demoConnections() })
    await expect(service.listConnections()).rejects.toThrow('không hợp lệ')
    for (const authorizationUrl of [
      'javascript:alert(1)',
      'http://example.com',
      'https://user:pass@example.com',
    ]) {
      fetch.mockResolvedValue({ ok: true, json: async () => ({ authorizationUrl }) })
      await expect(service.beginChannelConnection('shopee')).rejects.toThrow('không hợp lệ')
    }
  })
})
