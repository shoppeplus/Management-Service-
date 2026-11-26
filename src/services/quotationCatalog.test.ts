import { afterEach, describe, expect, it, vi } from 'vitest'
import { InventoryApiError } from '../modules/inventory/service'
import { assertQuotationCatalog, createQuotationCatalogService } from './quotationCatalog'

const catalog = () => ({
  tenant: { id: 'business-a', name: 'Công ty A' },
  actor: { userId: 'staff-a', role: 'staff' },
  warehouses: [{ id: 'warehouse-a', code: 'HN', name: 'Kho Hà Nội' }],
  warehouseId: null as string | null,
  asOf: '2026-11-18T08:00:00.000Z',
  products: [
    {
      id: 'sku-a',
      sku: 'ITEM-A',
      name: 'Sản phẩm A',
      price: null as number | null,
      stock: 4,
      category: 'Thiết bị',
      unit: 'Cái',
      warrantyMonths: 24,
      specifications: [{ label: 'Điện áp', value: '220 V' }],
      description: 'Mô tả từ kho',
      imageUrl: '/products/item.svg',
      sourceUrl: 'https://example.com/item',
    },
  ],
})

afterEach(() => vi.unstubAllGlobals())

describe('inventory quotation catalog client', () => {
  it('uses cookie authentication and the selected warehouse without credentials in storage', async () => {
    const data = catalog()
    data.warehouseId = 'warehouse-a'
    const fetcher = vi.fn().mockResolvedValue(Response.json(data))
    vi.stubGlobal('fetch', fetcher)
    const result = await createQuotationCatalogService('https://api.example.com/').load({
      warehouseId: 'warehouse-a',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/inventory/quotation-catalog?warehouseId=warehouse-a',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
    expect(result.products[0]).toEqual(data.products[0])
  })

  it('preserves an unknown sale price and accepts an explicitly free product', () => {
    const data = catalog()
    assertQuotationCatalog(data)
    expect(data.products[0].price).toBeNull()
    data.products[0].price = 0
    assertQuotationCatalog(data)
    expect(data.products[0].price).toBe(0)
  })

  it('returns authentication errors and connection errors without a demo fallback', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Phiên đã hết hạn' } },
          { status: 401 },
        ),
      )
      .mockRejectedValueOnce(new TypeError('offline'))
    vi.stubGlobal('fetch', fetcher)
    const service = createQuotationCatalogService()
    await expect(service.load()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Phiên đã hết hạn',
    })
    await expect(service.load()).rejects.toMatchObject({ status: 0, code: 'CONNECTION_ERROR' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects a response for a different warehouse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(catalog())))
    await expect(
      createQuotationCatalogService().load({ warehouseId: 'warehouse-a' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([
    [
      'duplicate products',
      (data: ReturnType<typeof catalog>) => data.products.push(data.products[0]),
    ],
    [
      'unsafe image',
      (data: ReturnType<typeof catalog>) => {
        data.products[0].imageUrl = '//untrusted.test/photo.jpg'
      },
    ],
    [
      'unsafe source',
      (data: ReturnType<typeof catalog>) => {
        data.products[0].sourceUrl = 'javascript:alert(1)'
      },
    ],
    [
      'negative available stock',
      (data: ReturnType<typeof catalog>) => {
        data.products[0].stock = -1
      },
    ],
    [
      'invalid warranty',
      (data: ReturnType<typeof catalog>) => {
        data.products[0].warrantyMonths = 1201
      },
    ],
    [
      'invalid specifications',
      (data: ReturnType<typeof catalog>) => {
        data.products[0].specifications[0].value = ''
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const data = catalog()
    mutate(data)
    expect(() => assertQuotationCatalog(data)).toThrow(InventoryApiError)
  })

  it('rejects malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 502 })),
    )
    await expect(createQuotationCatalogService().load()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
