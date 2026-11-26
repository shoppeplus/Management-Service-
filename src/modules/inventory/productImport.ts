import { normalizeSearch } from '../operations/domain'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export interface ProductImportRow {
  sku: string
  name: string
  unit?: string
  category?: string
  price?: number
  quantity: number
  cost?: number
  reorderPoint?: number
  maxStock?: number
  leadTimeDays?: number
  serialTracked?: boolean
  warrantyMonths?: number
  imageUrl?: string
  description?: string
  sourceUrl?: string
}

const columns: { key: keyof ProductImportRow; title: string; aliases: string[] }[] = [
  { key: 'sku', title: 'SKU *', aliases: ['sku', 'ma sku'] },
  { key: 'name', title: 'Tên sản phẩm *', aliases: ['ten san pham', 'name', 'product name'] },
  { key: 'unit', title: 'Đơn vị', aliases: ['don vi', 'unit'] },
  { key: 'category', title: 'Danh mục', aliases: ['danh muc', 'category'] },
  { key: 'price', title: 'Giá bán (VND)', aliases: ['gia ban vnd', 'price'] },
  { key: 'quantity', title: 'Tồn đầu kỳ', aliases: ['ton dau ky', 'quantity', 'opening quantity'] },
  { key: 'cost', title: 'Giá vốn (VND)', aliases: ['gia von vnd', 'cost', 'unit cost'] },
  {
    key: 'reorderPoint',
    title: 'Tồn tối thiểu',
    aliases: ['ton toi thieu', 'reorderpoint', 'minimum stock'],
  },
  { key: 'maxStock', title: 'Tồn tối đa', aliases: ['ton toi da', 'maxstock', 'maximum stock'] },
  {
    key: 'leadTimeDays',
    title: 'Thời gian nhập (ngày)',
    aliases: ['thoi gian nhap ngay', 'leadtimedays', 'lead time days'],
  },
  {
    key: 'serialTracked',
    title: 'Theo dõi serial',
    aliases: ['theo doi serial', 'serialtracked', 'track serial'],
  },
  {
    key: 'warrantyMonths',
    title: 'Bảo hành (tháng)',
    aliases: ['bao hanh thang', 'warrantymonths', 'warranty months'],
  },
  { key: 'imageUrl', title: 'URL hình ảnh', aliases: ['url hinh anh', 'imageurl', 'image url'] },
  { key: 'description', title: 'Mô tả', aliases: ['mo ta', 'description'] },
  { key: 'sourceUrl', title: 'URL nguồn', aliases: ['url nguon', 'sourceurl', 'source url'] },
]

const normalizedHeader = (value: string) =>
  normalizeSearch(value).replace(/\*/g, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim()

const delimiterFor = (line: string) => {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"' && line[index + 1] === '"') index++
    else if (line[index] === '"') quoted = !quoted
    else if (!quoted && line[index] in counts) counts[line[index] as keyof typeof counts]++
  }
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0]
}

function parseRecords(source: string, delimiter: string) {
  const records: string[][] = []
  let record: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === '"' && quoted && source[index + 1] === '"') {
      value += '"'
      index++
    } else if (character === '"') quoted = !quoted
    else if (!quoted && character === delimiter) {
      record.push(value)
      value = ''
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && source[index + 1] === '\n') index++
      record.push(value)
      if (record.some((cell) => cell.trim())) records.push(record)
      record = []
      value = ''
    } else value += character
  }
  record.push(value)
  if (record.some((cell) => cell.trim())) records.push(record)
  if (quoted) throw new Error('Dấu ngoặc kép trong file CSV chưa được đóng.')
  return records
}

export function parseProductCsv(source: string): ProductImportRow[] {
  const content = source.replace(/^\uFEFF/, '')
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const records = parseRecords(content, delimiterFor(firstLine))
  if (records.length < 2) throw new Error('File cần có hàng tiêu đề và ít nhất một sản phẩm.')
  const headerKeys = records[0].map((header) => {
    const normalized = normalizedHeader(header)
    return columns.find((column) => column.aliases.includes(normalized))?.key
  })
  const skuIndex = headerKeys.indexOf('sku')
  const nameIndex = headerKeys.indexOf('name')
  if (skuIndex < 0 || nameIndex < 0) throw new Error('File cần có cột SKU và Tên sản phẩm.')
  if (records.length - 1 > 500) throw new Error('Mỗi lần chỉ nhập tối đa 500 sản phẩm.')

  const seen = new Set<string>()
  return records.slice(1).map((cells, rowIndex) => {
    const rowNumber = rowIndex + 2
    const value = (key: keyof ProductImportRow) => {
      const index = headerKeys.indexOf(key)
      return index < 0 ? '' : (cells[index] ?? '').trim()
    }
    const sku = value('sku').toUpperCase()
    const name = value('name')
    if (!sku || !name) throw new Error(`Dòng ${rowNumber}: SKU và tên sản phẩm là bắt buộc.`)
    if (seen.has(sku)) throw new Error(`Dòng ${rowNumber}: SKU ${sku} bị lặp trong file.`)
    seen.add(sku)
    const integer = (key: keyof ProductImportRow, label: string) => {
      const raw = value(key)
      if (!raw) return undefined
      const parsed = Number(raw)
      if (!Number.isSafeInteger(parsed) || parsed < 0)
        throw new Error(`Dòng ${rowNumber}: ${label} phải là số nguyên không âm.`)
      return parsed
    }
    const quantity = integer('quantity', 'Tồn đầu kỳ') ?? 0
    const cost = integer('cost', 'Giá vốn')
    if (quantity > 0 && cost === undefined)
      throw new Error(`Dòng ${rowNumber}: cần nhập giá vốn khi tồn đầu kỳ lớn hơn 0.`)
    const serialValue = normalizeSearch(value('serialTracked'))
    let serialTracked: boolean | undefined
    if (serialValue) {
      if (['1', 'true', 'yes', 'co', 'x'].includes(serialValue)) serialTracked = true
      else if (['0', 'false', 'no', 'khong'].includes(serialValue)) serialTracked = false
      else throw new Error(`Dòng ${rowNumber}: theo dõi serial chỉ nhận Có/Không.`)
    }
    const row: ProductImportRow = {
      sku,
      name,
      quantity,
      ...(value('unit') ? { unit: value('unit') } : {}),
      ...(value('category') ? { category: value('category') } : {}),
      ...(integer('price', 'Giá bán') !== undefined ? { price: integer('price', 'Giá bán') } : {}),
      ...(cost === undefined ? {} : { cost }),
      ...(integer('reorderPoint', 'Tồn tối thiểu') !== undefined
        ? { reorderPoint: integer('reorderPoint', 'Tồn tối thiểu') }
        : {}),
      ...(integer('maxStock', 'Tồn tối đa') !== undefined
        ? { maxStock: integer('maxStock', 'Tồn tối đa') }
        : {}),
      ...(integer('leadTimeDays', 'Thời gian nhập') !== undefined
        ? { leadTimeDays: integer('leadTimeDays', 'Thời gian nhập') }
        : {}),
      ...(serialTracked === undefined ? {} : { serialTracked }),
      ...(integer('warrantyMonths', 'Bảo hành') !== undefined
        ? { warrantyMonths: integer('warrantyMonths', 'Bảo hành') }
        : {}),
      ...(value('imageUrl') ? { imageUrl: value('imageUrl') } : {}),
      ...(value('description') ? { description: value('description') } : {}),
      ...(value('sourceUrl') ? { sourceUrl: value('sourceUrl') } : {}),
    }
    return row
  })
}

const xmlEscape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const columnName = (index: number) => {
  let value = index + 1
  let name = ''
  while (value > 0) {
    value--
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }
  return name
}

export function createProductXlsxTemplate(extraRows: string[][] = []) {
  const rows = [columns.map((column) => column.title), ...extraRows]
    .map(
      (cells, rowIndex) =>
        `<row r="${rowIndex + 1}">${cells
          .map(
            (cell, columnIndex) =>
              `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('')
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="San pham" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        rows +
        '</sheetData></worksheet>',
    ),
  }
  return zipSync(files)
}

export function parseProductXlsx(input: ArrayBuffer | Uint8Array): ProductImportRow[] {
  const files = unzipSync(input instanceof Uint8Array ? input : new Uint8Array(input))
  const sheetBytes = files['xl/worksheets/sheet1.xml']
  if (!sheetBytes) throw new Error('Không tìm thấy trang tính đầu tiên trong file Excel.')
  const document = new DOMParser().parseFromString(strFromU8(sheetBytes), 'application/xml')
  if (document.getElementsByTagName('parsererror').length)
    throw new Error('Cấu trúc trang tính Excel không hợp lệ.')
  const sharedStrings = files['xl/sharedStrings.xml']
    ? Array.from(
        new DOMParser()
          .parseFromString(strFromU8(files['xl/sharedStrings.xml']), 'application/xml')
          .getElementsByTagName('si'),
      ).map((item) =>
        Array.from(item.getElementsByTagName('t'))
          .map((text) => text.textContent ?? '')
          .join(''),
      )
    : []
  const records = Array.from(document.getElementsByTagName('row')).map((row) => {
    const cells: string[] = []
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const reference = cell.getAttribute('r') ?? ''
      const letters = reference.match(/^[A-Z]+/i)?.[0]
      if (!letters) continue
      const columnIndex =
        [...letters.toUpperCase()].reduce(
          (index, letter) => index * 26 + letter.charCodeAt(0) - 64,
          0,
        ) - 1
      const type = cell.getAttribute('t')
      const value =
        type === 'inlineStr'
          ? Array.from(cell.getElementsByTagName('t'))
              .map((text) => text.textContent ?? '')
              .join('')
          : (cell.getElementsByTagName('v')[0]?.textContent ?? '')
      cells[columnIndex] = type === 's' ? (sharedStrings[Number(value)] ?? '') : value
    }
    return cells.map((cell) => cell ?? '')
  })
  const csv = records
    .map((record) => record.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  return parseProductCsv(csv)
}
