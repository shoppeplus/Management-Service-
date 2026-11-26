import { afterEach, expect, it, vi } from 'vitest'
import { createDemoData } from '../data/demo'
import { createOperationsDemoData } from '../modules/operations/data'
import { channelDemoConversation } from '../data/channelDemo'
import { analyzePurchaseDemo } from '../lib/purchase'
import { createPurchaseService } from './purchaseService'

afterEach(() => vi.unstubAllGlobals())
it('uses the server model in Live and rejects unavailable, invalid or simulated analysis without fallback', async () => {
  const conversation = channelDemoConversation('shopee', '2026-11-17T03:00:00Z')
  const products = createOperationsDemoData(createDemoData()).products
  const result = analyzePurchaseDemo(conversation, products)
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ...result, source: 'model' }) })
  vi.stubGlobal('fetch', fetch)
  const service = createPurchaseService('live', 'https://api.example.com/api')
  expect((await service.analyze(conversation, products)).source).toBe('model')
  expect(fetch).toHaveBeenCalledWith(
    'https://api.example.com/api/conversations/conv-demo-shopee/purchase-analysis',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  )
  fetch.mockResolvedValue({ ok: false, status: 503 })
  await expect(service.analyze(conversation, products)).rejects.toThrow('Chưa kết nối')
  fetch.mockResolvedValue({ ok: true, json: async () => result })
  await expect(service.analyze(conversation, products)).rejects.toThrow('AI thực')
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ...result, source: 'model', revision: 'old' }),
  })
  await expect(service.analyze(conversation, products)).rejects.toThrow('đã cũ')
})
