import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createInventoryService } from './service'

const snapshot = () => ({
  tenant: { id: 'tenant-a', name: 'A', config: {} },
  actor: { userId: 'user-a', role: 'owner' },
  permissions: [],
  warehouses: [],
  locations: [],
  suppliers: [],
  skus: [],
  balances: [],
  documents: [],
  purchaseRequests: [],
  purchaseOrders: [],
  salesOrders: [],
  ledger: [],
  reservations: [],
  counts: [],
  serials: [],
  warranties: [],
  auditEvents: [],
  metrics: {},
})
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  const records = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  })
  vi.stubGlobal('crypto', webcrypto)
})

describe('Inventory API adapter', () => {
  it('uses the account API and validates employee records instead of requiring an access token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: {} }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            users: [
              {
                id: 'employee-a',
                name: 'Nhân viên kho',
                email: 'stock@example.com',
                role: 'receiver',
                active: true,
                isOnline: true,
                lastActivityAt: '2026-11-18T02:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: {} }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updated: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const service = createInventoryService()
    await service.login('stock@example.com', 'secure-password-123')
    await service.register({
      companyName: 'Cửa hàng Demo',
      name: 'Chủ cửa hàng',
      email: 'owner@example.com',
      password: 'secure-password-123',
    })
    expect(await service.listUsers()).toMatchObject([
      { id: 'employee-a', role: 'receiver', active: true },
    ])
    await service.createUser({
      name: 'Nhân viên kho',
      email: 'stock@example.com',
      password: 'secure-password-123',
      role: 'receiver',
    })
    await service.updateUser('employee-a', { active: false })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/users',
      '/api/v1/auth/users',
      '/api/v1/auth/users/employee-a',
    ])
    expect(fetcher.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'stock@example.com', password: 'secure-password-123' }),
      }),
    )
  })

  it('checks the account session without downloading the inventory snapshot', async () => {
    const session = {
      actor: { userId: 'user-a', tenantId: 'tenant-a', role: 'receiver' },
      user: { id: 'user-a', name: 'Receiver', email: 'stock@example.com', role: 'receiver' },
      tenant: { id: 'tenant-a', name: 'A' },
      permissions: [],
    }
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    await expect(createInventoryService().checkSession()).resolves.toEqual(session)
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/auth/me')
  })

  it('invalidates the actor context after a session expires so a command requires a fresh snapshot', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot()), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Expired' } }), {
          status: 401,
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    const service = createInventoryService()
    await service.load()
    await expect(service.load()).rejects.toMatchObject({ status: 401 })
    await expect(
      service.command('warehouse.create', { code: 'HN', name: 'Hà Nội' }),
    ).rejects.toMatchObject({ code: 'SESSION_CONTEXT_REQUIRED' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('explains how to restore the inventory API when the dev proxy returns HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><title>Proxy error</title>', {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    await expect(createInventoryService().load()).rejects.toMatchObject({
      status: 0,
      code: 'API_NOT_READY',
      message: expect.stringContaining('npm run server:inventory'),
    })
  })

  it('rejects sales projections with inconsistent returned quantities', async () => {
    const value = {
      ...snapshot(),
      salesOrders: [
        {
          id: 'sales-a',
          number: 'SO-101',
          warehouseId: 'warehouse-a',
          customerReference: 'Customer A',
          reference: '',
          note: '',
          status: 'fulfilled',
          createdAt: '2026-11-17T00:00:00Z',
          fulfillmentDocumentId: 'issue-a',
          lines: [
            {
              id: 'line-a',
              skuId: 'sku-a',
              sku: 'A-1',
              name: 'Item',
              locationId: 'location-a',
              quantity: 2,
              unitPrice: 100,
              reservationId: 'reservation-a',
              returnedQuantity: 1,
              returnableQuantity: 2,
            },
          ],
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })),
    )
    await expect(createInventoryService().load()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('uses the server session and never replaces a failed response with demo data', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } }),
          { status: 401 },
        ),
      )
    vi.stubGlobal('fetch', fetcher)
    const service = createInventoryService('https://inventory.example')
    await expect(service.load()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(fetcher).toHaveBeenCalledWith(
      'https://inventory.example/api/v1/inventory/snapshot',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('passes ledger cursor and warehouse filters to the authenticated snapshot endpoint', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(snapshot()), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await createInventoryService('https://inventory.example').load({
      ledgerLimit: 200,
      beforeSequence: 42,
      warehouseId: 'warehouse a',
    })
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://inventory.example/api/v1/inventory/snapshot?ledgerLimit=200&beforeSequence=42&warehouseId=warehouse+a',
    )
    expect(fetcher.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('keeps the idempotency key after an ambiguous connection failure, then renews it after success', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network'))
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(snapshot()), { status: 200 })),
      )
    vi.stubGlobal('fetch', fetcher)
    const service = createInventoryService()
    fetcher
      .mockReset()
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify(snapshot()), { status: 200 })),
      )
      .mockRejectedValueOnce(new TypeError('Network'))
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(snapshot()), { status: 200 })),
      )
    await service.load()
    const input = { code: 'HN', name: 'Hà Nội' }
    await expect(service.command('warehouse.create', input)).rejects.toMatchObject({
      code: 'CONNECTION_ERROR',
    })
    await service.command('warehouse.create', input)
    await service.command('warehouse.create', input)
    const key = (index: number) =>
      (fetcher.mock.calls[index][1].headers as Record<string, string>)['Idempotency-Key']
    expect(key(1)).toEqual(key(2))
    expect(key(3)).not.toEqual(key(2))
  })

  it('recovers a retry key after a page reload and scopes it to the authenticated tenant and user', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(snapshot()), { status: 200 })),
      )
    vi.stubGlobal('fetch', fetcher)
    const input = {
      reference: 'sensitive-customer-reference',
      lines: [{ skuId: 'sku-a', quantity: 1 }],
    }
    const first = createInventoryService()
    await first.load()
    fetcher.mockRejectedValueOnce(new TypeError('lost reply'))
    await expect(first.command('document.create', input)).rejects.toMatchObject({
      code: 'CONNECTION_ERROR',
    })
    const reloaded = createInventoryService()
    await reloaded.load()
    await reloaded.command('document.create', input)
    const commandCalls = fetcher.mock.calls.filter((call) => call[1]?.method === 'POST')
    const originalKey = commandCalls[0][1].headers['Idempotency-Key']
    expect(commandCalls[1][1].headers['Idempotency-Key']).toEqual(originalKey)
    const other = {
      ...snapshot(),
      tenant: { id: 'tenant-b', name: 'B', config: {} },
      actor: { userId: 'user-b', role: 'owner' },
    }
    fetcher.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(other), { status: 200 })),
    )
    const tenantB = createInventoryService()
    await tenantB.load()
    await tenantB.command('document.create', input)
    const last = fetcher.mock.calls.at(-1)!
    expect(last[1].headers['Idempotency-Key']).not.toEqual(originalKey)
  })

  it('does not let an old tenant response restore command access after logout', async () => {
    let resolveOld!: (response: Response) => void
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedOut: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const service = createInventoryService()
    const staleLoad = service.load()
    await service.logout()
    resolveOld(new Response(JSON.stringify(snapshot()), { status: 200 }))
    await staleLoad
    await expect(
      service.command('warehouse.create', { code: 'A', name: 'Stale' }),
    ).rejects.toMatchObject({ code: 'SESSION_CONTEXT_REQUIRED' })
  })

  it('does not send a mutation when session storage cannot persist its retry key', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(snapshot()), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const service = createInventoryService()
    await service.load()
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    })
    await expect(
      service.command('warehouse.create', { code: 'A', name: 'Test' }),
    ).rejects.toMatchObject({ code: 'RETRY_STORAGE_UNAVAILABLE' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('accepts an unposted document with unknown posted inventory value', async () => {
    const value = {
      ...snapshot(),
      documents: [
        {
          id: 'doc-a',
          number: 'PN-1',
          type: 'receipt',
          status: 'draft',
          warehouseId: 'warehouse-a',
          createdAt: '2026-11-17T00:00:00Z',
          lines: [
            {
              id: 'line-a',
              skuId: 'sku-a',
              quantity: 1,
              unitCost: 100,
              inventoryValue: null,
              serialNumbers: [],
            },
          ],
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })),
    )
    const data = await createInventoryService().load()
    expect(data.documents[0].lines[0].inventoryValue).toBeNull()
  })

  it('rejects malformed success responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
    await expect(createInventoryService().load()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
