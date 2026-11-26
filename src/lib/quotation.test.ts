import { describe, expect, it } from 'vitest'
import type { Product } from '../modules/operations/types'
import type { QuotationInput } from '../types/quotation'
import { filterQuotationProducts, quotationTotals, validateQuotation } from './quotation'

function quotation(patch: Partial<QuotationInput> = {}): QuotationInput {
  return {
    number: 'BG-20261117-001',
    issuedAt: '2026-11-17',
    validUntil: '2026-11-24',
    seller: { name: 'Gốm Mộc', phone: '0901234567', email: '', address: 'TP. Hồ Chí Minh' },
    customer: { name: 'Mai Anh', phone: '', email: '', address: '' },
    conversationId: 'conv-001',
    items: [
      {
        product: { id: 'vase', sku: 'VASE-01', name: 'Bộ bình gốm', price: 650000, stock: 0 },
        quantity: 2,
      },
      {
        product: { id: 'mug', sku: 'MUG-02', name: 'Cốc màu kem', price: 180000, stock: 1 },
        quantity: 3,
      },
    ],
    discount: 50000,
    shippingFee: 30000,
    notes: 'Gói quà theo yêu cầu',
    paymentTerms: 'Thanh toán khi xác nhận đơn hàng',
    deliveryTerms: 'Thống nhất thời gian giao sau khi xác nhận',
    ...patch,
  }
}

describe('quotation catalog search', () => {
  const catalog: Product[] = Array.from({ length: 1000 }, (_, index) => ({
    id: `product-${index}`,
    sku: `SP-${String(index).padStart(4, '0')}`,
    name: `Sản phẩm ${index}`,
    price: 100000,
    stock: index % 3,
    category: index % 2 ? 'Gốm gia dụng' : 'Trang trí',
  }))
  catalog[937] = {
    ...catalog[937],
    name: 'Bộ trà Mộc',
    description: 'Ấm và chén thủ công, men xanh đậm',
  }
  catalog[938] = { ...catalog[938], name: 'Bộ trà Mộc trang trí' }

  it('finds products anywhere in a 1000-product catalog using Vietnamese without accents', () => {
    expect(filterQuotationProducts(catalog, '  BO TRA MOC  ').map((item) => item.id)).toEqual([
      'product-937',
      'product-938',
    ])
    expect(filterQuotationProducts(catalog, '  MEN XANH DAM  ').map((item) => item.id)).toEqual([
      'product-937',
    ])
    expect(filterQuotationProducts(catalog, 'sp-0937').map((item) => item.id)).toEqual([
      'product-937',
    ])
  })

  it('combines text and category filters and includes products with zero stock', () => {
    expect(
      filterQuotationProducts(catalog, 'bo tra moc', 'Gốm gia dụng').map((item) => item.id),
    ).toEqual(['product-937'])
    const decoration = filterQuotationProducts(catalog, '', 'Trang trí')
    expect(decoration).toHaveLength(500)
    expect(decoration.some((item) => item.stock === 0)).toBe(true)
    expect(filterQuotationProducts(catalog, 'không tồn tại')).toEqual([])
    expect(filterQuotationProducts(catalog, '', 'Không tồn tại')).toEqual([])
    expect(filterQuotationProducts(catalog, ' ')).toHaveLength(1000)
    expect(catalog[937].name).toBe('Bộ trà Mộc')
  })
})

describe('quotation totals and validation', () => {
  it('calculates VND line totals, discount, shipping and total quantity', () => {
    const input = quotation()
    expect(quotationTotals(input)).toEqual({
      subtotal: 1840000,
      discount: 50000,
      shippingFee: 30000,
      total: 1820000,
      quantity: 5,
    })
    expect(() => validateQuotation(input)).not.toThrow()
    expect(input.items[0].product.stock).toBe(0)
  })

  it('allows same-day validity, leap days, free products and full discounts', () => {
    const sameDay = quotation({ issuedAt: '2028-02-29', validUntil: '2028-02-29' })
    expect(() => validateQuotation(sameDay)).not.toThrow()
    const fullDiscount = quotation({ discount: 1840000, shippingFee: 0 })
    expect(() => validateQuotation(fullDiscount)).not.toThrow()
    expect(quotationTotals(fullDiscount).total).toBe(0)
    const free = quotation({ discount: 0, shippingFee: 0 })
    free.items[0].product.price = 0
    free.items[1].product.price = 0
    expect(() => validateQuotation(free)).not.toThrow()
    expect(quotationTotals(free).total).toBe(0)
  })

  it.each(['2026-99-99', '2026-02-29', '2026-02-30', '2026-04-31', '2026-00-12', '17/11/2026', ''])(
    'rejects invalid calendar date %s with a clear validation error',
    (date) => {
      expect(() => validateQuotation(quotation({ issuedAt: date }))).toThrow('Ngày hiệu lực')
      expect(() => validateQuotation(quotation({ validUntil: date }))).toThrow('Ngày hiệu lực')
    },
  )

  it('rejects an expiry date before the issue date', () => {
    expect(() => validateQuotation(quotation({ validUntil: '2026-11-16' }))).toThrow(
      'Ngày hiệu lực',
    )
  })

  it('requires a distinct selection of 1 to 200 products', () => {
    expect(() => validateQuotation(quotation({ items: [] }))).toThrow('1 đến 200')
    const input = quotation()
    input.items.push({ ...input.items[0], quantity: 1 })
    expect(() => validateQuotation(input)).toThrow('trùng')
    const items = Array.from({ length: 200 }, (_, index) => ({
      product: { id: `p-${index}`, sku: `SKU-${index}`, name: `Cốc ${index}`, price: 10, stock: 0 },
      quantity: 1,
    }))
    expect(() => validateQuotation(quotation({ items, discount: 0 }))).not.toThrow()
    items.push({
      product: { id: 'p-200', sku: 'SKU-200', name: 'Cốc 200', price: 10, stock: 0 },
      quantity: 1,
    })
    expect(() => validateQuotation(quotation({ items, discount: 0 }))).toThrow('1 đến 200')
  })

  it.each([0, -1, 1.5, 1000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid quantity %s',
    (quantity) => {
      const input = quotation()
      input.items[0].quantity = quantity
      expect(() => validateQuotation(input)).toThrow('số lượng')
    },
  )

  it.each([
    { discount: -1 },
    { discount: 0.5 },
    { discount: 1840001 },
    { discount: Number.NaN },
    { shippingFee: -1 },
    { shippingFee: 0.5 },
    { shippingFee: Number.POSITIVE_INFINITY },
  ])('rejects invalid discounts or shipping: %j', (patch) => {
    expect(() => validateQuotation(quotation(patch))).toThrow('phí giao hàng và giảm giá')
  })

  it('rejects unsafe line totals, subtotal sums and final totals', () => {
    const item = {
      product: {
        id: 'large',
        sku: 'LARGE',
        name: 'Sản phẩm',
        price: Number.MAX_SAFE_INTEGER,
        stock: 0,
      },
      quantity: 2,
    }
    expect(() =>
      validateQuotation(quotation({ items: [item], discount: 0, shippingFee: 0 })),
    ).toThrow('phí giao hàng và giảm giá')
    item.quantity = 1
    expect(() =>
      validateQuotation(quotation({ items: [item], discount: 0, shippingFee: 1 })),
    ).toThrow('phí giao hàng và giảm giá')
    expect(() =>
      validateQuotation(
        quotation({
          items: [
            item,
            { product: { ...item.product, id: 'second', sku: 'SECOND', price: 1 }, quantity: 1 },
          ],
          discount: 0,
          shippingFee: 0,
        }),
      ),
    ).toThrow('phí giao hàng và giảm giá')
  })

  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid unit price %s',
    (price) => {
      const input = quotation()
      input.items[0].product.price = price
      expect(() => validateQuotation(input)).toThrow('Kiểm tra sản phẩm')
    },
  )
})
