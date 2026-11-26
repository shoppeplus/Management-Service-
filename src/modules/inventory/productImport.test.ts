// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createProductXlsxTemplate, parseProductCsv, parseProductXlsx } from './productImport'

describe('parseProductCsv', () => {
  it('reads quoted Excel CSV, optional product properties and opening stock', () => {
    const rows = parseProductCsv(
      [
        'SKU,Tên sản phẩm,Đơn vị,Tồn đầu kỳ,Giá vốn (VND),Theo dõi serial,Mô tả',
        'LAMP-01,"Đèn bàn, bản lớn",Cái,3,150000,Có,"Vỏ thép, màu đen"',
      ].join('\r\n'),
    )

    expect(rows).toEqual([
      {
        sku: 'LAMP-01',
        name: 'Đèn bàn, bản lớn',
        unit: 'Cái',
        quantity: 3,
        cost: 150000,
        serialTracked: true,
        description: 'Vỏ thép, màu đen',
      },
    ])
  })

  it('rejects duplicate SKUs and opening stock without a cost', () => {
    expect(() => parseProductCsv('SKU,Tên sản phẩm,Tồn đầu kỳ\nA,Mặt hàng,1')).toThrow(
      'cần nhập giá vốn',
    )
    expect(() => parseProductCsv('SKU,Tên sản phẩm\nA,Mặt hàng\nA,Mặt hàng khác')).toThrow(
      'bị lặp trong file',
    )
  })

  it('creates and reads a native XLSX workbook with opening stock', () => {
    const workbook = createProductXlsxTemplate([
      ['XLSX-01', 'Đèn bàn', 'Cái', 'Điện', '100000', '2', '50000'],
    ])
    expect(parseProductXlsx(workbook)).toEqual([
      {
        sku: 'XLSX-01',
        name: 'Đèn bàn',
        unit: 'Cái',
        category: 'Điện',
        price: 100000,
        quantity: 2,
        cost: 50000,
      },
    ])
  })
})
