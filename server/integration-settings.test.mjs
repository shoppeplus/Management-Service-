import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from './database.mjs'
import { createIntegrationSettings } from './integration-settings.mjs'

const timestamp = '2026-11-18T12:00:00.000Z'
const encryptionKey = Buffer.alloc(32, 7).toString('base64')
const owner = { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' }
const staff = { userId: 'staff-a', tenantId: 'tenant-a', role: 'staff' }
const defaults = {
  gemini: { apiKey: '', model: 'gemini-3.8-flash' },
  telegram: { botToken: '' },
}

describe('integration settings', () => {
  let db
  let fetchImpl
  let service

  beforeEach(() => {
    db = openDatabase()
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
      'tenant-a',
      'Tenant A',
      timestamp,
    )
    db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
      'owner-a',
      'tenant-a',
      'Owner A',
      'owner',
    )
    db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
      'staff-a',
      'tenant-a',
      'Staff A',
      'staff',
    )
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
      'tenant-b',
      'Tenant B',
      timestamp,
    )
    db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
      'owner-b',
      'tenant-b',
      'Owner B',
      'owner',
    )
    fetchImpl = vi.fn(async (url) => {
      const target = String(url)
      if (target.includes('telegram.org'))
        return Response.json({ ok: true, result: { id: 123, is_bot: true, username: 'StoreBot' } })
      if (target.includes('shopeemobile.com'))
        return Response.json({ response: { shop_name: 'Smart Store Shopee' } })
      if (target.includes('lazada.vn'))
        return Response.json({ code: '0', data: { name: 'Smart Store Lazada' } })
      if (target.includes('tiktokglobalshop.com'))
        return Response.json({
          code: 0,
          data: { shops: [{ shop_name: 'Smart Store TikTok' }] },
        })
      return Response.json({ models: [] })
    })
    service = createIntegrationSettings(db, {
      encryptionKey,
      fetchImpl,
      defaults,
      now: () => new Date(timestamp),
    })
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('tests and stores provider credentials encrypted and scoped to the workspace', async () => {
    const gemini = await service.save(owner, 'gemini', {
      apiKey: 'gemini-secret-key-value',
      model: 'gemini-3.8-flash',
    })
    const telegram = await service.save(owner, 'telegram', {
      botToken: '123456789:abcdefghijklmnopqrstuvwxyz_123456',
    })

    expect(gemini.accountName).toBe('Google Gemini')
    expect(telegram.accountName).toBe('@StoreBot')
    expect(gemini.status.providers.gemini).toMatchObject({
      configured: true,
      source: 'workspace',
      model: 'gemini-3.8-flash',
    })
    expect(service.credentialsFor(owner, 'gemini').apiKey).toBe('gemini-secret-key-value')
    expect(service.credentialsFor(owner, 'telegram').botToken).toBe(
      '123456789:abcdefghijklmnopqrstuvwxyz_123456',
    )

    const stored = db
      .prepare('SELECT ciphertext,nonce,auth_tag FROM integration_credentials ORDER BY provider')
      .all()
    expect(stored).toHaveLength(2)
    expect(JSON.stringify(stored)).not.toContain('secret-key-value')
    expect(
      JSON.stringify({
        status: service.status(owner),
        gemini,
        telegram,
      }),
    ).not.toMatch(/secret-key-value|abcdefghijklmnopqrstuvwxyz/)
    expect(
      service.status({ ...owner, tenantId: 'tenant-b', userId: 'owner-b' }).providers,
    ).toMatchObject({
      gemini: { configured: false },
      telegram: { configured: false },
    })
  })

  it('allows checking credentials without persisting them and supports disconnecting saved overrides', async () => {
    await expect(service.test(owner, 'serpapi', { apiKey: 'serp-secret-key-value' })).rejects
      .toMatchObject({ code: 'INTEGRATION_NOT_FOUND' })
    const result = await service.test(owner, 'telegram', {
      botToken: '123456789:abcdefghijklmnopqrstuvwxyz_123456',
    })
    expect(result).toEqual({ provider: 'telegram', accountName: '@StoreBot', tested: true })
    expect(db.prepare('SELECT COUNT(*) AS count FROM integration_credentials').get().count).toBe(0)

    expect(service.status(owner).providers).not.toHaveProperty('serpapi')
  })

  it('updates the saved Gemini model without exposing or replacing its API key', async () => {
    await service.save(owner, 'gemini', {
      apiKey: 'gemini-secret-key-value',
      model: 'gemini-2.5-flash',
    })

    const updated = await service.save(owner, 'gemini', {
      apiKey: '',
      model: 'gemini-3.8-flash',
    })

    expect(updated.status.providers.gemini.model).toBe('gemini-3.8-flash')
    expect(service.credentialsFor(owner, 'gemini')).toEqual({
      apiKey: 'gemini-secret-key-value',
      model: 'gemini-3.8-flash',
    })
    expect(JSON.stringify(updated)).not.toContain('gemini-secret-key-value')
  })

  it('tests and stores credentials for Shopee, Lazada, and TikTok Shop', async () => {
    const shopee = await service.save(owner, 'shopee', {
      partnerId: '12345',
      partnerKey: 'shopee-partner-secret',
      shopId: '67890',
      accessToken: 'shopee-access-token-secret',
      refreshToken: 'shopee-refresh-token-secret',
    })
    const lazada = await service.save(owner, 'lazada', {
      appKey: '23456',
      appSecret: 'lazada-app-secret-value',
      accessToken: 'lazada-access-token-secret',
      refreshToken: 'lazada-refresh-token-secret',
      region: 'vn',
    })
    const tiktok = await service.save(owner, 'tiktokshop', {
      appKey: '34567',
      appSecret: 'tiktok-app-secret-value',
      accessToken: 'tiktok-access-token-secret',
      shopCipher: 'tiktok-shop-cipher-value',
    })

    expect(shopee.accountName).toBe('Smart Store Shopee')
    expect(lazada.accountName).toBe('Smart Store Lazada')
    expect(tiktok.accountName).toBe('Smart Store TikTok')
    expect(service.status(owner).providers).toMatchObject({
      shopee: { configured: true, source: 'workspace', accountName: 'Smart Store Shopee' },
      lazada: { configured: true, source: 'workspace', accountName: 'Smart Store Lazada' },
      tiktokshop: { configured: true, source: 'workspace', accountName: 'Smart Store TikTok' },
    })
    expect(JSON.stringify(service.status(owner))).not.toMatch(
      /shopee-partner-secret|lazada-app-secret-value|tiktok-app-secret-value/,
    )
    expect(
      JSON.stringify(
        db
          .prepare('SELECT ciphertext,nonce,auth_tag,account_name FROM integration_credentials')
          .all(),
      ),
    ).not.toMatch(
      /shopee-partner-secret|shopee-access-token-secret|lazada-app-secret-value|tiktok-app-secret-value/,
    )
    const urls = fetchImpl.mock.calls.map(([url]) => new URL(String(url)))
    const shopeeUrl = urls.find((url) => url.hostname === 'partner.shopeemobile.com')
    expect(shopeeUrl?.pathname).toBe('/api/v2/shop/get_shop_info')
    expect(shopeeUrl?.searchParams.get('timestamp')).toBe('1795003200')
    expect(shopeeUrl?.searchParams.get('sign')).toBe(
      'fa7ddceaa7e982d433cc8f4186ccac40a1fc1b9bf3ae592d755ff2ced66e4488',
    )

    const lazadaUrl = urls.find((url) => url.hostname === 'api.lazada.vn')
    expect(lazadaUrl?.pathname).toBe('/rest/seller/get')
    expect(lazadaUrl?.searchParams.get('sign')).toBe(
      '9EC71C0C94176C1E548FA563129DD255B23CFAA5644B1C4916811E3DD677CC1E',
    )

    const tiktokCall = fetchImpl.mock.calls.find(
      ([url]) => new URL(String(url)).hostname === 'open-api.tiktokglobalshop.com',
    )
    const tiktokUrl = new URL(String(tiktokCall?.[0]))
    expect(tiktokUrl.pathname).toBe('/authorization/202309/shops')
    expect(tiktokUrl.searchParams.get('sign')).toBe(
      '656ece0732bec98976875b57e6bc802feb344f97541997607e25e0370302706a',
    )
    expect(tiktokCall?.[1].headers['x-tts-access-token']).toBe('tiktok-access-token-secret')
  })

  it('rejects unauthorized users, unknown providers, and unsafe credential shapes', async () => {
    expect(() => service.status(staff)).toThrowError(/owner\/admin/)
    await expect(
      service.test(staff, 'gemini', { apiKey: 'gemini-secret-key-value' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      service.test(owner, 'unknown', { apiKey: 'gemini-secret-key-value' }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_NOT_FOUND' })
    await expect(service.test(owner, 'gemini', { apiKey: 'short' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIAL',
    })
    await expect(
      service.test(owner, 'telegram', { botToken: 'not-a-bot-token' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
  })

  it('requires an encryption key before saving and never performs a provider request without it', async () => {
    const withoutKey = createIntegrationSettings(db, { encryptionKey: '', fetchImpl, defaults })
    await expect(
      withoutKey.save(owner, 'gemini', { apiKey: 'gemini-secret-key-value' }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_STORAGE_NOT_CONFIGURED' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(withoutKey.status(owner).canSaveCredentials).toBe(false)
  })
})
