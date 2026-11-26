import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import type {
  InventorySnapshot,
  PurchaseOrder,
  StockRestockRequest,
} from './types'
import type { RunCommand } from './InventoryForms'

interface PurchaseOrderLineInput {
  key: number
  skuId: string
  locationId: string
  quantity: string
  unitCost: string
}

interface RestockRequestLineInput {
  key: number
  skuId: string
  requestedQuantity: string
}

export interface RestockRequestPrefill {
  warehouseId: string
  sourceReference: string
  note: string
  lines: Array<{ skuId: string; requestedQuantity: number }>
}

export function RestockRequestCreateForm({
  data,
  run,
  onClose,
  initialRequest,
  onCreated,
}: {
  data: InventorySnapshot
  run: RunCommand
  onClose: () => void
  initialRequest?: RestockRequestPrefill
  onCreated?: () => void
}) {
  const { t } = useI18n()
  const [warehouseId, setWarehouseId] = useState(
    initialRequest?.warehouseId ?? data.warehouses.find((warehouse) => warehouse.active)?.id ?? '',
  )
  const [sourceReference, setSourceReference] = useState(initialRequest?.sourceReference ?? '')
  const [note, setNote] = useState(initialRequest?.note ?? '')
  const [lines, setLines] = useState<RestockRequestLineInput[]>(() =>
    initialRequest
      ? initialRequest.lines.map((line, index) => ({
          key: index + 1,
          skuId: line.skuId,
          requestedQuantity: String(line.requestedQuantity),
        }))
      : [{ key: 1, skuId: '', requestedQuantity: '1' }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeSkus = data.skus.filter((sku) => sku.active)
  const availableQuantity = (skuId: string) =>
    data.balances
      .filter((balance) => balance.warehouseId === warehouseId && balance.skuId === skuId)
      .reduce((total, balance) => total + balance.available, 0)
  const updateLine = (key: number, patch: Partial<RestockRequestLineInput>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const selectedSkus = new Set<string>()
    const duplicateSku = lines.some((line) => {
      if (selectedSkus.has(line.skuId)) return true
      selectedSkus.add(line.skuId)
      return false
    })
    if (
      !warehouseId ||
      !lines.length ||
      lines.some((line) => !line.skuId) ||
      lines.some(
        (line) =>
          !Number.isSafeInteger(Number(line.requestedQuantity)) ||
          Number(line.requestedQuantity) <= 0,
      ) ||
      duplicateSku
    ) {
      setError(
        t(
          'Chọn kho, sản phẩm và nhập số lượng cần bổ sung hợp lệ. Mỗi sản phẩm chỉ được chọn một lần.',
          'Select a warehouse and item, then enter a valid quantity. Each item can only be selected once.',
        ),
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await run('purchaseRequest.create', {
        warehouseId,
        sourceReference: sourceReference.trim(),
        note: note.trim(),
        lines: lines.map((line) => ({
          skuId: line.skuId,
          requestedQuantity: Number(line.requestedQuantity),
        })),
      })
      onCreated?.()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không gửi được yêu cầu bổ sung hàng.', 'Unable to submit the restock request.'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={t('Tạo yêu cầu nhập hàng', 'Create restock request')}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <p className="inv-note">
          {t(
            'Yêu cầu ghi nhận nhu cầu bổ sung, chưa làm thay đổi tồn kho. Quản lý kho sẽ tổng hợp thành đơn mua để kế toán kiểm tra và duyệt.',
            'This records replenishment needs without changing stock. The warehouse manager will consolidate requests into a purchase order for accounting review and approval.',
          )}
        </p>
        <fieldset disabled={busy} className="inv-form-grid">
          <label>
            <span>{t('Kho cần bổ sung', 'Warehouse to replenish')}</span>
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
                    {warehouse.code} · {warehouse.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>{t('Mã tham chiếu (không bắt buộc)', 'Reference (optional)')}</span>
            <input
              value={sourceReference}
              maxLength={200}
              onChange={(event) => setSourceReference(event.target.value)}
            />
          </label>
          <label>
            <span>{t('Ghi chú', 'Note')}</span>
            <input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
          </label>
        </fieldset>
        {lines.map((line, index) => (
          <fieldset key={line.key} disabled={busy} className="inv-document-line">
            <legend>
              {t('Dòng hàng', 'Line')} {index + 1}
            </legend>
            <div className="inv-form-grid">
              <label>
                <span>{t('Sản phẩm', 'Product')} {index + 1}</span>
                <select
                  required
                  value={line.skuId}
                  onChange={(event) => updateLine(line.key, { skuId: event.target.value })}
                >
                  <option value="">{t('Chọn hàng hóa', 'Select item')}</option>
                  {activeSkus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.sku} · {sku.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Tổng số lượng cần có', 'Total quantity needed')}</span>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={line.requestedQuantity}
                  onChange={(event) =>
                    updateLine(line.key, { requestedQuantity: event.target.value })
                  }
                />
              </label>
            </div>
            {line.skuId && warehouseId && (
              <p className="inv-note">
                {t(
                  `Tồn khả dụng hiện tại: ${availableQuantity(line.skuId)}. Nhập tổng nhu cầu lớn hơn mức này.`,
                  `Currently available: ${availableQuantity(line.skuId)}. Enter a total need greater than this amount.`,
                )}
              </p>
            )}
            {lines.length > 1 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
              >
                <Trash2 size={14} />
                {t('Xóa dòng', 'Remove line')}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || !activeSkus.length || lines.length >= 100}
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                key: Math.max(...current.map((line) => line.key), 0) + 1,
                skuId: '',
                requestedQuantity: '1',
              },
            ])
          }
        >
          <Plus size={14} />
          {t('Thêm sản phẩm', 'Add item')}
        </button>
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
            disabled={busy || !lines.length || !activeSkus.length}
          >
            {busy ? t('Đang gửi…', 'Submitting…') : t('Tạo yêu cầu', 'Create request')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function PurchaseOrderCreateForm({
  data,
  request,
  run,
  onClose,
}: {
  data: InventorySnapshot
  request?: StockRestockRequest
  run: RunCommand
  onClose: () => void
}) {
  const { t } = useI18n()
  const [warehouseId, setWarehouseId] = useState(
    request?.warehouseId ?? data.warehouses.find((warehouse) => warehouse.active)?.id ?? '',
  )
  const [supplierId, setSupplierId] = useState(
    data.suppliers.find((supplier) => supplier.active !== false && supplier.active !== 0)?.id ?? '',
  )
  const [reference, setReference] = useState(request?.number ?? '')
  const [note, setNote] = useState(request?.sourceReference ?? '')
  const [lines, setLines] = useState<PurchaseOrderLineInput[]>(
    request
      ? request.lines.map((line, index) => ({
          key: index + 1,
          skuId: line.skuId,
          locationId: '',
          quantity: String(line.requestedQuantity),
          unitCost: '',
        }))
      : [{ key: 1, skuId: '', locationId: '', quantity: '1', unitCost: '' }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeSkus = data.skus.filter((sku) => sku.active)
  const locations = data.locations.filter((location) => location.warehouseId === warehouseId)
  const updateLine = (key: number, patch: Partial<PurchaseOrderLineInput>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const duplicateLine = new Set<string>()
    const duplicate = lines.some((line) => {
      const key = `${line.skuId}:${line.locationId}`
      if (duplicateLine.has(key)) return true
      duplicateLine.add(key)
      return false
    })
    if (
      !warehouseId ||
      !supplierId ||
      !lines.length ||
      lines.some(
        (line) =>
          !line.skuId ||
          line.quantity.trim() === '' ||
          !Number.isSafeInteger(Number(line.quantity)) ||
          Number(line.quantity) <= 0 ||
          line.unitCost.trim() === '' ||
          !Number.isSafeInteger(Number(line.unitCost)) ||
          Number(line.unitCost) < 0,
      ) ||
      duplicate
    ) {
      setError(
        t(
          'Chọn kho, nhà cung cấp và kiểm tra SKU, số lượng, giá vốn từng dòng. Mỗi SKU và vị trí chỉ được xuất hiện một lần.',
          'Select a warehouse and supplier, then check every SKU, quantity, and unit cost. Each SKU and location pair can appear once.',
        ),
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await run('purchaseOrder.create', {
        warehouseId,
        supplierId,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(request ? { restockRequestId: request.id } : {}),
        lines: lines.map((line) => ({
          skuId: line.skuId,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
          ...(line.locationId ? { locationId: line.locationId } : {}),
        })),
      })
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tạo được đơn mua.', 'Unable to create purchase order.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('Tạo đơn mua hàng', 'Create purchase order')}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <p className="inv-note">
          {t(
            'Đơn mua ở trạng thái nháp không làm thay đổi tồn kho. Tồn kho chỉ cập nhật sau khi phiếu nhận hàng được duyệt và ghi sổ.',
            'A draft purchase order does not change stock. Inventory updates only after its receiving document is approved and posted.',
          )}
        </p>
        <fieldset disabled={busy} className="inv-form-grid">
          <label>
            <span>{t('Kho nhận', 'Receiving warehouse')}</span>
            <select
              required
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value)
                setLines((current) => current.map((line) => ({ ...line, locationId: '' })))
              }}
            >
              <option value="">{t('Chọn kho', 'Select warehouse')}</option>
              {data.warehouses
                .filter((warehouse) => warehouse.active)
                .map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} · {warehouse.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>{t('Nhà cung cấp', 'Supplier')}</span>
            <select
              required
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">{t('Chọn nhà cung cấp', 'Select supplier')}</option>
              {data.suppliers
                .filter((supplier) => supplier.active !== false && supplier.active !== 0)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>{t('Mã tham chiếu', 'Reference')}</span>
            <input
              value={reference}
              maxLength={200}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label>
            <span>{t('Ghi chú', 'Note')}</span>
            <input
              value={note}
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </fieldset>
        {lines.map((line, index) => (
          <fieldset key={line.key} disabled={busy} className="inv-document-line">
            <legend>
              {t('Dòng hàng', 'Line')} {index + 1}
            </legend>
            <div className="inv-form-grid">
              <label>
                <span>SKU {index + 1}</span>
                <select
                  required
                  value={line.skuId}
                  onChange={(event) => updateLine(line.key, { skuId: event.target.value })}
                >
                  <option value="">{t('Chọn hàng hóa', 'Select item')}</option>
                  {activeSkus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.sku} · {sku.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Vị trí nhận', 'Receiving location')}</span>
                <select
                  value={line.locationId}
                  onChange={(event) => updateLine(line.key, { locationId: event.target.value })}
                >
                  <option value="">{t('Vị trí mặc định', 'Default location')}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} · {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Số lượng đặt', 'Ordered quantity')}</span>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={line.quantity}
                  onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                />
              </label>
              <label>
                <span>{t('Giá vốn / đơn vị (VND)', 'Unit cost (VND)')}</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={line.unitCost}
                  onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                />
              </label>
            </div>
            {lines.length > 1 && (
              <button
                className="button button-secondary"
                type="button"
                aria-label={`${t('Xóa dòng', 'Remove line')} ${index + 1}`}
                onClick={() =>
                  setLines((current) => current.filter((item) => item.key !== line.key))
                }
              >
                <Trash2 size={14} />
                {t('Xóa dòng', 'Remove line')}
              </button>
            )}
          </fieldset>
        ))}
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                key: Math.max(0, ...current.map((line) => line.key)) + 1,
                skuId: '',
                locationId: '',
                quantity: '1',
                unitCost: '',
              },
            ])
          }
        >
          <Plus size={14} />
          {t('Thêm dòng hàng', 'Add line')}
        </button>
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
          <button className="button button-primary" disabled={busy}>
            {busy ? t('Đang lưu…', 'Saving…') : t('Tạo đơn nháp', 'Create draft')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function PurchaseOrderReceiveForm({
  data,
  purchaseOrder,
  run,
  onClose,
  onReceiptCreated,
}: {
  data: InventorySnapshot
  purchaseOrder: PurchaseOrder
  run: RunCommand
  onClose: () => void
  onReceiptCreated: () => void
}) {
  const { t } = useI18n()
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState(() =>
    Object.fromEntries(
      purchaseOrder.lines.map((line) => [line.id, { quantity: '0', serialNumbers: '' }]),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const updateLine = (lineId: string, field: 'quantity' | 'serialNumbers', value: string) =>
    setLines((current) => ({ ...current, [lineId]: { ...current[lineId], [field]: value } }))
  const receivableQuantity = (line: PurchaseOrder['lines'][number]) =>
    Math.max(
      0,
      Math.min(
        line.outstandingQuantity,
        line.quantity - line.receivedQuantity - line.pendingReceiptQuantity,
      ),
    )
  const serialList = (value: string) =>
    value
      .split(/[\n,;]+/)
      .map((serial) => serial.trim())
      .filter(Boolean)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const receivedLines: {
      purchaseOrderLineId: string
      quantity: number
      serialNumbers?: string[]
    }[] = []
    let validationError = ''
    for (const line of purchaseOrder.lines) {
      const input = lines[line.id] ?? { quantity: '0', serialNumbers: '' }
      const quantity = Number(input.quantity)
      const sku = data.skus.find((item) => item.id === line.skuId)
      const serialNumbers = serialList(input.serialNumbers)
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > receivableQuantity(line)) {
        validationError = t(
          'Số lượng nhận vượt mức còn có thể nhận.',
          'Receipt quantity exceeds the available balance.',
        )
        break
      }
      if (quantity > 0 && sku?.serialTracked && serialNumbers.length !== quantity) {
        validationError = t(
          `Cần nhập đúng ${quantity} serial cho ${sku.name}.`,
          `Enter exactly ${quantity} serial numbers for ${sku.name}.`,
        )
        break
      }
      if (quantity > 0)
        receivedLines.push({
          purchaseOrderLineId: line.id,
          quantity,
          ...(serialNumbers.length ? { serialNumbers } : {}),
        })
    }
    if (validationError || !receivedLines.length) {
      setError(
        validationError ||
          t(
            'Nhập số lượng nhận lớn hơn 0 cho ít nhất một dòng.',
            'Enter a receipt quantity greater than zero on at least one line.',
          ),
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await run('purchaseOrder.receive', {
        id: purchaseOrder.id,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: receivedLines,
      })
      onReceiptCreated()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tạo được phiếu nhận.', 'Unable to create receiving document.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${t('Nhận hàng', 'Receive goods')} · ${purchaseOrder.number}`}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <p className="inv-note">
          {t(
            'Phiếu nhận được tạo ở trạng thái nháp. Duyệt và ghi sổ phiếu trong mục Chứng từ để cập nhật số lượng đã nhận và tồn kho.',
            'A receiving document is created as a draft. Approve and post it in Documents to update received quantities and inventory.',
          )}
        </p>
        <label>
          <span>{t('Mã tham chiếu phiếu nhận', 'Receiving reference')}</span>
          <input
            value={reference}
            maxLength={200}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        {purchaseOrder.lines.map((line, index) => {
          const sku = data.skus.find((item) => item.id === line.skuId)
          const input = lines[line.id] ?? { quantity: '0', serialNumbers: '' }
          const maxQuantity = receivableQuantity(line)
          return (
            <fieldset key={line.id} disabled={busy} className="inv-document-line">
              <legend>
                {t('Dòng hàng', 'Line')} {index + 1}
              </legend>
              <p className="inv-note">
                <strong>
                  {sku?.sku ?? line.skuId} · {sku?.name ?? line.skuId}
                </strong>
                {' · '}
                {t('Đặt', 'Ordered')} {line.quantity}
                {' · '}
                {t('Đã nhận', 'Received')} {line.receivedQuantity}
                {' · '}
                {t('Đang chờ ghi sổ', 'Pending posting')} {line.pendingReceiptQuantity}
              </p>
              <div className="inv-form-grid">
                <label>
                  <span>{t('Số lượng nhận', 'Receipt quantity')}</span>
                  <input
                    type="number"
                    min="0"
                    max={maxQuantity}
                    step="1"
                    value={input.quantity}
                    disabled={maxQuantity === 0}
                    onChange={(event) => updateLine(line.id, 'quantity', event.target.value)}
                  />
                </label>
                {!!sku?.serialTracked && (
                  <label>
                    <span>
                      {t('Serial Number, mỗi dòng một mã', 'Serial numbers, one per line')}
                    </span>
                    <textarea
                      rows={3}
                      value={input.serialNumbers}
                      disabled={maxQuantity === 0}
                      onChange={(event) => updateLine(line.id, 'serialNumbers', event.target.value)}
                    />
                  </label>
                )}
              </div>
            </fieldset>
          )
        })}
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
            disabled={busy || !purchaseOrder.lines.some((line) => receivableQuantity(line) > 0)}
          >
            {busy
              ? t('Đang tạo…', 'Creating…')
              : t('Tạo phiếu nhận nháp', 'Create receiving draft')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
