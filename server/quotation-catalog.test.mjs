import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.mjs'
import { createInventoryServer, hashToken } from './http.mjs'
import { createInventory } from './inventory.mjs'
import { createQuotationCatalog } from './quotation-catalog.mjs'

const origin = 'http://127.0.0.1:5173'
const timestamp = '2026-11-18T00:00:00.000Z'
const tokens = {
  owner: 'catalog-test-owner-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  viewer: 'catalog-test-viewer-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  other: 'catalog-test-other-cccccccccccccccccccccccccccccccc',
}

describe('Authenticated inventory quotation catalog', () => {
  let db
  let server
  let baseUrl
  let inventory
  let warehouseId
  let secondWarehouseId
  let inactiveWarehouseId
  let otherWarehouseId
  let pricedId
  let unknownId
  let freeId
  let inactiveSkuId
  const actor = { tenantId: 'tenant-a', userId: 'owner-a', role: 'owner' }
  const command = (action, input) => inventory.command(actor, action, input, randomUUID())
  const request = async (query = '', token = tokens.owner) => {
    const response = await fetch(`${baseUrl}/inventory/quotation-catalog${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    return { response, body: await response.json() }
  }

  beforeEach(async () => {
    db = openDatabase()
    for (const id of ['tenant-a', 'tenant-b'])
      db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(id, id, timestamp)
    for (const [id, tenantId, role, token] of [
      ['owner-a', 'tenant-a', 'owner', tokens.owner],
      ['viewer-a', 'tenant-a', 'viewer', tokens.viewer],
      ['owner-b', 'tenant-b', 'owner', tokens.other],
    ]) {
      db.prepare('INSERT INTO users(id,tenant_id,name,role) VALUES(?,?,?,?)').run(
        id,
        tenantId,
        id,
        role,
      )
      db.prepare('INSERT INTO access_tokens VALUES(?,?,?,?,?)').run(
        hashToken(token),
        id,
        tenantId,
        '2099-01-01T00:00:00.000Z',
        timestamp,
      )
    }
    inventory = createInventory(db)
    warehouseId = command('warehouse.create', { code: 'MAIN', name: 'Kho chính' }).result.id
    secondWarehouseId = command('warehouse.create', { code: 'SECOND', name: 'Kho phụ' }).result.id
    inactiveWarehouseId = command('warehouse.create', {
      code: 'CLOSED',
      name: 'Kho ngừng hoạt động',
      active: false,
    }).result.id
    otherWarehouseId = inventory.command(
      { tenantId: 'tenant-b', userId: 'owner-b', role: 'owner' },
      'warehouse.create',
      { code: 'OTHER', name: 'Kho doanh nghiệp khác' },
      randomUUID(),
    ).result.id
    pricedId = command('sku.create', {
      sku: 'DEVICE-01',
      name: 'Thiết bị thông minh',
      price: 250000,
      warrantyMonths: 24,
      metadata: {
        imageUrl: '/products/mug.svg',
        description: 'Mô tả công khai',
        sourceUrl: 'https://manufacturer.example/device',
        specifications: [{ label: 'Kết nối', value: 'Zigbee' }],
        supplierSecret: 'private-supplier-terms',
        internalMargin: 35,
      },
    }).result.id
    unknownId = command('sku.create', { sku: 'UNKNOWN', name: 'Chưa có giá bán' }).result.id
    freeId = command('sku.create', { sku: 'FREE', name: 'Quà tặng', price: 0 }).result.id
    inactiveSkuId = command('sku.create', {
      sku: 'ARCHIVED',
      name: 'Sản phẩm đã ngừng bán',
      price: 100,
      active: false,
    }).result.id
    // Seed projections for this read contract, including retained historical stock
    // in an inactive warehouse. Such stock must never be advertised as available.
    for (const [warehouse, quantity, reserved, damaged, warranty] of [
      [warehouseId, 10, 2, 1, 1],
      [secondWarehouseId, 5, 0, 0, 0],
      [inactiveWarehouseId, 8, 0, 0, 0],
    ]) {
      const location = db.prepare('SELECT id FROM locations WHERE warehouse_id=?').get(warehouse).id
      db.prepare(
        `INSERT INTO balances(tenant_id,warehouse_id,location_id,sku_id,on_hand,reserved,damaged,warranty,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        'tenant-a',
        warehouse,
        location,
        pricedId,
        quantity,
        reserved,
        damaged,
        warranty,
        timestamp,
      )
    }
    server = createInventoryServer({
      db,
      inventory,
      allowedOrigins: [origin],
      now: () => new Date(timestamp),
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

  it('requires a valid session and reads the same tenant through the browser cookie', async () => {
    expect((await request('', '')).response.status).toBe(401)
    expect(
      (await request('', 'unknown-access-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa')).response.status,
    ).toBe(401)
    const login = await fetch(`${baseUrl}/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ token: tokens.owner }),
    })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const response = await fetch(`${baseUrl}/inventory/quotation-catalog`, {
      headers: { Cookie: cookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).tenant.id).toBe('tenant-a')
  })

  it('allows viewers to read only active products and warehouses in their tenant', async () => {
    const { response, body } = await request('', tokens.viewer)
    expect(response.status).toBe(200)
    expect(body.actor).toEqual({ userId: 'viewer-a', role: 'viewer' })
    expect(body.products.map((item) => item.id)).toEqual(
      expect.arrayContaining([pricedId, unknownId, freeId]),
    )
    expect(body.products.some((item) => item.id === inactiveSkuId)).toBe(false)
    expect(body.warehouses.map((item) => item.id).sort()).toEqual(
      [warehouseId, secondWarehouseId].sort(),
    )
    const other = await request('', tokens.other)
    expect(other.body.tenant.id).toBe('tenant-b')
    expect(other.body.products).toEqual([])
    expect(other.body.warehouses.map((item) => item.id)).toEqual([otherWarehouseId])
  })

  it('returns available stock after reservations and quality holds, scoped to the selected warehouse', async () => {
    const all = await request()
    expect(all.body.warehouseId).toBeNull()
    expect(all.body.products.find((item) => item.id === pricedId).stock).toBe(11)
    expect(all.body.products.find((item) => item.id === unknownId).stock).toBe(0)
    const main = await request(`?warehouseId=${warehouseId}`)
    expect(main.body.warehouseId).toBe(warehouseId)
    expect(main.body.products.find((item) => item.id === pricedId).stock).toBe(6)
    const second = await request(`?warehouseId=${secondWarehouseId}`)
    expect(second.body.products.find((item) => item.id === pricedId).stock).toBe(5)
  })

  it('keeps unknown prices distinct from explicit zero and preserves the distinction on updates', async () => {
    let products = (await request()).body.products
    expect(products.find((item) => item.id === unknownId).price).toBeNull()
    expect(products.find((item) => item.id === freeId).price).toBe(0)
    expect(products.find((item) => item.id === pricedId).price).toBe(250000)
    command('sku.update', { id: freeId, name: 'Quà tặng đổi tên' })
    command('sku.update', { id: unknownId, price: 0 })
    command('sku.update', { id: pricedId, price: null })
    products = (await request()).body.products
    expect(products.find((item) => item.id === freeId).price).toBe(0)
    expect(products.find((item) => item.id === unknownId).price).toBe(0)
    expect(products.find((item) => item.id === pricedId).price).toBeNull()
  })

  it('exposes approved product presentation without private metadata or costs and never mutates stock', async () => {
    const balances = db.prepare('SELECT * FROM balances ORDER BY warehouse_id').all()
    const auditCount = db.prepare('SELECT COUNT(*) AS count FROM audit_events').get().count
    const { body } = await request()
    expect(body.products.find((item) => item.id === pricedId)).toMatchObject({
      warrantyMonths: 24,
      imageUrl: '/products/mug.svg',
      description: 'Mô tả công khai',
      specifications: [{ label: 'Kết nối', value: 'Zigbee' }],
      sourceUrl: 'https://manufacturer.example/device',
    })
    expect(JSON.stringify(body)).not.toContain('private-supplier-terms')
    expect(JSON.stringify(body)).not.toContain('internalMargin')
    expect(
      body.products.every(
        (item) => !Object.hasOwn(item, 'cost') && !Object.hasOwn(item, 'metadata'),
      ),
    ).toBe(true)
    expect(db.prepare('SELECT * FROM balances ORDER BY warehouse_id').all()).toEqual(balances)
    expect(db.prepare('SELECT COUNT(*) AS count FROM audit_events').get().count).toBe(auditCount)
    expect(db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count).toBe(0)
  })

  it('omits malformed or unsafe presentation fields stored in arbitrary legacy metadata', async () => {
    command('sku.update', {
      id: pricedId,
      metadata: {
        imageUrl: '//untrusted.example/image.jpg',
        sourceUrl: 'javascript:alert(1)',
        description: '\u0001Invalid control character',
        specifications: [{ label: 'Public label', value: 'Public value', secret: 'private' }],
      },
    })
    const product = (await request()).body.products.find((item) => item.id === pricedId)
    for (const key of ['imageUrl', 'sourceUrl', 'description', 'specifications'])
      expect(Object.hasOwn(product, key)).toBe(false)
    command('sku.update', {
      id: pricedId,
      imageUrl: '/products/tea.svg',
      description: 'Thông tin đã kiểm tra',
      sourceUrl: 'https://manufacturer.example/specification',
      specifications: [{ label: 'Nguồn điện', value: '220 V' }],
    })
    expect((await request()).body.products.find((item) => item.id === pricedId)).toMatchObject({
      imageUrl: '/products/tea.svg',
      description: 'Thông tin đã kiểm tra',
      sourceUrl: 'https://manufacturer.example/specification',
      specifications: [{ label: 'Nguồn điện', value: '220 V' }],
    })
  })

  it.each([
    '?tenantId=tenant-b',
    '?role=owner',
    '?warehouseId=',
    '?warehouseId=one&warehouseId=two',
  ])('rejects invalid or client-supplied authority filters: %s', async (query) => {
    const result = await request(query)
    expect(result.response.status).toBe(400)
    expect(result.body.error.code).toBe('INVALID_FILTER')
  })

  it('denies foreign, inactive and missing warehouses, disabled inventory and inactive users', async () => {
    for (const id of [otherWarehouseId, inactiveWarehouseId, 'missing-warehouse']) {
      const result = await request(`?warehouseId=${id}`)
      expect(result.response.status).toBe(404)
      expect(result.body.error.code).toBe('NOT_FOUND')
    }
    command('config.update', { config: { inventoryEnabled: false } })
    expect((await request()).body.error.code).toBe('MODULE_DISABLED')
    expect((await request('', tokens.viewer)).response.status).toBe(403)
    db.prepare('UPDATE users SET active=0 WHERE id=?').run('owner-a')
    expect((await request()).response.status).toBe(401)
  })

  it('rechecks actor scope and role in the catalog service', () => {
    const catalog = createQuotationCatalog(db)
    expect(() => catalog.load(null)).toThrow(expect.objectContaining({ status: 401 }))
    expect(() => catalog.load({ ...actor, tenantId: 'tenant-b' })).toThrow(
      expect.objectContaining({ status: 403 }),
    )
    expect(() => catalog.load({ ...actor, role: 'viewer' })).toThrow(
      expect.objectContaining({ status: 403 }),
    )
    expect(catalog.load(actor).products).toHaveLength(3)
  })
})
