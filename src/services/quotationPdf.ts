import { PdfDocument, readPdfFont } from '../lib/pdfDocument'
import { quotationTotals, validateQuotation } from '../lib/quotation'
import type { QuotationInput, QuotationParty } from '../types/quotation'

interface ProductImage {
  bytes: Uint8Array
  width: number
  height: number
}
export interface QuotationPdfResult {
  bytes: Uint8Array
  pageCount: number
  missingImageCount: number
}
const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`
const date = (value: string) => value.split('-').reverse().join('/')
let fontRequest: Promise<ReturnType<typeof readPdfFont>[]> | undefined

async function loadFonts() {
  fontRequest ??= Promise.all(
    ['Regular', 'Bold'].map(async (weight) => {
      const response = await fetch(`/fonts/NotoSans-${weight}.ttf`)
      if (!response.ok)
        throw new Error(
          'Không tải được font báo giá. Vui lòng thử lại. / Unable to load quotation font. Please retry.',
        )
      return readPdfFont(new Uint8Array(await response.arrayBuffer()))
    }),
  ).catch((cause: unknown) => {
    fontRequest = undefined
    throw cause
  })
  return fontRequest
}

async function loadImage(url: string | undefined): Promise<ProductImage | null> {
  if (!url) return null
  let objectUrl: string | undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.size > 10 * 1024 * 1024) return null
    objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.src = objectUrl
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error('Image timeout')), {
          once: true,
        }),
      ),
    ])
    if (!image.naturalWidth || !image.naturalHeight) return null
    const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const base64 = canvas.toDataURL('image/jpeg', 0.88).split(',')[1]
    const raw = atob(base64)
    return {
      bytes: Uint8Array.from(raw, (character) => character.charCodeAt(0)),
      width: canvas.width,
      height: canvas.height,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

// Limit image work so selecting hundreds of catalog entries cannot exhaust canvas memory.
async function loadImages(input: QuotationInput) {
  const results = new Map<string, ProductImage | null>()
  const unique = [
    ...new Set(
      input.items
        .map(({ product }) => product.imageUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ]
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(4, unique.length) }, async () => {
      while (next < unique.length) {
        const url = unique[next++]
        results.set(url, await loadImage(url))
      }
    }),
  )
  return input.items.map(({ product }) =>
    product.imageUrl ? (results.get(product.imageUrl) ?? null) : null,
  )
}

// Kept separate from downloading to allow preview/QA without triggering a file save.
export async function createQuotationPdf(input: QuotationInput): Promise<QuotationPdfResult> {
  validateQuotation(input)
  const [fonts, images] = await Promise.all([loadFonts(), loadImages(input)])
  const pdf = new PdfDocument([fonts[0], fonts[1]])
  const margin = 38
  const right = pdf.width - margin
  const width = right - margin
  const columnWidth = (width - 16) / 2
  const bottom = pdf.height - 55
  const green = '#176b58'
  let page = -1
  let y = 0

  const header = (table = false) => {
    page = pdf.addPage()
    pdf.rect(page, 0, 0, pdf.width, 6, green)
    pdf.text(page, 'BÁO GIÁ', margin, 28, 27, true, green)
    pdf.text(page, 'QUOTATION', margin, 61, 8, true, '#73857c')
    const quoteLines = pdf.wrap(input.number, 215, 10, true)
    quoteLines.forEach((line, index) =>
      pdf.text(page, line, right, 33 + index * 14, 10, true, green, 'right'),
    )
    y = Math.max(91, 42 + quoteLines.length * 14)
    if (table) tableHeader()
  }
  const ensure = (height: number, table = false) => {
    if (y + height > bottom) header(table)
  }
  const tableHeader = () => {
    pdf.rect(page, margin, y, width, 24, '#eaf2ed')
    pdf.text(page, 'SẢN PHẨM', margin + 10, y + 6, 8, true, green)
    pdf.text(page, 'HÌNH ẢNH - THÔNG TIN - CHI PHÍ', right - 10, y + 6, 8, false, green, 'right')
    y += 30
  }
  const partyLines = (party: QuotationParty) => [
    ...pdf
      .wrap(party.name.trim(), columnWidth - 24, 12, true)
      .map((value) => ({ value, bold: true, size: 12, lineHeight: 17 })),
    ...[party.phone, party.email, party.address]
      .filter((value) => value.trim())
      .flatMap((value) =>
        pdf
          .wrap(value.trim(), columnWidth - 24, 9)
          .map((line) => ({ value: line, bold: false, size: 9, lineHeight: 13 })),
      ),
  ]
  header()
  const seller = partyLines(input.seller)
  const customer = partyLines(input.customer)
  const partyHeight =
    Math.max(
      ...[seller, customer].map((lines) => lines.reduce((sum, line) => sum + line.lineHeight, 0)),
    ) + 44
  for (const [index, lines] of [seller, customer].entries()) {
    const x = margin + index * (columnWidth + 16)
    pdf.rect(page, x, y, columnWidth, partyHeight, '#f3f7f4')
    pdf.text(page, index ? 'KHÁCH HÀNG' : 'BÊN BÁN', x + 12, y + 12, 8, true, green)
    let top = y + 32
    for (const line of lines) {
      pdf.text(page, line.value, x + 12, top, line.size, line.bold)
      top += line.lineHeight
    }
  }
  y += partyHeight + 16
  pdf.text(page, `Ngày lập: ${date(input.issuedAt)}`, margin, y, 9)
  pdf.text(page, `Hiệu lực đến: ${date(input.validUntil)}`, right, y, 9, false, '#243c35', 'right')
  y += 29
  tableHeader()

  for (let index = 0; index < input.items.length; index += 1) {
    const { product, quantity } = input.items[index]
    const textX = margin + 88
    const textWidth = width - 100
    const lines = [
      ...pdf
        .wrap(product.name, textWidth, 12, true)
        .map((value) => ({ value, bold: true, size: 12, height: 17, fill: '#243c35' })),
      ...pdf
        .wrap(`SKU: ${product.sku}${product.unit ? `  ·  ĐVT: ${product.unit}` : ''}`, textWidth, 8)
        .map((value) => ({ value, bold: false, size: 8, height: 12, fill: '#5a7065' })),
      ...(product.category
        ? pdf
            .wrap(product.category, textWidth, 8)
            .map((value) => ({ value, bold: false, size: 8, height: 12, fill: '#5a7065' }))
        : []),
      ...(product.description
        ? pdf
            .wrap(product.description, textWidth, 9.5)
            .map((value) => ({ value, bold: false, size: 9.5, height: 14, fill: '#435b50' }))
        : []),
      ...(product.specifications ?? []).flatMap((spec) =>
        pdf
          .wrap(`${spec.label}: ${spec.value}`, textWidth, 9)
          .map((value) => ({ value, bold: false, size: 9, height: 13, fill: '#435b50' })),
      ),
      ...(product.warrantyMonths !== null && product.warrantyMonths !== undefined
        ? [
            {
              value: `Bảo hành: ${product.warrantyMonths} tháng`,
              bold: true,
              size: 9,
              height: 15,
              fill: '#176b58',
            },
          ]
        : []),
      ...(product.sourceUrl
        ? pdf
            .wrap(`Thông tin sản phẩm: ${product.sourceUrl}`, textWidth, 8)
            .map((value) => ({ value, bold: false, size: 8, height: 12, fill: '#687c71' }))
        : []),
    ]
    const fullHeight = Math.max(110, lines.reduce((sum, line) => sum + line.height, 0) + 50)
    // Move intact rows when possible; unusually long descriptions continue on a fresh page.
    if (fullHeight < bottom - 130) ensure(fullHeight, true)
    let firstSegment = true
    while (lines.length) {
      ensure(firstSegment ? 110 : 82, true)
      if (!firstSegment) {
        pdf.text(page, `${product.sku} - Thông tin tiếp theo`, textX, y + 3, 8, true, green)
        y += 19
      }
      const available = bottom - y - (firstSegment ? 50 : 20)
      let segmentHeight = 0
      let lineCount = 0
      while (lineCount < lines.length && segmentHeight + lines[lineCount].height <= available)
        segmentHeight += lines[lineCount++].height
      const segment = lines.splice(0, lineCount)
      const bodyHeight = Math.max(firstSegment ? 76 : 24, segmentHeight + 16)
      if (firstSegment) {
        const image = images[index]
        pdf.rect(page, margin + 4, y + 4, 68, 68, '#f3f6f2')
        if (image) {
          const id = pdf.addImage(image.bytes, image.width, image.height)
          const ratio = Math.min(62 / image.width, 62 / image.height)
          const w = image.width * ratio
          const h = image.height * ratio
          pdf.image(page, id, margin + 7 + (62 - w) / 2, y + 7 + (62 - h) / 2, w, h)
        } else {
          pdf.text(page, 'Chưa có ảnh', margin + 11, y + 25, 8, false, '#78857e')
          pdf.text(page, 'Liên hệ bên bán', margin + 8, y + 40, 7, false, '#78857e')
        }
        const railY = y + bodyHeight
        pdf.rect(page, margin, railY, width, 24, '#f3f7f4')
        pdf.text(
          page,
          `SL: ${quantity}${product.unit ? ` ${product.unit}` : ''}`,
          margin + 10,
          railY + 6,
          9,
        )
        const unitPrice = money(product.price)
        const amount = money(product.price * quantity)
        const unitLabel = `Đơn giá: ${unitPrice}`
        const amountLabel = `Thành tiền: ${amount}`
        const unitSize = Math.min(9, (160 * 9) / pdf.measure(unitLabel, 9))
        const amountSize = Math.min(10, (191 * 10) / pdf.measure(amountLabel, 10, true))
        pdf.text(page, unitLabel, margin + 153, railY + 6, unitSize)
        pdf.text(page, amountLabel, right - 10, railY + 6, amountSize, true, green, 'right')
      }
      let top = y + 8
      for (const line of segment) {
        pdf.text(page, line.value, textX, top, line.size, line.bold, line.fill)
        top += line.height
      }
      y += bodyHeight + (firstSegment ? 34 : 12)
      pdf.rect(page, margin, y - 1, width, 0.6, '#dfe8e1')
      firstSegment = false
      if (lines.length) header(true)
    }
  }

  const totals = quotationTotals(input)
  ensure(210)
  y += 16
  pdf.text(
    page,
    `${input.items.length} mã hàng · ${totals.quantity} sản phẩm`,
    margin,
    y,
    9,
    false,
    '#5a7065',
  )
  for (const [label, value] of [
    ['Tiền hàng', money(totals.subtotal)],
    ['Giảm giá', `−${money(totals.discount)}`],
    ['Phí giao hàng', money(totals.shippingFee)],
  ]) {
    pdf.text(page, label, 350, y, 9)
    pdf.text(page, value, right - 8, y, 10, false, '#243c35', 'right')
    y += 23
  }
  pdf.rect(page, 338, y, right - 338, 45, '#eaf2ed')
  pdf.text(page, 'TỔNG BÁO GIÁ', 350, y + 7, 8, true, green)
  pdf.text(page, money(totals.total), right - 8, y + 21, 15, true, green, 'right')
  y += 68

  for (const [title, value] of [
    ['THANH TOÁN', input.paymentTerms],
    ['GIAO HÀNG', input.deliveryTerms],
    ['GHI CHÚ', input.notes],
  ]) {
    if (!value.trim()) continue
    const lines = pdf.wrap(value.trim(), width, 9)
    ensure(42)
    pdf.text(page, title, margin, y, 8, true, green)
    y += 17
    for (const line of lines) {
      ensure(14)
      pdf.text(page, line, margin, y, 9, false, '#5a7065')
      y += 14
    }
    y += 8
  }
  ensure(28)
  for (const line of pdf.wrap(
    'Báo giá không giữ tồn kho. Vui lòng liên hệ bên bán để xác nhận đơn hàng và các điều khoản áp dụng.',
    width,
    8,
  )) {
    ensure(12)
    pdf.text(page, line, margin, y, 8, false, '#73857c')
    y += 12
  }
  for (let index = 0; index < pdf.pageCount; index += 1) {
    pdf.rect(index, margin, pdf.height - 39, width, 0.6, '#dfe8e1')
    pdf.text(index, 'Cảm ơn quý khách đã quan tâm!', margin, pdf.height - 28, 8, false, '#73857c')
    pdf.text(
      index,
      `Trang ${index + 1} / ${pdf.pageCount}`,
      right,
      pdf.height - 28,
      8,
      false,
      '#73857c',
      'right',
    )
  }
  return {
    bytes: pdf.bytes(),
    pageCount: pdf.pageCount,
    missingImageCount: images.filter((image) => !image).length,
  }
}

export async function downloadQuotationPdf(input: QuotationInput) {
  const result = await createQuotationPdf(input)
  const blob = new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${input.number.replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'bao-gia'}.pdf`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { missingImageCount: result.missingImageCount }
}
