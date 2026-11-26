// A small PDF writer for local quotations. Text uses embedded TrueType glyphs and
// a ToUnicode map, so Vietnamese remains sharp, searchable, and copyable.
export interface PdfFont {
  bytes: Uint8Array
  glyph: (character: string) => number
  widths: number[]
  ascent: number
  descent: number
  bbox: number[]
}

const encode = (value: string) => new TextEncoder().encode(value)
const number = (value: number) => Number(value.toFixed(3)).toString()

export function readPdfFont(bytes: Uint8Array): PdfFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tables = new Map<string, number>()
  for (let index = 0; index < view.getUint16(4); index += 1) {
    const position = 12 + index * 16
    const tag = String.fromCharCode(...bytes.slice(position, position + 4))
    tables.set(tag, view.getUint32(position + 8))
  }
  const table = (tag: string) => {
    const offset = tables.get(tag)
    if (offset === undefined) throw new Error(`Invalid TrueType font: ${tag}`)
    return offset
  }
  const head = table('head')
  const units = view.getUint16(head + 18)
  const scale = (value: number) => Math.round((value * 1000) / units)
  const hhea = table('hhea')
  const metricCount = view.getUint16(hhea + 34)
  const glyphCount = view.getUint16(table('maxp') + 4)
  const hmtx = table('hmtx')
  const widths = Array.from({ length: glyphCount }, (_, index) =>
    scale(view.getUint16(hmtx + Math.min(index, metricCount - 1) * 4)),
  )
  const cmap = table('cmap')
  let format4 = 0
  let format12 = 0
  for (let index = 0; index < view.getUint16(cmap + 2); index += 1) {
    const record = cmap + 4 + index * 8
    const offset = cmap + view.getUint32(record + 4)
    const format = view.getUint16(offset)
    if (format === 4) format4 = offset
    if (format === 12) format12 = offset
  }
  if (!format4 && !format12) throw new Error('TrueType Unicode cmap is missing.')
  const glyph = (character: string) => {
    const code = character.codePointAt(0) ?? 0
    if (format12) {
      let low = 0
      let high = view.getUint32(format12 + 12) - 1
      while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        const at = format12 + 16 + middle * 12
        const start = view.getUint32(at)
        const end = view.getUint32(at + 4)
        if (code < start) high = middle - 1
        else if (code > end) low = middle + 1
        else return view.getUint32(at + 8) + code - start
      }
    }
    if (format4 && code <= 0xffff) {
      const segments = view.getUint16(format4 + 6) / 2
      const ends = format4 + 14
      const starts = ends + segments * 2 + 2
      const deltas = starts + segments * 2
      const ranges = deltas + segments * 2
      for (let index = 0; index < segments; index += 1) {
        if (code > view.getUint16(ends + index * 2)) continue
        if (code < view.getUint16(starts + index * 2)) return 0
        const delta = view.getInt16(deltas + index * 2)
        const range = view.getUint16(ranges + index * 2)
        if (!range) return (code + delta) & 0xffff
        const found = view.getUint16(
          ranges + index * 2 + range + (code - view.getUint16(starts + index * 2)) * 2,
        )
        return found ? (found + delta) & 0xffff : 0
      }
    }
    return 0
  }
  return {
    bytes,
    glyph,
    widths,
    ascent: scale(view.getInt16(hhea + 4)),
    descent: scale(view.getInt16(hhea + 6)),
    bbox: [36, 38, 40, 42].map((offset) => scale(view.getInt16(head + offset))),
  }
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function color(hex: string) {
  return [0, 2, 4]
    .map((start) => number(parseInt(hex.replace('#', '').slice(start, start + 2), 16) / 255))
    .join(' ')
}

const hexCode = (value: number) => value.toString(16).padStart(4, '0')
const unicodeHex = (value: string) =>
  [...value]
    .flatMap((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 0xffff
        ? [hexCode(0xd800 + ((code - 0x10000) >> 10)), hexCode(0xdc00 + ((code - 0x10000) & 0x3ff))]
        : [hexCode(code)]
    })
    .join('')

export class PdfDocument {
  readonly width = 595.28
  readonly height = 841.89
  private pages: string[][] = []
  private characters = new Map<string, number>()
  private nextCid = 1
  private usedGlyphs = [new Map<number, number>(), new Map<number, number>()]
  private images: { bytes: Uint8Array; width: number; height: number }[] = []
  constructor(private fonts: [PdfFont, PdfFont]) {}

  addPage() {
    this.pages.push([])
    return this.pages.length - 1
  }

  get pageCount() {
    return this.pages.length
  }

  measure(value: string, size: number, bold = false) {
    const font = this.fonts[bold ? 1 : 0]
    return (
      ([...value.normalize('NFC')].reduce(
        (width, character) => width + (font.widths[font.glyph(character)] ?? font.widths[0]),
        0,
      ) *
        size) /
      1000
    )
  }

  wrap(value: string, width: number, size: number, bold = false) {
    const lines: string[] = []
    for (const paragraph of value.normalize('NFC').split(/\r?\n/)) {
      let line = ''
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word
        if (this.measure(next, size, bold) <= width) {
          line = next
          continue
        }
        if (line) lines.push(line)
        line = ''
        for (const character of word) {
          if (line && this.measure(line + character, size, bold) > width) {
            lines.push(line)
            line = ''
          }
          line += character
        }
      }
      lines.push(line)
    }
    return lines
  }

  text(
    page: number,
    value: string,
    x: number,
    y: number,
    size = 10,
    bold = false,
    fill = '#243c35',
    align: 'left' | 'right' = 'left',
  ) {
    const fontIndex = bold ? 1 : 0
    const font = this.fonts[fontIndex]
    const normalized = value.normalize('NFC')
    const glyphs = [...normalized]
      .map((character) => {
        let cid = this.characters.get(character)
        if (cid === undefined) {
          cid = this.nextCid++
          this.characters.set(character, cid)
        }
        const id = font.glyph(character)
        this.usedGlyphs[fontIndex].set(cid, id)
        return hexCode(cid)
      })
      .join('')
    const left = align === 'right' ? x - this.measure(normalized, size, bold) : x
    this.pages[page].push(
      `BT /F${fontIndex + 1} ${number(size)} Tf ${color(fill)} rg 1 0 0 1 ${number(left)} ${number(this.height - y - size)} Tm <${glyphs}> Tj ET`,
    )
  }

  rect(page: number, x: number, y: number, width: number, height: number, fill: string) {
    this.pages[page].push(
      `${color(fill)} rg ${number(x)} ${number(this.height - y - height)} ${number(width)} ${number(height)} re f`,
    )
  }

  addImage(bytes: Uint8Array, width: number, height: number) {
    this.images.push({ bytes, width, height })
    return this.images.length - 1
  }

  image(page: number, imageId: number, x: number, y: number, width: number, height: number) {
    this.pages[page].push(
      `q ${number(width)} 0 0 ${number(height)} ${number(x)} ${number(this.height - y - height)} cm /Im${imageId} Do Q`,
    )
  }

  bytes() {
    const objects: Uint8Array[] = []
    const reserve = () => {
      objects.push(new Uint8Array())
      return objects.length
    }
    const write = (id: number, value: string | Uint8Array) => {
      objects[id - 1] = typeof value === 'string' ? encode(value) : value
    }
    const add = (value: string | Uint8Array) => {
      const id = reserve()
      write(id, value)
      return id
    }
    const stream = (bytes: Uint8Array, extra = '') =>
      add(
        join([
          encode(`<< /Length ${bytes.length} ${extra} >>\nstream\n`),
          bytes,
          encode('\nendstream'),
        ]),
      )
    const rootId = reserve()
    const pagesId = reserve()
    const fontIds = this.fonts.map((font, index) => {
      const name = index ? 'NotoSans-Bold' : 'NotoSans'
      const fileId = stream(font.bytes, `/Length1 ${font.bytes.length}`)
      const descriptorId = add(
        `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${font.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.ascent} /StemV ${index ? 120 : 80} /FontFile2 ${fileId} 0 R >>`,
      )
      const maxCid = Math.max(0, ...this.usedGlyphs[index].keys())
      const cidToGid = new Uint8Array((maxCid + 1) * 2)
      const widths: string[] = []
      for (const [cid, glyph] of this.usedGlyphs[index]) {
        cidToGid[cid * 2] = glyph >> 8
        cidToGid[cid * 2 + 1] = glyph & 0xff
        widths.push(`${cid} [${font.widths[glyph] ?? font.widths[0]}]`)
      }
      const cidMapId = stream(cidToGid)
      const cidId = add(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /CIDToGIDMap ${cidMapId} 0 R /W [${widths.join(' ')}] >>`,
      )
      const mappings = [...this.characters]
        .map(([character, cid]) => [cid, character] as const)
        .filter(([cid]) => this.usedGlyphs[index].has(cid))
        .map(([cid, character]) => `<${hexCode(cid)}> <${unicodeHex(character)}>`)
      const blocks: string[] = []
      for (let start = 0; start < mappings.length; start += 100) {
        const block = mappings.slice(start, start + 100)
        blocks.push(`${block.length} beginbfchar\n${block.join('\n')}\nendbfchar`)
      }
      const unicodeId = stream(
        encode(
          `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`,
        ),
      )
      return add(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${unicodeId} 0 R >>`,
      )
    })
    const imageIds = this.images.map((image) =>
      stream(
        image.bytes,
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
      ),
    )
    const pageIds = this.pages.map((operations) => {
      const contentId = stream(encode(operations.join('\n')))
      return add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${fontIds[0]} 0 R /F2 ${fontIds[1]} 0 R >> /XObject << ${imageIds.map((id, index) => `/Im${index} ${id} 0 R`).join(' ')} >> >> /Contents ${contentId} 0 R >>`,
      )
    })
    write(
      pagesId,
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    )
    write(rootId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
    const chunks = [encode('%PDF-1.7\n%âãÏÓ\n')]
    const offsets = [0]
    let position = chunks[0].length
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(position)
      const chunk = join([encode(`${index + 1} 0 obj\n`), objects[index], encode('\nendobj\n')])
      chunks.push(chunk)
      position += chunk.length
    }
    const entries = [
      '0000000000 65535 f ',
      ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    ]
    chunks.push(
      encode(
        `xref\n0 ${objects.length + 1}\n${entries.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${position}\n%%EOF\n`,
      ),
    )
    return join(chunks)
  }
}
