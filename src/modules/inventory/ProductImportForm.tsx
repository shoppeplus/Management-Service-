import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import { money } from '../operations/domain'
import type { InventorySnapshot } from './types'
import type { RunCommand } from './InventoryForms'
import { createProductXlsxTemplate, parseProductCsv, parseProductXlsx } from './productImport'
import type { ProductImportRow } from './productImport'

const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Không đọc được nội dung CSV.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được file.'))
    reader.readAsText(file, 'utf-8')
  })

const readFileBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('Không đọc được nội dung Excel.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được file.'))
    reader.readAsArrayBuffer(file)
  })

export default function ProductImportForm({
  data,
  run,
  onClose,
}: {
  data: InventorySnapshot
  run: RunCommand
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const [warehouseId, setWarehouseId] = useState(
    data.warehouses.find((warehouse) => warehouse.active)?.id ?? '',
  )
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ProductImportRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const downloadTemplate = () => {
    const blob = new Blob([createProductXlsxTemplate()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'SmartSales-mau-nhap-san-pham.xlsx'
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    setFileName(file?.name ?? '')
    setRows([])
    setError('')
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError(t('File vượt quá giới hạn 10 MB.', 'The file exceeds the 10 MB limit.'))
      return
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setError(
        t(
          'Vui lòng dùng file .xlsx hoặc .csv từ mẫu.',
          'Please use an .xlsx or .csv template file.',
        ),
      )
      return
    }
    try {
      setRows(
        /\.xlsx$/i.test(file.name)
          ? parseProductXlsx(await readFileBuffer(file))
          : parseProductCsv(await readFileText(file)),
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không đọc được file.', 'Unable to read the file.'),
      )
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (!warehouseId || !rows.length) {
      setError(
        t('Chọn kho và file có sản phẩm hợp lệ.', 'Select a warehouse and a valid product file.'),
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await run('sku.import', { warehouseId, rows })
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không nhập được danh sách sản phẩm.', 'Unable to import products.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const openingStockRows = rows.filter((row) => row.quantity > 0).length
  return (
    <Modal
      title={t('Nhập nhiều sản phẩm từ Excel', 'Import products from Excel')}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <p className="inv-note">
          {t(
            'Tải mẫu Excel, điền sản phẩm rồi chọn lại file. Có thể dùng .xlsx hoặc .csv; SKU trùng sẽ bị từ chối. Sản phẩm và tồn đầu kỳ được ghi nhận cùng một giao dịch.',
            'Download the Excel template, fill in products and select it here. .xlsx and .csv are supported; duplicate SKUs are rejected. Products and opening stock are committed atomically.',
          )}
        </p>
        <div className="inv-actions">
          <button type="button" className="button button-secondary" onClick={downloadTemplate}>
            <Download size={15} />
            {t('Tải file mẫu Excel', 'Download Excel template')}
          </button>
        </div>
        <fieldset disabled={busy} className="inv-form-grid">
          <label>
            <span>{t('Kho ghi nhận tồn đầu kỳ', 'Opening stock warehouse')} *</span>
            <select
              required
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">{t('Chọn kho', 'Select warehouse')}</option>
              {data.warehouses
                .filter((warehouse) => warehouse.active)
                .map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>
              {t('Chọn file Excel (.xlsx hoặc .csv)', 'Choose Excel file (.xlsx or .csv)')} *
            </span>
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => void selectFile(event)}
            />
          </label>
        </fieldset>
        {fileName && (
          <p className="inv-note">
            <FileSpreadsheet size={14} /> {fileName}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <p className="inv-note" role="status">
              {t(
                `Đã kiểm tra ${rows.length} sản phẩm; ${openingStockRows} dòng có tồn đầu kỳ sẽ được nhập kho ngay khi xác nhận.`,
                `${rows.length} products validated; ${openingStockRows} rows with opening stock will be received when confirmed.`,
              )}
            </p>
            <div className="inv-table-scroll">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>{t('Sản phẩm', 'Product')}</th>
                    <th>{t('Đơn vị', 'Unit')}</th>
                    <th>{t('Số lượng đầu kỳ', 'Opening quantity')}</th>
                    <th>{t('Giá vốn', 'Unit cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, index) => (
                    <tr key={`${row.sku}-${index}`}>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{row.unit || t('Cái', 'Item')}</td>
                      <td>{row.quantity.toLocaleString()}</td>
                      <td>{row.cost === undefined ? '—' : money(row.cost, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && (
                <p className="inv-note">
                  {t(
                    `Còn ${rows.length - 10} sản phẩm chưa hiển thị.`,
                    `${rows.length - 10} more products are not shown.`,
                  )}
                </p>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="inv-error" role="alert">
            {error}
          </p>
        )}
        <div className="inv-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('Hủy', 'Cancel')}
          </button>
          <button
            className="button button-primary"
            disabled={busy || rows.length === 0 || !warehouseId}
          >
            {busy
              ? t('Đang nhập…', 'Importing…')
              : t(`Nhập ${rows.length || ''} sản phẩm`, `Import ${rows.length || ''} products`)}
          </button>
        </div>
      </form>
    </Modal>
  )
}
