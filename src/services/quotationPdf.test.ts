import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuotationInput } from '../types/quotation'
import { createQuotationPdf } from './quotationPdf'

function quotation(patch: Partial<QuotationInput> = {}): QuotationInput {
  return {
    number: 'BG-20261117-001',
    issuedAt: '2026-11-17',
    validUntil: '2026-11-24',
    seller: {
      name: 'Gốm Mộc',
      phone: '0901234567',
      email: 'sales@example.com',
      address: 'Thành phố Hồ Chí Minh',
    },
    customer: {
      name: 'Nguyễn Thị Hải',
      phone: '0912345678',
      email: '',
      address: '12 Cầu Giấy, Hà Nội',
    },
    conversationId: 'conv-001',
    items: [
      {
        product: {
          id: 'mug',
          sku: 'MUG-001',
          name: 'Cốc gốm màu kem',
          description: 'Gốm thủ công, phù hợp làm quà tặng.',
          category: 'Gốm gia dụng',
          unit: 'Cái',
          price: 180000,
          stock: 42,
        },
        quantity: 2,
      },
      {
        product: {
          id: 'candle',
          sku: 'CAN-002',
          name: 'Nến thơm Santal',
          price: 290000,
          stock: 0,
        },
        quantity: 1,
      },
    ],
    discount: 0,
    shippingFee: 30000,
    notes: 'Gói quà theo yêu cầu.',
    paymentTerms: 'Thanh toán sau khi xác nhận báo giá.',
    deliveryTerms: 'Giao trong 3 ngày làm việc.',
    ...patch,
  }
}

interface PdfText {
  value: string
  x: number
  y: number
  size: number
}
interface ParsedPage {
  width: number
  height: number
  text: PdfText[]
}

// Read the written file through its cross-reference table and declared stream
// lengths. Extraction resolves each page's font resources and ToUnicode map.
function readPdf(bytes: Uint8Array) {
  const file = Buffer.from(bytes)
  const source = file.toString('latin1')
  const trailer = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source)
  expect(trailer, 'PDF trailer').not.toBeNull()
  const xrefOffset = Number(trailer![1])
  expect(source.slice(xrefOffset, xrefOffset + 5)).toBe('xref\n')
  const xrefLines = source.slice(xrefOffset).split('\n')
  const [, countValue] = xrefLines[1].split(' ')
  const count = Number(countValue)
  expect(xrefLines[1]).toBe(`0 ${count}`)
  expect(xrefLines[2]).toBe('0000000000 65535 f ')
  expect(source.slice(xrefOffset)).toContain(`/Size ${count}`)
  const objects = new Map<number, string>()
  for (let id = 1; id < count; id += 1) {
    const entry = xrefLines[id + 2]
    expect(entry).toMatch(/^\d{10} 00000 n $/)
    const offset = Number(entry.slice(0, 10))
    const opening = `${id} 0 obj\n`
    expect(source.slice(offset, offset + opening.length), `xref entry ${id}`).toBe(opening)
    const end = source.indexOf('\nendobj\n', offset)
    expect(end).toBeGreaterThan(offset)
    const object = source.slice(offset + opening.length, end)
    const streamStart = object.indexOf('\nstream\n')
    if (streamStart >= 0) {
      const length = Number(/\/Length\s+(\d+)/.exec(object)![1])
      expect(object.slice(streamStart + 8 + length)).toBe('\nendstream')
    }
    objects.set(id, object)
  }
  const get = (id: number) => {
    const object = objects.get(id)
    expect(object, `referenced object ${id}`).toBeDefined()
    return object!
  }
  const reference = (object: string, key: string) => {
    const match = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(object)
    expect(match, `${key} reference`).not.toBeNull()
    return Number(match![1])
  }
  const stream = (object: string) => {
    const start = object.indexOf('\nstream\n') + 8
    const length = Number(/\/Length\s+(\d+)/.exec(object)![1])
    return object.slice(start, start + length)
  }
  const unicodeMap = (fontId: number) => {
    const font = get(fontId)
    const cmap = stream(get(reference(font, 'ToUnicode')))
    const characters = new Map<string, string>()
    for (const block of cmap.matchAll(/\d+ beginbfchar\s+([\s\S]*?)\s+endbfchar/g)) {
      for (const pair of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
        let character = ''
        for (let start = 0; start < pair[2].length; start += 4) {
          character += String.fromCharCode(parseInt(pair[2].slice(start, start + 4), 16))
        }
        characters.set(pair[1].toLowerCase(), character)
      }
    }
    return characters
  }
  const catalog = get(reference(source.slice(xrefOffset), 'Root'))
  const pageTree = get(reference(catalog, 'Pages'))
  const kids = /\/Kids\s*\[([^\]]*)\]/.exec(pageTree)![1]
  const pageIds = [...kids.matchAll(/(\d+) 0 R/g)].map((match) => Number(match[1]))
  expect(Number(/\/Count\s+(\d+)/.exec(pageTree)![1])).toBe(pageIds.length)
  const pages: ParsedPage[] = pageIds.map((id) => {
    const page = get(id)
    const bounds = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(page)!
    const fontResources = /\/Font\s*<<([\s\S]*?)>>/.exec(page)![1]
    const fonts = new Map(
      [...fontResources.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)].map((match) => [
        match[1],
        unicodeMap(Number(match[2])),
      ]),
    )
    const content = stream(get(reference(page, 'Contents')))
    const text: PdfText[] = []
    for (const operation of content.matchAll(
      /BT\s+\/(F\d+)\s+([\d.]+)\s+Tf\s+[\d. ]+\s+rg\s+1 0 0 1\s+([-\d.]+)\s+([-\d.]+)\s+Tm\s+<([\da-f]*)>\s+Tj\s+ET/gi,
    )) {
      const map = fonts.get(operation[1])!
      let value = ''
      for (let start = 0; start < operation[5].length; start += 4) {
        const code = operation[5].slice(start, start + 4).toLowerCase()
        expect(map.has(code), `Unicode mapping for ${code}`).toBe(true)
        value += map.get(code)
      }
      text.push({
        value,
        size: Number(operation[2]),
        x: Number(operation[3]),
        y: Number(operation[4]),
      })
    }
    expect(text.length, `page ${id} text operations`).toBeGreaterThan(0)
    return { width: Number(bounds[1]), height: Number(bounds[2]), text }
  })
  return { pages, objects }
}

function expectTextOnPages(pages: ParsedPage[]) {
  for (const [index, page] of pages.entries()) {
    const values = page.text.map((entry) => entry.value)
    expect(values).toContain('BÁO GIÁ')
    expect(values).toContain(`Trang ${index + 1} / ${pages.length}`)
    for (const text of page.text) {
      expect(text.x, text.value).toBeGreaterThanOrEqual(0)
      expect(text.x, text.value).toBeLessThan(page.width)
      expect(text.y, text.value).toBeGreaterThanOrEqual(0)
      expect(text.y + text.size, text.value).toBeLessThanOrEqual(page.height)
      expect(text.size, text.value).toBeGreaterThan(0)
    }
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: string) => {
      if (!/^\/fonts\/NotoSans-(Regular|Bold)\.ttf$/.test(request)) {
        throw new Error(`Unexpected PDF asset request: ${request}`)
      }
      const font = await readFile(new URL(`../../public${request}`, import.meta.url))
      return new Response(font, { headers: { 'Content-Type': 'font/ttf' } })
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('quotation PDF file', () => {
  it('writes valid cross references, embeds fonts and extracts complete Vietnamese quotation data', async () => {
    const input = quotation()
    input.customer.name = input.customer.name.normalize('NFD')
    const result = await createQuotationPdf(input)
    const parsed = readPdf(result.bytes)
    expect(result.pageCount).toBe(parsed.pages.length)
    expect(result.pageCount).toBe(1)
    expect(result.missingImageCount).toBe(2)
    const text = parsed.pages.flatMap((page) => page.text.map((entry) => entry.value))
    expect(text).toEqual(
      expect.arrayContaining([
        'BÁO GIÁ',
        'BG-20261117-001',
        'Gốm Mộc',
        'Nguyễn Thị Hải',
        '12 Cầu Giấy, Hà Nội',
        'Ngày lập: 17/11/2026',
        'Hiệu lực đến: 24/11/2026',
        'Cốc gốm màu kem',
        'Nến thơm Santal',
        'Gốm thủ công, phù hợp làm quà tặng.',
        'Thành tiền: 360.000 ₫',
        'Thành tiền: 290.000 ₫',
        '680.000 ₫',
        'Gói quà theo yêu cầu.',
        'Thanh toán sau khi xác nhận báo giá.',
        'Giao trong 3 ngày làm việc.',
      ]),
    )
    const fontDescriptors = [...parsed.objects.values()].filter((object) =>
      object.includes('/Type /FontDescriptor'),
    )
    expect(fontDescriptors).toHaveLength(2)
    for (const descriptor of fontDescriptors) {
      const fontFile = Number(/\/FontFile2\s+(\d+) 0 R/.exec(descriptor)![1])
      expect(parsed.objects.get(fontFile)).toMatch(/\/Length1 \d+/)
      expect(parsed.objects.get(fontFile)!.length).toBeGreaterThan(100000)
    }
    expectTextOnPages(parsed.pages)
  })

  it('keeps inventory specifications, warranty and source in customer PDF text', async () => {
    const input = quotation()
    input.items = [input.items[0]]
    input.items[0].product.specifications = [
      { label: 'Điện áp', value: '220 V' },
      { label: 'Màu sắc', value: 'Trắng' },
    ]
    input.items[0].product.warrantyMonths = 24
    input.items[0].product.sourceUrl = 'https://example.com/thiet-bi'
    const result = await createQuotationPdf(input)
    const parsed = readPdf(result.bytes)
    const lines = parsed.pages.flatMap((page) => page.text.map(({ value }) => value))
    expect(lines).toEqual(
      expect.arrayContaining([
        'Điện áp: 220 V',
        'Màu sắc: Trắng',
        'Bảo hành: 24 tháng',
        'Thông tin sản phẩm: https://example.com/thiet-bi',
      ]),
    )
    expectTextOnPages(parsed.pages)
  })

  it('paginates all 200 selected products without dropping rows or totals', async () => {
    const items = Array.from({ length: 200 }, (_, index) => ({
      product: {
        id: `selected-${index}`,
        sku: `SKU-${String(index).padStart(3, '0')}`,
        name: `Sản phẩm lựa chọn ${String(index).padStart(3, '0')}`,
        price: 100000,
        stock: index,
      },
      quantity: 1,
    }))
    const result = await createQuotationPdf(quotation({ items, shippingFee: 0 }))
    const { pages } = readPdf(result.bytes)
    expect(result.pageCount).toBe(pages.length)
    expect(pages.length).toBeGreaterThan(20)
    expect(pages.length).toBeLessThan(40)
    expect(result.missingImageCount).toBe(200)
    const lines = pages.flatMap((page) => page.text.map((entry) => entry.value))
    const selectedNames = lines.filter((value) => value.startsWith('Sản phẩm lựa chọn '))
    expect(selectedNames).toEqual(items.map(({ product }) => product.name))
    expect(lines).toContain('200 mã hàng · 200 sản phẩm')
    expect(lines).toContain('20.000.000 ₫')
    for (const page of pages.filter((entry) =>
      entry.text.some((text) => text.value.startsWith('Sản phẩm lựa chọn ')),
    )) {
      expect(page.text.map((entry) => entry.value)).toContain('SẢN PHẨM')
    }
    expectTextOnPages(pages)
  })

  it('continues long descriptions and terms across pages without clipping or truncation', async () => {
    const descriptionTokens = Array.from(
      { length: 900 },
      (_, index) => `MôTả${String(index).padStart(4, '0')}`,
    )
    const paymentTokens = Array.from(
      { length: 120 },
      (_, index) => `ThanhToán${String(index).padStart(3, '0')}`,
    )
    const deliveryTokens = Array.from(
      { length: 120 },
      (_, index) => `GiaoHàng${String(index).padStart(3, '0')}`,
    )
    const notesTokens = Array.from(
      { length: 140 },
      (_, index) => `GhiChú${String(index).padStart(3, '0')}`,
    )
    const input = quotation({
      items: [
        {
          ...quotation().items[0],
          product: { ...quotation().items[0].product, description: descriptionTokens.join(' ') },
        },
      ],
      paymentTerms: paymentTokens.join(' '),
      deliveryTerms: deliveryTokens.join(' '),
      notes: notesTokens.join(' '),
    })
    const result = await createQuotationPdf(input)
    const { pages } = readPdf(result.bytes)
    expect(result.pageCount).toBe(pages.length)
    expect(pages.length).toBeGreaterThan(4)
    const text = pages.flatMap((page) => page.text.map((entry) => entry.value)).join(' ')
    expect(text.match(/MôTả\d{4}/g)).toEqual(descriptionTokens)
    expect(text.match(/ThanhToán\d{3}/g)).toEqual(paymentTokens)
    expect(text.match(/GiaoHàng\d{3}/g)).toEqual(deliveryTokens)
    expect(text.match(/GhiChú\d{3}/g)).toEqual(notesTokens)
    expect(text).toContain('1 mã hàng · 2 sản phẩm')
    expect(text).toContain('390.000 ₫')
    expectTextOnPages(pages)
  })

  it('embeds a decoded product image as a JPEG XObject and releases its temporary URL', async () => {
    const fontFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (request) =>
      request === '/products/mug.jpg'
        ? new Response('image source', { headers: { 'Content-Type': 'image/jpeg' } })
        : fontFetch(request),
    )
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:quotation-image')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const decode = vi.fn().mockResolvedValue(undefined)
    class ProductImage {
      src = ''
      naturalWidth = 720
      naturalHeight = 360
      decode = decode
    }
    vi.stubGlobal('Image', ProductImage)
    // The canvas boundary is mocked; these marker bytes let the test verify
    // that PDF embedding preserves the JPEG payload exactly.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toDataURL: vi.fn().mockReturnValue(`data:image/jpeg;base64,${jpeg.toString('base64')}`),
    }
    const createElement = vi.fn().mockReturnValue(canvas)
    vi.stubGlobal('document', { createElement })
    const input = quotation()
    input.items = [input.items[0]]
    input.items[0].product.imageUrl = '/products/mug.jpg'
    const result = await createQuotationPdf(input)
    const { objects, pages } = readPdf(result.bytes)
    expect(result.missingImageCount).toBe(0)
    const images = [...objects.entries()].filter(([, object]) => object.includes('/Subtype /Image'))
    expect(images).toHaveLength(1)
    const [imageId, image] = images[0]
    expect(image).toContain('/Filter /DCTDecode')
    expect(image).toContain('/Width 360 /Height 180')
    expect(image).toContain('/ColorSpace /DeviceRGB /BitsPerComponent 8')
    expect(image).toContain(`/Length ${jpeg.length}`)
    expect(image.slice(image.indexOf('\nstream\n') + 8, -10)).toBe(jpeg.toString('latin1'))
    const page = [...objects.values()].find((object) => object.includes('/Type /Page '))!
    expect(page).toContain(`/XObject << /Im0 ${imageId} 0 R >>`)
    const contentsId = Number(/\/Contents (\d+) 0 R/.exec(page)![1])
    expect(objects.get(contentsId)).toContain('/Im0 Do')
    expect(pages.flatMap((entry) => entry.text.map((text) => text.value))).not.toContain(
      'Chưa có ảnh',
    )
    expect(canvas.width).toBe(360)
    expect(canvas.height).toBe(180)
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.88)
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 360, 180)
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(ProductImage), 0, 0, 360, 180)
    expect(decode).toHaveBeenCalledOnce()
    expect(createElement).toHaveBeenCalledWith('canvas')
    expect(createUrl).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:quotation-image')
  })

  it('keeps readable quotation rows and image placeholders after fetch or decode failures', async () => {
    const fontFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (request) => {
      if (request === '/products/missing.jpg') throw new Error('Image request failed')
      if (request === '/products/corrupt.jpg') {
        return new Response('invalid image', { headers: { 'Content-Type': 'image/jpeg' } })
      }
      return fontFetch(request)
    })
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:corrupt-image')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const decode = vi.fn().mockRejectedValue(new Error('Image decode failed'))
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        naturalWidth = 0
        naturalHeight = 0
        decode = decode
      },
    )
    const createElement = vi.fn()
    vi.stubGlobal('document', { createElement })
    const input = quotation()
    input.items[0].product.imageUrl = '/products/missing.jpg'
    input.items[1].product.imageUrl = '/products/corrupt.jpg'
    const result = await createQuotationPdf(input)
    const { pages, objects } = readPdf(result.bytes)
    expect(result.missingImageCount).toBe(2)
    const text = pages.flatMap((page) => page.text.map((entry) => entry.value))
    expect(text.filter((value) => value === 'Chưa có ảnh')).toHaveLength(2)
    expect(text).toContain('Cốc gốm màu kem')
    expect(text).toContain('Nến thơm Santal')
    expect(text).toContain('680.000 ₫')
    expect([...objects.values()].some((object) => object.includes('/Subtype /Image'))).toBe(false)
    expect(decode).toHaveBeenCalledOnce()
    expect(createElement).not.toHaveBeenCalled()
    expect(createUrl).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:corrupt-image')
    expectTextOnPages(pages)
  })
})
