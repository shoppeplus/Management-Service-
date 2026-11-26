import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIKTOK_SHOPS,
  generateTikTokSignature,
  getTikTokShopsForUser,
  listPublicTikTokShops,
  resolveTikTokShop,
  routeTikTokWebhookEvent,
  verifyTikTokWebhookSignature,
} from './tiktokShops'
import {
  PRODUCT_CATEGORY_TREE,
  filterCategoryTree,
  formatVndInteger,
  matchesCategoryFilter,
} from './productCategories'
import { filterConversations } from './inbox'
import type { Conversation, InboxData } from '../types/inbox'

function createSampleConversation(id: string, patch: Partial<Conversation> = {}): Conversation {
  return {
    id,
    customerId: 'CUS-001',
    channel: 'tiktok',
    status: 'open',
    priority: 'normal',
    assigneeId: 'agent-linh',
    teamId: 'team-sales',
    subject: 'Tư vấn Serum Vitamin C dưỡng trắng',
    unread: 1,
    lastMessageAt: '2026-11-17T10:00:00.000Z',
    dueAt: '2026-11-17T12:00:00.000Z',
    sourceUrl: null,
    tags: ['Mỹ phẩm'],
    mentioned: false,
    bot: false,
    messages: [
      {
        id: `msg-${id}`,
        type: 'incoming',
        text: 'Da nhạy cảm dùng serum vitamin C có hợp không shop?',
        sentAt: '2026-11-17T10:00:00.000Z',
        delivery: 'read',
      },
    ],
    ...patch,
  }
}

describe('TikTok multi-shop management & webhook verification (Task 2)', () => {
  it('resolves multiple TikTok Shop accounts by shopId', () => {
    expect(resolveTikTokShop(DEFAULT_TIKTOK_SHOPS, 'tiktok-shop-01')?.accountName).toContain(
      'TikTok Shop 01',
    )
    expect(resolveTikTokShop(DEFAULT_TIKTOK_SHOPS, 'tiktok-shop-02')?.accountName).toContain(
      'TikTok Shop 02',
    )
    expect(resolveTikTokShop(DEFAULT_TIKTOK_SHOPS, 'tiktok-shop-unknown')).toBeNull()
  })

  it('lists TikTok accounts without exposing appSecret or accessToken', () => {
    const publicShops = listPublicTikTokShops(DEFAULT_TIKTOK_SHOPS)
    expect(publicShops).toHaveLength(3)
    expect(JSON.stringify(publicShops)).not.toContain('tt-demo-secret')
    expect(JSON.stringify(publicShops)).not.toContain('tt-demo-token')
  })

  it('filters TikTok shops according to F0 / F1 / F2 account scope', () => {
    const f0Shops = getTikTokShopsForUser(DEFAULT_TIKTOK_SHOPS, {
      roleTier: 'F0',
      allowedShopIds: ['tiktok-shop-01'],
    })
    expect(f0Shops).toHaveLength(3)

    const f2Shops = getTikTokShopsForUser(DEFAULT_TIKTOK_SHOPS, {
      roleTier: 'F2',
      allowedShopIds: ['tiktok-shop-02'],
    })
    expect(f2Shops).toHaveLength(1)
    expect(f2Shops[0].shopId).toBe('tiktok-shop-02')
  })

  it('generates account-specific HMAC-SHA256 signatures and verifies webhooks', () => {
    const rawBody = '{"type":"ORDER_STATUS_CHANGE","shop_id":"tiktok-shop-01"}'
    const params = { app_key: 'tt-demo-key-01', timestamp: '1700000000' }
    const signature = generateTikTokSignature(
      'tt-demo-secret-01',
      '/api/webhooks/tiktok',
      params,
      rawBody,
    )
    expect(signature).toMatch(/^[a-f0-9]{64}$/)

    expect(
      verifyTikTokWebhookSignature({
        shops: DEFAULT_TIKTOK_SHOPS,
        shopId: 'tiktok-shop-01',
        params,
        rawBody,
        signature,
      }),
    ).toBe(true)

    expect(
      verifyTikTokWebhookSignature({
        shops: DEFAULT_TIKTOK_SHOPS,
        shopId: 'tiktok-shop-02',
        params,
        rawBody,
        signature,
      }),
    ).toBe(false)
  })

  it('rejects webhook payloads from unconfigured TikTok Shops', () => {
    const rejected = routeTikTokWebhookEvent(DEFAULT_TIKTOK_SHOPS, {
      type: 'ORDER_STATUS_CHANGE',
      shop_id: 'tiktok-shop-unknown',
    })
    expect(rejected.accepted).toBe(false)
    expect(rejected.reason).toBe('UNCONFIGURED_SHOP')

    const accepted = routeTikTokWebhookEvent(DEFAULT_TIKTOK_SHOPS, {
      type: 'ORDER_STATUS_CHANGE',
      shop_id: 'tiktok-shop-01',
    })
    expect(accepted.accepted).toBe(true)
    expect(accepted.shopId).toBe('tiktok-shop-01')
  })
})

describe('Product category tree & Inbox conversation filtering (Task 1)', () => {
  it('maintains hierarchical categories with attached integer-VND products', () => {
    expect(PRODUCT_CATEGORY_TREE.length).toBeGreaterThanOrEqual(5)
    for (const node of PRODUCT_CATEGORY_TREE) {
      expect(node.children.length).toBeGreaterThan(0)
      expect(node.products.length).toBeGreaterThan(0)
      for (const product of node.products) {
        expect(Number.isSafeInteger(product.priceVnd)).toBe(true)
        expect(Number.isSafeInteger(product.stock)).toBe(true)
      }
    }
    expect(formatVndInteger(4590000)).toContain('4.590.000')
  })

  it('filters category tree by search keyword and allowedCategories scope', () => {
    const scoped = filterCategoryTree(PRODUCT_CATEGORY_TREE, '', ['Điện tử'])
    expect(scoped).toHaveLength(1)
    expect(scoped[0].name).toBe('Điện tử')

    const searched = filterCategoryTree(PRODUCT_CATEGORY_TREE, 'Serum Vitamin C')
    expect(searched).toHaveLength(1)
    expect(searched[0].name).toBe('Mỹ phẩm')
  })

  it('filters conversations by product category and TikTok shopId', () => {
    const conv1 = createSampleConversation('conv-1', {
      category: 'Mỹ phẩm',
      shopId: 'tiktok-shop-01',
    })
    const conv2 = createSampleConversation('conv-2', {
      subject: 'Tư vấn Camera An Ninh AI 4K',
      category: 'Điện tử',
      shopId: 'tiktok-shop-02',
    })
    const inboxData: InboxData = {
      customers: [
        {
          id: 'CUS-001',
          name: 'Mai Anh Nguyen',
          phone: '+84 903 456 789',
          email: 'maianh@example.com',
          company: 'Mây Studio',
          membership: 'Gold',
          location: 'TP.HCM',
          avatarColor: '#eadad2',
        },
      ],
      conversations: [conv1, conv2],
      agents: [],
      teams: [],
    }

    expect(matchesCategoryFilter(conv1, 'Mỹ phẩm')).toBe(true)
    expect(matchesCategoryFilter(conv1, 'Chăm sóc da (Skincare)')).toBe(true)
    expect(matchesCategoryFilter(conv1, 'Điện tử')).toBe(false)

    const byCategory = filterConversations(inboxData, {
      search: '',
      status: 'all',
      channel: 'all',
      assignee: 'all',
      view: 'all',
      category: 'Điện tử',
    })
    expect(byCategory.map((c) => c.id)).toEqual(['conv-2'])

    const byShop = filterConversations(inboxData, {
      search: '',
      status: 'all',
      channel: 'tiktok',
      assignee: 'all',
      view: 'all',
      shopId: 'tiktok-shop-01',
    })
    expect(byShop.map((c) => c.id)).toEqual(['conv-1'])
  })
})
