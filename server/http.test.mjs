import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { request as httpRequest } from 'node:http'
import { openDatabase } from './database.mjs'
import { createInventoryServer, hashToken } from './http.mjs'
import { createInventory } from './inventory.mjs'
import { createIntegrationSettings } from './integration-settings.mjs'

const origin = 'http://127.0.0.1:5173'
const timestamp = '2026-11-17T05:00:00.000Z'
const tokens = {
  owner: 'test-only-owner-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  viewer: 'test-only-viewer-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  other: 'test-only-other-token-cccccccccccccccccccccccccccccccc',
  expired: 'test-only-expired-token-dddddddddddddddddddddddddddddd',
  inactive: 'test-only-inactive-token-eeeeeeeeeeeeeeeeeeeeeeeeeeee',
}

describe('Inventory HTTP API with migrated database', () => {
  let db
  let inventory
  let server
  let baseUrl
  let telegramFetch
  let integrationSettingsService

  beforeEach(async () => {
    db = openDatabase()
    for (const [id, name] of [
      ['tenant-a', 'Doanh nghiệp A'],
      ['tenant-b', 'Doanh nghiệp B'],
    ])
      db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(id, name, timestamp)
    const actors = [
      ['owner-a', 'tenant-a', 'owner', 1, tokens.owner, '2099-01-01T00:00:00.000Z'],
      ['viewer-a', 'tenant-a', 'viewer', 1, tokens.viewer, '2099-01-01T00:00:00.000Z'],
      ['owner-b', 'tenant-b', 'owner', 1, tokens.other, '2099-01-01T00:00:00.000Z'],
      ['expired-a', 'tenant-a', 'staff', 1, tokens.expired, '2026-11-16T00:00:00.000Z'],
      ['inactive-a', 'tenant-a', 'owner', 0, tokens.inactive, '2099-01-01T00:00:00.000Z'],
    ]
    for (const [id, tenantId, role, active, token, expiresAt] of actors) {
      db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,?)').run(
        id,
        tenantId,
        id,
        role,
        active,
      )
      db.prepare(
        'INSERT INTO access_tokens(token_hash,user_id,tenant_id,expires_at,created_at) VALUES(?,?,?,?,?)',
      ).run(hashToken(token), id, tenantId, expiresAt, timestamp)
    }
    inventory = createInventory(db)
    integrationSettingsService = createIntegrationSettings(db, {
      encryptionKey: Buffer.alloc(32, 7).toString('base64'),
      defaults: {
        gemini: { apiKey: '', model: 'gemini-3.8-flash' },
        telegram: { botToken: '' },
      },
      fetchImpl: async (url) => {
        const target = String(url)
        if (target.includes('telegram.org'))
          return Response.json({
            ok: true,
            result: { id: 123, is_bot: true, username: 'SettingsBot' },
          })
        return Response.json({ models: [] })
      },
    })
    telegramFetch = async () => {
      throw new Error('Unexpected Telegram API request')
    }
    server = createInventoryServer({
      db,
      inventory,
      allowedOrigins: [origin],
      secureCookies: true,
      now: () => new Date(timestamp),
      telegramToken: 'test-only-telegram-token',
      telegramFetch: (...args) => telegramFetch(...args),
      integrationSettingsService,
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
  })

  afterEach(async () => {
    if (server) {
      const closed = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
      server.closeAllConnections()
      await closed
    }
    db?.close()
  })

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, options)
    return { response, body: await response.json() }
  }
  const authorize = (token = tokens.owner) => ({ Authorization: `Bearer ${token}` })
  const command = (action, input, key, token = tokens.owner) =>
    request('/inventory/commands', {
      method: 'POST',
      headers: { ...authorize(token), 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ action, input }),
    })
  const login = (token = tokens.owner) =>
    request('/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ token }),
    })

  it('exposes a no-store health response without authentication', async () => {
    const { response, body } = await request('/health')
    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'ok', module: 'inventory', apiVersion: 'v1' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('limits market research status and history to authenticated administrators', async () => {
    const unauthenticated = await request('/market-intelligence/status')
    expect(unauthenticated.response.status).toBe(401)

    const status = await request('/market-intelligence/status', { headers: authorize() })
    expect(status.response.status).toBe(200)
    expect(status.body).toMatchObject({
      provider: { name: 'Google Gemini', model: 'gemini-3.8-flash' },
    })
    expect(status.body).not.toHaveProperty('providers.search')
    expect(JSON.stringify(status.body)).not.toContain('API_KEY')

    const forbidden = await request('/market-intelligence/runs', {
      headers: authorize(tokens.viewer),
    })
    expect(forbidden.response.status).toBe(403)

    const history = await request('/market-intelligence/runs', { headers: authorize() })
    expect(history.response.status).toBe(200)
    expect(history.body).toEqual({ runs: [] })
  })

  it('serves tenant-scoped accounting ledgers only to users with explicit accounting access', async () => {
    const unauthenticated = await request('/accounting/accounts')
    expect(unauthenticated.response.status).toBe(401)

    const forbidden = await request('/accounting/accounts', { headers: authorize(tokens.viewer) })
    expect(forbidden.response.status).toBe(403)

    const accounts = await request('/accounting/accounts', { headers: authorize() })
    expect(accounts.response.status).toBe(200)
    expect(accounts.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'A-CASH' })]),
    )

    const posted = await request('/accounting/journals', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        entryDate: '2026-11-17',
        memo: 'Ghi nhận doanh thu thử nghiệm',
        sourceType: 'sale',
        sourceReference: 'SO-100',
        lines: [
          { accountCode: 'A-CASH', debit: 10000, credit: 0 },
          { accountCode: 'R-SALES', debit: 0, credit: 10000 },
        ],
      }),
    })
    expect(posted.response.status).toBe(201)

    const trialBalance = await request('/accounting/trial-balance?from=2026-11-01&to=2026-11-30', {
      headers: authorize(),
    })
    expect(trialBalance.response.status).toBe(200)
    expect(trialBalance.body.totals).toMatchObject({ periodDebit: 10000, periodCredit: 10000 })

    const duplicatedFilter = await request('/accounting/journals?limit=10&limit=20', {
      headers: authorize(),
    })
    expect(duplicatedFilter.response.status).toBe(400)
    const tenantB = await request('/accounting/journals', { headers: authorize(tokens.other) })
    expect(tenantB.response.status).toBe(200)
    expect(tenantB.body.entries).toEqual([])
  })

  it('tests, saves, and disconnects encrypted integration credentials for administrators only', async () => {
    const unauthenticated = await request('/integrations/settings')
    expect(unauthenticated.response.status).toBe(401)

    const forbidden = await request('/integrations/settings', { headers: authorize(tokens.viewer) })
    expect(forbidden.response.status).toBe(403)

    const initial = await request('/integrations/settings', { headers: authorize() })
    expect(initial.response.status).toBe(200)
    expect(initial.body.providers.gemini.configured).toBe(false)
    expect(initial.body.canSaveCredentials).toBe(true)

    const credentials = { apiKey: 'gemini-secret-key-value', model: 'gemini-3.8-flash' }
    const tested = await request('/integrations/settings/gemini/test', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    expect(tested.response.status).toBe(200)
    expect(tested.body).toEqual({
      provider: 'gemini',
      accountName: 'Google Gemini',
      tested: true,
    })
    expect(JSON.stringify(tested.body)).not.toContain(credentials.apiKey)
    expect(db.prepare('SELECT COUNT(*) AS count FROM integration_credentials').get().count).toBe(0)

    const saved = await request('/integrations/settings/gemini', {
      method: 'PUT',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    expect(saved.response.status).toBe(200)
    expect(saved.body.status.providers.gemini).toMatchObject({
      configured: true,
      source: 'workspace',
    })
    expect(
      JSON.stringify(
        db.prepare('SELECT ciphertext,nonce,auth_tag FROM integration_credentials').get(),
      ),
    ).not.toContain(credentials.apiKey)

    const removed = await request('/integrations/settings/gemini', {
      method: 'DELETE',
      headers: authorize(),
    })
    expect(removed.response.status).toBe(200)
    expect(removed.body.providers.gemini).toMatchObject({
      configured: false,
      source: 'server',
    })
  })

  it('uses the saved workspace Telegram token for account authorization', async () => {
    const token = '123456789:abcdefghijklmnopqrstuvwxyz_123456'
    const saved = await request('/integrations/settings/telegram', {
      method: 'PUT',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: token }),
    })
    expect(saved.response.status).toBe(200)
    expect(JSON.stringify(saved.body)).not.toContain(token)

    const calls = []
    telegramFetch = async (url) => {
      calls.push(String(url))
      return Response.json({
        ok: true,
        result: { id: 123, username: 'SettingsBot' },
      })
    }
    const connection = await request('/integrations/channels/telegram/authorize', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(connection.response.status).toBe(200)
    expect(connection.body.authorizationUrl).toBe('https://t.me/SettingsBot')
    expect(calls[0]).toContain(`bot${token}/getMe`)
  })

  it('serves tenant-scoped Inbox and operations data from SQLite without demo seeds', async () => {
    const unauthenticated = await request('/inbox')
    expect(unauthenticated.response.status).toBe(401)

    const emptyInbox = await request('/inbox', { headers: authorize() })
    expect(emptyInbox.response.status).toBe(200)
    expect(emptyInbox.body.customers).toEqual([])
    expect(emptyInbox.body.conversations).toEqual([])
    expect(emptyInbox.body.connections).toEqual([])

    const created = await request('/customers', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'SQLite Customer',
        phone: '0903456789',
        email: 'sqlite@example.com',
        company: '',
        membership: 'Standard',
        location: 'Hanoi',
      }),
    })

    expect(created.response.status).toBe(201)
    expect(created.body.name).toBe('SQLite Customer')

    const operations = await request('/operations', { headers: authorize() })
    expect(operations.response.status).toBe(200)
    expect(operations.body.customerProfiles).toEqual([
      expect.objectContaining({ customerId: created.body.id, status: 'lead', notes: [] }),
    ])
    expect(operations.body.products).toEqual([])

    const otherTenant = await request('/inbox', {
      headers: authorize(tokens.other),
    })
    expect(otherTenant.body.customers).toEqual([])
    expect((await request('/integrations/channels', { headers: authorize() })).body).toEqual([])
  })

  it('connects Telegram from a server secret and imports private messages idempotently per tenant', async () => {
    const calls = []
    const responses = [
      { ok: true, result: { id: 12345, username: 'SmartSalesDemoBot' } },
      {
        ok: true,
        result: [
          {
            update_id: 501,
            message: {
              message_id: 17,
              date: 1794891600,
              chat: { id: 98765, type: 'private' },
              from: { id: 98765, first_name: 'Demo', last_name: 'Customer', username: 'demo_user' },
              text: 'Xin chào, tôi cần tư vấn sản phẩm.',
            },
          },
          {
            update_id: 502,
            message: {
              message_id: 18,
              date: 1794891601,
              chat: { id: -1001, type: 'group' },
              from: { id: 98765, first_name: 'Demo' },
              text: 'Tin nhóm không nhập',
            },
          },
        ],
      },
      {
        ok: true,
        result: [
          {
            update_id: 501,
            message: {
              message_id: 17,
              date: 1794891600,
              chat: { id: 98765, type: 'private' },
              from: { id: 98765, first_name: 'Demo', last_name: 'Customer', username: 'demo_user' },
              text: 'Xin chào, tôi cần tư vấn sản phẩm.',
            },
          },
        ],
      },
    ]
    telegramFetch = async (url, options) => {
      calls.push({ url, options: JSON.parse(options.body) })
      return { ok: true, json: async () => responses.shift() }
    }

    const connected = await request('/integrations/channels/telegram/authorize', {
      method: 'POST',
      headers: authorize(),
    })
    expect(connected.response.status).toBe(200)
    expect(connected.body.authorizationUrl).toBe('https://t.me/SmartSalesDemoBot')
    expect(JSON.stringify(connected.body)).not.toContain('test-only-telegram-token')
    const [connection] = await request('/integrations/channels', { headers: authorize() }).then(
      ({ body }) => body,
    )

    const firstSync = await request(`/integrations/channels/${connection.id}/sync`, {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'telegram-sync-first' }),
    })
    expect(firstSync.response.status).toBe(200)
    expect(firstSync.body.importedMessages).toBe(1)
    expect(firstSync.body.inbox.customers).toEqual([
      expect.objectContaining({ name: 'Demo Customer' }),
    ])
    expect(firstSync.body.inbox.conversations[0].messages).toEqual([
      expect.objectContaining({ text: 'Xin chào, tôi cần tư vấn sản phẩm.', type: 'incoming' }),
    ])

    const retry = await request(`/integrations/channels/${connection.id}/sync`, {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'telegram-sync-retry' }),
    })
    expect(retry.response.status).toBe(200)
    expect(retry.body.importedMessages).toBe(0)
    expect(retry.body.inbox.conversations[0].messages).toHaveLength(1)
    expect(calls.map((call) => call.options.offset)).toEqual([undefined, 0, 503])

    const otherTenant = await request(`/integrations/channels/${connection.id}/sync`, {
      method: 'POST',
      headers: { ...authorize(tokens.other), 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'telegram-cross-tenant' }),
    })
    expect(otherTenant.response.status).toBe(404)
  })

  it('sends Telegram text replies and stores them only after provider confirmation', async () => {
    const calls = []
    const responses = [
      { ok: true, result: { id: 12345, username: 'SmartSalesDemoBot' } },
      {
        ok: true,
        result: [
          {
            update_id: 601,
            message: {
              message_id: 21,
              date: 1794891600,
              chat: { id: 98765, type: 'private' },
              from: { id: 98765, first_name: 'Demo', last_name: 'Customer' },
              text: 'Xin chào shop.',
            },
          },
        ],
      },
      {
        ok: true,
        result: {
          message_id: 22,
          date: 1794891601,
          chat: { id: 98765, type: 'private' },
          text: 'Shop có thể hỗ trợ bạn.',
        },
      },
      { ok: false, result: undefined, description: 'Forbidden: bot was blocked by the user' },
    ]
    telegramFetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      const response = responses.shift()
      return {
        ok: response.ok,
        json: async () => ({
          ok: response.ok,
          result: response.result,
          description: response.description,
        }),
      }
    }

    await request('/integrations/channels/telegram/authorize', {
      method: 'POST',
      headers: authorize(),
    })
    const [connection] = await request('/integrations/channels', { headers: authorize() }).then(
      ({ body }) => body,
    )
    const synced = await request(`/integrations/channels/${connection.id}/sync`, {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'telegram-reply-seed' }),
    })
    const conversation = synced.body.inbox.conversations[0]
    const reply = await request(`/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'outgoing', text: 'Shop có thể hỗ trợ bạn.' }),
    })
    expect(reply.response.status).toBe(201)
    expect(reply.body.messages.at(-1)).toMatchObject({
      type: 'outgoing',
      text: 'Shop có thể hỗ trợ bạn.',
      delivery: 'sent',
    })
    expect(calls[2].url).toMatch(/\/sendMessage$/)
    expect(calls[2].body).toEqual({ chat_id: 98765, text: 'Shop có thể hỗ trợ bạn.' })

    const rejected = await request(`/conversations/${conversation.id}/messages`, {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'outgoing', text: 'Tin này không được Telegram nhận.' }),
    })
    expect(rejected.response.status).toBe(502)
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM messages WHERE tenant_id='tenant-a' AND type='outgoing'",
        )
        .get().total,
    ).toBe(1)
  })

  it('creates a canonical customer order through HTTP with inventory-backed products and idempotency', async () => {
    const warehouse = await command(
      'warehouse.create',
      { code: 'SALES', name: 'Sales warehouse' },
      'business-order-warehouse',
    )
    const sku = await command(
      'sku.create',
      { sku: 'ORDER-001', name: 'Priced product', cost: 100000, price: 250000 },
      'business-order-sku',
    )
    const receipt = await command(
      'document.create',
      {
        type: 'receipt',
        warehouseId: warehouse.body.result.id,
        lines: [{ skuId: sku.body.result.id, quantity: 3, unitCost: 100000 }],
      },
      'business-order-receipt',
    )
    await command('document.post', { id: receipt.body.result.id }, 'business-order-post')
    const customer = await request('/customers', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Order Customer',
        phone: '0904567890',
        email: 'order@example.com',
        company: '',
        membership: 'Standard',
        location: '12 Demo Street, Hanoi',
      }),
    })
    const input = {
      customerId: customer.body.id,
      warehouseId: warehouse.body.result.id,
      items: [{ productId: sku.body.result.id, quantity: 1 }],
      discount: 0,
      shippingFee: 20000,
      paymentMethod: 'cod',
      shippingAddress: '12 Demo Street, Hanoi',
      recipientName: 'Order Customer',
      recipientPhone: '0904567890',
      note: '',
      clientRequestId: 'http-order-idempotency-001',
    }
    const created = await request('/operations/orders', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(created.response.status).toBe(201)
    expect(created.body.orders).toHaveLength(1)
    expect(created.body.orders[0]).toMatchObject({
      customerId: customer.body.id,
      total: 270000,
      status: 'draft',
    })
    const replay = await request('/operations/orders', {
      method: 'POST',
      headers: { ...authorize(), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(replay.response.status).toBe(201)
    expect(replay.body.orders).toHaveLength(1)
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM sales_orders WHERE tenant_id=?').get('tenant-a')
        .count,
    ).toBe(1)
  })

  it('exchanges an access token for a new protected session and stores hashes only', async () => {
    const { response, body } = await login()
    expect(response.status).toBe(200)
    expect(body).toEqual({ actor: { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' } })
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).toContain('Path=/api/v1')
    expect(setCookie).toContain('Secure')
    const cookie = setCookie.split(';')[0]
    const sessionToken = cookie.slice('inventory_session='.length)
    expect(sessionToken).not.toBe(tokens.owner)
    expect(sessionToken.length).toBeGreaterThanOrEqual(32)
    const rows = db.prepare('SELECT * FROM access_tokens').all()
    expect(rows).toHaveLength(6)
    expect(rows.some((row) => row.token_hash === hashToken(sessionToken))).toBe(true)
    expect(JSON.stringify(rows)).not.toContain(sessionToken)
    expect(JSON.stringify(rows)).not.toContain(tokens.owner)
    const snapshot = await request('/inventory/snapshot', { headers: { Cookie: cookie } })
    expect(snapshot.response.status).toBe(200)
    expect(snapshot.body.tenant.id).toBe('tenant-a')
    const logout = await request('/auth/session', {
      method: 'DELETE',
      headers: { Cookie: cookie, Origin: origin },
    })
    expect(logout.response.status).toBe(200)
    expect(logout.response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(
      (await request('/inventory/snapshot', { headers: { Cookie: cookie } })).response.status,
    ).toBe(401)
    expect(
      db
        .prepare('SELECT token_hash FROM access_tokens WHERE token_hash=?')
        .get(hashToken(sessionToken)),
    ).toBeUndefined()
  })

  it.each([
    undefined,
    'too-short',
    'unknown-but-long-enough-access-token-ffffffffffff',
    tokens.expired,
    tokens.inactive,
  ])('rejects unauthenticated, invalid, expired or inactive credentials: %s', async (token) => {
    const { response, body } = await request('/inventory/snapshot', {
      headers: token ? authorize(token) : {},
    })
    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects extra login fields and bad tokens without creating a session', async () => {
    const invalid = await login('unknown-but-long-enough-access-token-ffffffffffff')
    expect(invalid.response.status).toBe(401)
    expect(invalid.response.headers.get('set-cookie')).toBeNull()
    const extra = await request('/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ token: tokens.owner, tenantId: 'tenant-b', role: 'owner' }),
    })
    expect(extra.response.status).toBe(400)
    expect(extra.body.error.code).toBe('INVALID_FIELDS')
    expect(db.prepare('SELECT COUNT(*) AS count FROM access_tokens').get().count).toBe(5)
  })

  it('denies browser mutations from an unapproved origin or without the cookie origin', async () => {
    const { response } = await login()
    const cookie = response.headers.get('set-cookie').split(';')[0]
    const attempt = (headers) =>
      request('/inventory/commands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'csrf-test-key',
          ...headers,
        },
        body: JSON.stringify({
          action: 'warehouse.create',
          input: { code: 'BAD', name: 'Forbidden' },
        }),
      })
    const missing = await attempt({ Cookie: cookie })
    expect(missing.response.status).toBe(403)
    expect(missing.body.error.code).toBe('ORIGIN_REQUIRED')
    const hostile = await attempt({ Cookie: cookie, Origin: 'https://untrusted.example' })
    expect(hostile.response.status).toBe(403)
    expect(hostile.body.error.code).toBe('ORIGIN_DENIED')
    const bearerHostile = await attempt({ ...authorize(), Origin: 'https://untrusted.example' })
    expect(bearerHostile.response.status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS count FROM warehouses').get().count).toBe(0)
  })

  it('does not allow clients to select a different tenant or supply authorization fields', async () => {
    const query = await request('/inventory/snapshot?tenantId=tenant-b', { headers: authorize() })
    expect(query.response.status).toBe(400)
    expect(query.body.error.code).toBe('INVALID_FILTER')
    for (const extra of [
      { tenantId: 'tenant-b' },
      { actor: { role: 'owner' } },
      { role: 'owner' },
    ]) {
      const result = await request('/inventory/commands', {
        method: 'POST',
        headers: {
          ...authorize(),
          'Content-Type': 'application/json',
          'Idempotency-Key': 'invalid-scope-key',
        },
        body: JSON.stringify({
          action: 'warehouse.create',
          input: { code: 'BAD', name: 'Forbidden' },
          ...extra,
        }),
      })
      expect(result.response.status).toBe(400)
      expect(result.body.error.code).toBe('INVALID_FIELDS')
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM warehouses').get().count).toBe(0)
  })

  it('isolates snapshot records and actor identity between authenticated tenants', async () => {
    db.prepare('INSERT INTO warehouses(id,tenant_id,code,name,created_at) VALUES(?,?,?,?,?)').run(
      'warehouse-a',
      'tenant-a',
      'MAIN',
      'Kho riêng A',
      timestamp,
    )
    db.prepare('INSERT INTO warehouses(id,tenant_id,code,name,created_at) VALUES(?,?,?,?,?)').run(
      'warehouse-b',
      'tenant-b',
      'MAIN',
      'Kho riêng B',
      timestamp,
    )
    const a = await request('/inventory/snapshot', { headers: authorize() })
    const b = await request('/inventory/snapshot', { headers: authorize(tokens.other) })
    expect(a.response.status).toBe(200)
    expect(b.response.status).toBe(200)
    expect(a.body.tenant.id).toBe('tenant-a')
    expect(b.body.tenant.id).toBe('tenant-b')
    expect(a.body.warehouses.map((warehouse) => warehouse.id)).toEqual(['warehouse-a'])
    expect(b.body.warehouses.map((warehouse) => warehouse.id)).toEqual(['warehouse-b'])
    expect(JSON.stringify(a.body)).not.toContain('Kho riêng B')
    expect(JSON.stringify(b.body)).not.toContain('Kho riêng A')
  })

  it('allows viewers to read but denies warehouse mutations', async () => {
    expect(
      (await request('/inventory/snapshot', { headers: authorize(tokens.viewer) })).response.status,
    ).toBe(200)
    const denied = await command(
      'warehouse.create',
      { code: 'VIEW', name: 'Viewer cannot create' },
      'viewer-attempt-key',
      tokens.viewer,
    )
    expect(denied.response.status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS count FROM warehouses').get().count).toBe(0)
  })

  it('posts a receipt once through live HTTP retries and keeps quantities, value and audit consistent', async () => {
    const warehouse = await command(
      'warehouse.create',
      { code: 'MAIN', name: 'Kho chính' },
      'receipt-warehouse',
    )
    expect(warehouse.response.status).toBe(200)
    const warehouseId = warehouse.body.result.id
    const sku = await command(
      'sku.create',
      { sku: 'HTTP-001', name: 'Sản phẩm thử HTTP', cost: 250000 },
      'receipt-sku-key',
    )
    expect(sku.response.status).toBe(200)
    const skuId = sku.body.result.id
    const input = {
      type: 'receipt',
      warehouseId,
      reference: 'PO-HTTP-001',
      lines: [{ skuId, quantity: 10, unitCost: 250000 }],
    }
    const receipt = await command('document.create', input, 'receipt-create-key')
    expect(receipt.response.status).toBe(200)
    const documentId = receipt.body.result.id
    expect(receipt.body.documents.find((document) => document.id === documentId).status).toBe(
      'draft',
    )
    expect(receipt.body.balances).toHaveLength(0)
    expect((await command('document.create', input, 'receipt-create-key')).body.result.id).toBe(
      documentId,
    )
    expect(
      (await command('document.post', { id: documentId }, 'receipt-before-approval')).response
        .status,
    ).toBe(409)
    const approved = await command('document.approve', { id: documentId }, 'receipt-approve-key')
    expect(approved.response.status).toBe(200)
    expect(approved.body.balances).toHaveLength(0)
    const posted = await Promise.all(
      Array.from({ length: 4 }, () =>
        command('document.post', { id: documentId }, 'receipt-post-key'),
      ),
    )
    for (const result of posted) {
      expect(result.response.status).toBe(200)
      expect(result.body.balances).toHaveLength(1)
      expect(result.body.balances[0]).toMatchObject({
        skuId,
        warehouseId,
        onHand: 10,
        available: 10,
        reserved: 0,
        inventoryValue: 2500000,
      })
      expect(result.body.documents.find((document) => document.id === documentId).status).toBe(
        'posted',
      )
      expect(result.body.ledger).toHaveLength(1)
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count).toBe(1)
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='document.post'").get()
        .count,
    ).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM stock_documents').get().count).toBe(1)
    expect(
      (await command('document.post', { id: documentId }, 'receipt-second-post')).response.status,
    ).toBe(409)
    const changedRequest = await command(
      'document.create',
      { ...input, reference: 'DIFFERENT' },
      'receipt-create-key',
    )
    expect(changedRequest.response.status).toBe(409)
    expect(changedRequest.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
    const foreignAction = await command(
      'document.approve',
      { id: documentId },
      'foreign-document-key',
      tokens.other,
    )
    expect(foreignAction.response.status).toBe(404)
    const other = await request('/inventory/snapshot', { headers: authorize(tokens.other) })
    expect(other.response.status).toBe(200)
    expect(other.body.documents).toHaveLength(0)
    expect(other.body.balances).toHaveLength(0)
    expect(other.body.ledger).toHaveLength(0)
    const current = await request('/inventory/snapshot', { headers: authorize() })
    expect(current.body.metrics).toMatchObject({
      onHand: 10,
      available: 10,
      inventoryValue: 2500000,
    })
  })

  it('rejects nested tenant overrides instead of accepting forged command scope', async () => {
    const result = await command(
      'warehouse.create',
      { code: 'FORGED', name: 'Kho sai tenant', tenantId: 'tenant-b' },
      'nested-tenant-key',
    )
    expect(result.response.status).toBe(422)
    expect(result.body.error.code).toBe('INVALID_INPUT')
    expect(db.prepare('SELECT COUNT(*) AS count FROM warehouses').get().count).toBe(0)
  })

  it('converts ledger pagination query values to numbers and returns non-overlapping pages', async () => {
    const warehouse = await command(
      'warehouse.create',
      { code: 'PAGE', name: 'Kho phân trang' },
      'pagination-warehouse',
    )
    const sku = await command(
      'sku.create',
      { sku: 'PAGE-001', name: 'SKU phân trang' },
      'pagination-sku',
    )
    expect(warehouse.response.status).toBe(200)
    expect(sku.response.status).toBe(200)
    for (let index = 0; index < 2; index++) {
      const receipt = await command(
        'document.create',
        {
          type: 'receipt',
          warehouseId: warehouse.body.result.id,
          lines: [{ skuId: sku.body.result.id, quantity: 1, unitCost: 10000 }],
        },
        `pagination-create-${index}`,
      )
      expect(receipt.response.status).toBe(200)
      expect(
        (
          await command(
            'document.approve',
            { id: receipt.body.result.id },
            `pagination-approve-${index}`,
          )
        ).response.status,
      ).toBe(200)
      expect(
        (await command('document.post', { id: receipt.body.result.id }, `pagination-post-${index}`))
          .response.status,
      ).toBe(200)
    }
    const first = await request('/inventory/snapshot?ledgerLimit=1', { headers: authorize() })
    expect(first.response.status).toBe(200)
    expect(first.body.pagination.ledgerLimit).toBe(1)
    expect(first.body.ledger).toHaveLength(1)
    expect(typeof first.body.pagination.nextBeforeSequence).toBe('number')
    const second = await request(
      `/inventory/snapshot?ledgerLimit=1&beforeSequence=${first.body.pagination.nextBeforeSequence}`,
      { headers: authorize() },
    )
    expect(second.response.status).toBe(200)
    expect(second.body.ledger).toHaveLength(1)
    expect(second.body.ledger[0].sequence).toBeLessThan(first.body.ledger[0].sequence)
    const end = await request(
      `/inventory/snapshot?ledgerLimit=1&beforeSequence=${second.body.ledger[0].sequence}`,
      { headers: authorize() },
    )
    expect(end.response.status).toBe(200)
    expect(end.body.ledger).toHaveLength(0)
    expect(end.body.pagination.nextBeforeSequence).toBeNull()
  })

  it.each([
    'ledgerLimit=0',
    'ledgerLimit=1001',
    'ledgerLimit=1.5',
    'ledgerLimit=invalid',
    'beforeSequence=-1',
    'beforeSequence=1e3',
    'beforeSequence=9007199254740992',
    'ledgerLimit=1&ledgerLimit=2',
  ])('rejects invalid or repeated pagination filters: %s', async (query) => {
    const result = await request(`/inventory/snapshot?${query}`, { headers: authorize() })
    expect(result.response.status).toBe(400)
    expect(result.body.error.code).toBe('INVALID_FILTER')
  })

  it('preserves Vietnamese text when a network chunk splits a UTF-8 character', async () => {
    const name = 'Kho thiết bị Việt Nam'
    const payload = Buffer.from(
      JSON.stringify({ action: 'warehouse.create', input: { code: 'UTF8', name } }),
    )
    const splitAt = payload.indexOf(Buffer.from('ệ')) + 1
    expect(splitAt).toBeGreaterThan(0)
    const result = await new Promise((resolve, reject) => {
      const incoming = httpRequest(
        `${baseUrl}/inventory/commands`,
        {
          method: 'POST',
          headers: {
            ...authorize(),
            'Content-Type': 'application/json',
            'Idempotency-Key': 'unicode-chunk-key',
          },
        },
        (response) => {
          const chunks = []
          response.on('data', (chunk) => chunks.push(chunk))
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            }),
          )
          response.on('error', reject)
        },
      )
      incoming.on('error', reject)
      incoming.write(payload.subarray(0, splitAt))
      setTimeout(() => incoming.end(payload.subarray(splitAt)), 25)
    })
    expect(result.status).toBe(200)
    expect(result.body.warehouses[0].name).toBe(name)
    expect(db.prepare("SELECT name FROM warehouses WHERE code='UTF8'").get().name).toBe(name)
  })

  it('requires a valid idempotency key before executing mutations', async () => {
    for (const key of [undefined, 'short', 'invalid key with spaces', 'a'.repeat(129)]) {
      const result = await request('/inventory/commands', {
        method: 'POST',
        headers: {
          ...authorize(),
          'Content-Type': 'application/json',
          ...(key === undefined ? {} : { 'Idempotency-Key': key }),
        },
        body: JSON.stringify({
          action: 'warehouse.create',
          input: { code: 'BAD', name: 'Missing key' },
        }),
      })
      expect(result.response.status).toBe(400)
      expect(result.body.error.code).toBe('IDEMPOTENCY_REQUIRED')
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM warehouses').get().count).toBe(0)
  })

  it.each(['{', '[]', 'null', '"plain string"'])(
    'rejects invalid or non-object JSON: %s',
    async (body) => {
      const result = await request('/inventory/commands', {
        method: 'POST',
        headers: {
          ...authorize(),
          'Content-Type': 'application/json',
          'Idempotency-Key': 'bad-json-test',
        },
        body,
      })
      expect(result.response.status).toBe(400)
      expect(result.body.error.code).toBe('INVALID_JSON')
    },
  )

  it('rejects unsupported content types and oversized payloads', async () => {
    for (const contentType of ['text/plain', 'application/jsonp', 'application/json-unsupported']) {
      const type = await request('/inventory/commands', {
        method: 'POST',
        headers: {
          ...authorize(),
          'Content-Type': contentType,
          'Idempotency-Key': 'bad-type-test',
        },
        body: '{}',
      })
      expect(type.response.status).toBe(415)
      expect(type.body.error.code).toBe('CONTENT_TYPE')
    }
    const size = await request('/inventory/commands', {
      method: 'POST',
      headers: {
        ...authorize(),
        'Content-Type': 'application/json',
        'Idempotency-Key': 'large-body-test',
      },
      body: JSON.stringify({ action: 'warehouse.create', input: { name: 'x'.repeat(270000) } }),
    })
    expect(size.response.status).toBe(413)
    expect(size.body.error.code).toBe('BODY_TOO_LARGE')
  })

  it('sanitizes unexpected server failures without exposing database or secret details', async () => {
    inventory.snapshot = () => {
      throw new Error('SQLITE_ERROR secret-token internal-file.sqlite SELECT private_data')
    }
    const { response, body } = await request('/inventory/snapshot', { headers: authorize() })
    expect(response.status).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toMatch(/SQLITE|secret-token|internal-file|SELECT|stack/)
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message'])
  })
})
