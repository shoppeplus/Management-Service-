import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoInboxService } from '../../services/inboxService'
import { createOperationsDemoData, demoProductMetadata } from './data'
import {
  createApiOperationsService,
  createDemoOperationsService,
  OPERATIONS_STORAGE_KEY,
} from './service'
import type { OperationsData } from './types'
import { assertOperationsData } from './validation'

function withoutMetadata(data: OperationsData) {
  for (const product of data.products) {
    delete product.imageUrl
    delete product.description
    delete product.unit
    delete product.category
  }
  return data
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('product quotation metadata', () => {
  it('keeps snapshots without metadata valid and accepts local or HTTP image URLs', async () => {
    const inbox = await createDemoInboxService().load()
    const data = withoutMetadata(createOperationsDemoData(inbox))
    expect(() => assertOperationsData(data, inbox)).not.toThrow()
    for (const url of [
      '/products/nordic.svg',
      '/images/cup%20cream.png?v=2',
      'https://images.example.com/catalog/cup.png',
      'http://localhost:3000/images/cup.png',
    ]) {
      data.products[0].imageUrl = url
      expect(() => assertOperationsData(data, inbox)).not.toThrow()
    }
    Object.assign(data.products[0], {
      description: 'Gốm thủ công, màu kem',
      unit: 'Bộ',
      category: 'Gốm gia dụng',
    })
    expect(() => assertOperationsData(data, inbox)).not.toThrow()
  })

  it.each([
    '//images.example.com/cup.png',
    '/\\images.example.com/cup.png',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'file:///C:/image.png',
    'https://user:secret@images.example.com/cup.png',
    'https://user@images.example.com/cup.png',
    'https:///images.example.com/cup.png',
    'https://',
    'images/cup.png',
    '/images/cup image.png',
    '/images/cup%ZZ.png',
    '/images/\u0000cup.png',
    `https://images.example.com/${'a'.repeat(2050)}`,
  ])('rejects unsafe or malformed image URL %s', async (url) => {
    const inbox = await createDemoInboxService().load()
    const data = createOperationsDemoData(inbox)
    data.products[0].imageUrl = url
    expect(() => assertOperationsData(data, inbox)).toThrow()
  })

  it.each([
    { description: 'a'.repeat(2001) },
    { description: 123 },
    { unit: '' },
    { unit: 'a'.repeat(41) },
    { category: 'a'.repeat(101) },
    { category: null },
    { imageUrl: null },
  ])('validates optional metadata values and lengths: %j', async (patch) => {
    const inbox = await createDemoInboxService().load()
    const data = createOperationsDemoData(inbox)
    Object.assign(data.products[0], patch)
    expect(() => assertOperationsData(data, inbox)).toThrow()
  })

  it('enriches old Demo products without changing stock, price, names or existing metadata', async () => {
    const inboxService = createDemoInboxService()
    const oldData = withoutMetadata(createOperationsDemoData(await inboxService.load()))
    Object.assign(oldData.products[0], {
      name: 'Bình theo tên cửa hàng',
      price: 777000,
      stock: 19,
      imageUrl: '/custom/nordic.png',
      description: '',
      unit: 'Cặp',
      category: 'Bộ sưu tập riêng',
    })
    oldData.products.push({
      id: 'toString',
      sku: 'CUSTOM-001',
      name: 'Sản phẩm riêng',
      price: 1,
      stock: 2,
    })
    const values = new Map([[OPERATIONS_STORAGE_KEY, JSON.stringify(oldData)]])
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    const service = createDemoOperationsService({ inboxService, storage })
    const data = await service.load()
    expect(data.products[0]).toEqual(oldData.products[0])
    expect(data.products.at(-1)).toEqual(oldData.products.at(-1))
    expect(data.products[1]).toEqual({ ...oldData.products[1], ...demoProductMetadata['prod-mug'] })
    expect(data.orders).toEqual(oldData.orders)
    expect(oldData.products[1].imageUrl).toBeUndefined()

    await service.addCustomerNote('CUS-001', 'Đã chọn sản phẩm cần báo giá')
    const saved = JSON.parse(values.get(OPERATIONS_STORAGE_KEY)!) as OperationsData
    expect(saved.products).toEqual(data.products)
    const reopened = createDemoOperationsService({ inboxService, storage })
    expect((await reopened.load()).products).toEqual(data.products)
  })

  it('preserves optional metadata exactly as returned by the Live API', async () => {
    const inboxService = createDemoInboxService()
    const apiData = withoutMetadata(createOperationsDemoData(await inboxService.load()))
    apiData.products[0].imageUrl = 'https://shop.example.com/catalog/nordic.png'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(apiData))))
    const data = await createApiOperationsService('https://api.example.com', inboxService).load()
    expect(data.products).toEqual(apiData.products)
    expect(data.products[1].imageUrl).toBeUndefined()
  })
})
