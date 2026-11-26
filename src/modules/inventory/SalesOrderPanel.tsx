import { useState } from 'react'
import type { FormEvent } from 'react'
import { Package, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import { dateTime, money } from '../operations/domain'
import type { RunCommand } from './InventoryForms'
import { InventoryApiError } from './service'
import type { InventorySnapshot } from './types'
import type { InventorySalesOrder } from './salesTypes'
import { RestockRequestCreateForm } from './PurchaseOrderForms'

interface Props {
  data: InventorySnapshot & { salesOrders?: InventorySalesOrder[] }
  run: RunCommand
  busy: boolean
  warehouseId?: string
  onDocument: (id: string) => void
}
type LineInput = {
  key: number
  skuId: string
  quantity: string
  locationId: string
}

export interface SalesOrderSeedLine {
  skuId: string
  quantity: string
}

export default function SalesOrderPanel({ data, run, busy, warehouseId, onDocument }: Props) {
  const { t, locale } = useI18n()
  const [creating, setCreating] = useState(false)
  const [operation, setOperation] = useState<{
    id: string
    kind: 'confirm' | 'cancel' | 'fulfill' | 'return'
  } | null>(null)
  const selected = data.salesOrders?.find((order) => order.id === operation?.id)
  const enabled = data.tenant.config.inventoryEnabled !== false
  const can = (action: string) => enabled && data.permissions.includes(action)
  const orders = (data.salesOrders ?? []).filter(
    (order) => !warehouseId || order.warehouseId === warehouseId,
  )
  const label = (status: InventorySalesOrder['status']) =>
    ({
      draft: t('Nháp', 'Draft'),
      confirmed: t('Đã giữ hàng', 'Reserved'),
      fulfilled: t('Đã xuất kho', 'Fulfilled'),
      returned: t('Đã nhận trả toàn bộ', 'Fully returned'),
      cancelled: t('Đã hủy', 'Cancelled'),
    })[status]
  return (
    <section className="inv-panel">
      <header>
        <h2>{t('Đơn bán liên kết kho', 'Sales orders linked to inventory')}</h2>
        {can('salesOrder.create') && (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} /> {t('Tạo đơn bán', 'Create sales order')}
          </button>
        )}
      </header>
      <p className="ops-form-hint inv-panel-hint">
        {t(
          'Xác nhận để giữ hàng, xuất kho để trừ tồn. Tham chiếu khách hàng dùng mã hoặc tên đã được doanh nghiệp xác minh.',
          'Confirm to reserve stock; fulfill to post the issue. Use a customer code or name verified by your business.',
        )}
      </p>
      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              {[
                t('Đơn / khách hàng', 'Order / customer'),
                t('Kho', 'Warehouse'),
                t('Hàng hóa', 'Items'),
                t('Trạng thái', 'Status'),
                t('Thao tác', 'Actions'),
              ].map((text) => (
                <th scope="col" key={text}>
                  {text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!orders.length && (
              <tr>
                <td colSpan={5} className="inv-empty">
                  {t('Chưa có đơn bán liên kết kho.', 'No sales orders linked to inventory.')}
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.number}</strong>
                  <small>{order.customerReference}</small>
                  <small>{order.reference}</small>
                  <small>{dateTime(order.createdAt, locale)}</small>
                </td>
                <td>
                  {data.warehouses.find((warehouse) => warehouse.id === order.warehouseId)?.name ??
                    '—'}
                </td>
                <td>
                  {order.lines.map((line) => (
                    <div key={line.id}>
                      <strong>{line.sku}</strong> · {line.quantity} ×{' '}
                      {money(line.unitPrice, locale)}
                      <small>
                        {line.name}
                        {line.returnedQuantity > 0
                          ? ` · ${t('Đã trả', 'Returned')}: ${line.returnedQuantity}`
                          : ''}
                      </small>
                    </div>
                  ))}
                </td>
                <td>{label(order.status)}</td>
                <td>
                  <div className="inv-row-actions">
                    {order.status === 'draft' && can('salesOrder.confirm') && (
                      <button
                        disabled={busy}
                        onClick={() => setOperation({ id: order.id, kind: 'confirm' })}
                      >
                        {t('Xác nhận & giữ hàng', 'Confirm & reserve')}
                      </button>
                    )}
                    {['draft', 'confirmed'].includes(order.status) && can('salesOrder.cancel') && (
                      <button
                        disabled={busy}
                        onClick={() => setOperation({ id: order.id, kind: 'cancel' })}
                      >
                        {t('Hủy đơn', 'Cancel order')}
                      </button>
                    )}
                    {order.status === 'confirmed' && can('salesOrder.fulfill') && (
                      <button
                        disabled={busy}
                        onClick={() => setOperation({ id: order.id, kind: 'fulfill' })}
                      >
                        {t('Xuất kho đơn bán', 'Fulfill sales order')}
                      </button>
                    )}
                    {order.status === 'fulfilled' && can('salesOrder.return') && (
                      <button
                        disabled={busy}
                        onClick={() => setOperation({ id: order.id, kind: 'return' })}
                      >
                        {t('Nhận hàng trả', 'Receive return')}
                      </button>
                    )}
                    {order.fulfillmentDocumentId && (
                      <button
                        disabled={busy}
                        onClick={() => onDocument(order.fulfillmentDocumentId!)}
                      >
                        {t('Phiếu xuất', 'Issue document')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && (
        <SalesOrderCreateForm
          data={data}
          run={run}
          warehouseId={warehouseId}
          onClose={() => setCreating(false)}
        />
      )}
      {selected && operation && (
        <SalesActionForm
          key={`${selected.id}-${operation.kind}`}
          order={selected}
          data={data}
          kind={operation.kind}
          run={run}
          onClose={() => setOperation(null)}
        />
      )}
    </section>
  )
}

export function SalesOrderCreateForm({
  data,
  run,
  warehouseId,
  initialCustomerReference = '',
  initialReference = '',
  initialNote = '',
  initialLines = [],
  onClose,
  onCreated,
}: {
  data: InventorySnapshot
  run: RunCommand
  warehouseId?: string
  initialCustomerReference?: string
  initialReference?: string
  initialNote?: string
  initialLines?: SalesOrderSeedLine[]
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const { t, locale } = useI18n()
  const [warehouse, setWarehouse] = useState(
    warehouseId || data.warehouses.find((item) => item.active)?.id || '',
  )
  const [lines, setLines] = useState<LineInput[]>([
    ...(initialLines.length
      ? initialLines.map((line, key) => ({ ...line, key, locationId: '' }))
      : [{ key: 0, skuId: '', quantity: '1', locationId: '' }]),
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pricedSkus = data.skus.filter((item) => item.active && item.priceKnown)
  const available = (skuId: string, locationId: string) =>
    data.balances
      .filter(
        (balance) =>
          balance.warehouseId === warehouse &&
          balance.skuId === skuId &&
          (!locationId || balance.locationId === locationId),
      )
      .reduce((total, balance) => total + balance.available, 0)
  const update = (key: number, patch: Partial<LineInput>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      if (
        lines.some(
          (line) =>
            !pricedSkus.some((sku) => sku.id === line.skuId) ||
            !Number.isSafeInteger(Number(line.quantity)) ||
            Number(line.quantity) < 1,
        )
      )
        throw new Error(
          t(
            'Chọn sản phẩm có giá bán và số lượng hợp lệ.',
            'Select priced products and valid quantities.',
          ),
        )
      const next = await run('salesOrder.create', {
        warehouseId: warehouse,
        customerReference: String(fields.get('customerReference') ?? '').trim(),
        reference: String(fields.get('reference') ?? '').trim(),
        note: String(fields.get('note') ?? '').trim(),
        lines: lines.map((line) => ({
          skuId: line.skuId,
          quantity: Number(line.quantity),
          ...(line.locationId ? { locationId: line.locationId } : {}),
        })),
      })
      if (!next.result?.id)
        throw new Error(
          t(
            'API chưa trả mã đơn bán. Tải lại dữ liệu để kiểm tra trước khi thử lại.',
            'The API did not return a sales order ID. Reload to verify before retrying.',
          ),
        )
      onCreated?.(next.result.id)
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('Không thể tạo đơn.', 'Unable to create order.'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={t('Tạo đơn hàng', 'Create order')}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <p className="inv-note">
          {t(
            'Sản phẩm và giá bán lấy từ danh mục kho. Xác nhận đơn sẽ giữ tồn; chỉ xuất kho mới ghi giảm tồn.',
            'Products and selling prices come from inventory. Confirming reserves stock; fulfillment posts the stock issue.',
          )}
        </p>
        <fieldset disabled={busy}>
          <label>
            <span>{t('Kho xuất', 'Source warehouse')} *</span>
            <select
              required
              value={warehouse}
              onChange={(event) => {
                setWarehouse(event.target.value)
                setLines((current) => current.map((line) => ({ ...line, locationId: '' })))
              }}
            >
              <option value="">{t('Chọn kho…', 'Select warehouse…')}</option>
              {data.warehouses
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>{t('Mã hoặc tên khách hàng', 'Customer code or name')} *</span>
            <input
              name="customerReference"
              required
              maxLength={200}
              defaultValue={initialCustomerReference}
            />
          </label>
          <label>
            <span>{t('Mã tham chiếu đơn ngoài', 'External order reference')}</span>
            <input name="reference" maxLength={200} defaultValue={initialReference} />
          </label>
          {!pricedSkus.length && (
            <p className="inv-note" role="status">
              {t(
                'Chưa có sản phẩm đang kinh doanh với giá bán đã thiết lập trong kho.',
                'No active inventory products with a selling price are available.',
              )}
            </p>
          )}
          {lines.map((line, index) => (
            <section className="inv-document-line" key={line.key}>
              <label>
                <span>
                  {t('SKU dòng', 'Line SKU')} {index + 1} *
                </span>
                <select
                  required
                  value={line.skuId}
                  onChange={(event) => update(line.key, { skuId: event.target.value })}
                >
                  <option value="">{t('Chọn SKU…', 'Select SKU…')}</option>
                  {pricedSkus.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.sku} · {item.name} · {money(item.price ?? 0, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  {t('Vị trí dòng', 'Line location')} {index + 1}
                </span>
                <select
                  value={line.locationId}
                  onChange={(event) => update(line.key, { locationId: event.target.value })}
                >
                  <option value="">{t('Mặc định của kho', 'Warehouse default')}</option>
                  {data.locations
                    .filter((item) => item.warehouseId === warehouse)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>
                  {t('Số lượng dòng', 'Line quantity')} {index + 1} *
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  max={999999}
                  step={1}
                  value={line.quantity}
                  onChange={(event) => update(line.key, { quantity: event.target.value })}
                />
              </label>
              <p className="inv-note">
                {line.skuId
                  ? t(
                      `Giá bán: ${money(data.skus.find((sku) => sku.id === line.skuId)?.price ?? 0, locale)} · Khả dụng: ${available(line.skuId, line.locationId)}`,
                      `Price: ${money(data.skus.find((sku) => sku.id === line.skuId)?.price ?? 0, locale)} · Available: ${available(line.skuId, line.locationId)}`,
                    )
                  : t(
                      'Giá bán được lấy từ danh mục sản phẩm.',
                      'The selling price is taken from the product catalog.',
                    )}
              </p>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    setLines((current) => current.filter((item) => item.key !== line.key))
                  }
                >
                  <Trash2 size={14} />
                  {t('Xóa dòng', 'Remove line')} {index + 1}
                </button>
              )}
            </section>
          ))}
          <button
            className="button button-secondary"
            type="button"
            disabled={lines.length >= 100}
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  key: Math.max(...current.map((line) => line.key)) + 1,
                  skuId: '',
                  quantity: '1',
                  locationId: '',
                },
              ])
            }
          >
            {t('Thêm dòng hàng', 'Add order line')}
          </button>
          <label>
            <span>{t('Ghi chú', 'Note')}</span>
            <textarea name="note" maxLength={2000} rows={2} defaultValue={initialNote} />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="inv-error">
            {error}
          </p>
        )}
        <div className="inv-form-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('Hủy', 'Cancel')}
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? t('Đang lưu…', 'Saving…') : t('Lưu đơn nháp', 'Save draft order')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function SalesActionForm({
  data,
  order,
  kind,
  run,
  onClose,
}: {
  data: InventorySnapshot
  order: InventorySalesOrder
  kind: 'confirm' | 'cancel' | 'fulfill' | 'return'
  run: RunCommand
  onClose: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stockInsufficient, setStockInsufficient] = useState(false)
  const [restockOpen, setRestockOpen] = useState(false)
  const returning = kind === 'return'
  const requestedBySku = new Map<string, number>()
  if (kind === 'confirm') {
    for (const line of order.lines)
      requestedBySku.set(line.skuId, (requestedBySku.get(line.skuId) ?? 0) + line.quantity)
  }
  const restockLines = [...requestedBySku].flatMap(([skuId, requestedQuantity]) => {
    const available = data.balances
      .filter((balance) => balance.warehouseId === order.warehouseId && balance.skuId === skuId)
      .reduce((total, balance) => total + balance.available, 0)
    return available < requestedQuantity ? [{ skuId, requestedQuantity }] : []
  })
  const title = {
    confirm: t('Xác nhận & giữ hàng', 'Confirm & reserve'),
    cancel: t('Hủy đơn bán', 'Cancel sales order'),
    fulfill: t('Xuất kho đơn bán', 'Fulfill sales order'),
    return: t('Nhận hàng trả', 'Receive return'),
  }[kind]
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setError('')
    setStockInsufficient(false)
    setBusy(true)
    try {
      const lineInputs = order.lines.flatMap((line) => {
        const serialNumbers = String(fields.get(`serial-${line.id}`) ?? '')
          .split(/[\s,;]+/)
          .map((value) => value.trim())
          .filter(Boolean)
        if (returning) {
          const quantity = Number(fields.get(`quantity-${line.id}`) ?? 0)
          return quantity > 0 ? [{ lineId: line.id, quantity, serialNumbers }] : []
        }
        return serialNumbers.length ? [{ lineId: line.id, serialNumbers }] : []
      })
      if (returning && !lineInputs.length)
        throw new Error(
          t(
            'Chọn ít nhất một số lượng trả lớn hơn 0.',
            'Enter at least one positive return quantity.',
          ),
        )
      await run(`salesOrder.${kind}`, {
        id: order.id,
        ...(['cancel', 'return'].includes(kind)
          ? { reason: String(fields.get('reason') ?? '').trim() }
          : {}),
        ...(['fulfill', 'return'].includes(kind) ? { lines: lineInputs } : {}),
      })
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể lưu nghiệp vụ.', 'Unable to save operation.'),
      )
      setStockInsufficient(
        kind === 'confirm' &&
          data.permissions.includes('purchaseRequest.create') &&
          restockLines.length > 0 &&
          cause instanceof InventoryApiError &&
          cause.code === 'INSUFFICIENT_STOCK',
      )
    } finally {
      setBusy(false)
    }
  }
  if (restockOpen) {
    return (
      <RestockRequestCreateForm
        data={data}
        run={run}
        initialRequest={{
          warehouseId: order.warehouseId,
          sourceReference: order.number,
          note: t(
            `Phát sinh do đơn bán ${order.number} không đủ tồn để giữ hàng.`,
            `Requested because sales order ${order.number} could not reserve available stock.`,
          ),
          lines: restockLines,
        }}
        onClose={() => setRestockOpen(false)}
        onCreated={onClose}
      />
    )
  }
  return (
    <Modal
      title={`${title} · ${order.number}`}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <p>
            {kind === 'confirm'
              ? t(
                  'Máy chủ sẽ giữ đủ toàn bộ các dòng hàng. Nếu một dòng thiếu hàng, toàn bộ xác nhận sẽ bị hủy.',
                  'The server reserves every line together. If any line is short, the entire confirmation is rolled back.',
                )
              : kind === 'fulfill'
                ? t(
                    'Lệnh này tạo, duyệt và ghi sổ phiếu xuất bằng lượng đã giữ của đơn bán.',
                    'This creates, approves and posts an issue from the stock reserved for this order.',
                  )
                : returning
                  ? t(
                      'Chỉ nhận lại hàng còn được phép trả, theo phiếu xuất và giá vốn gốc.',
                      'Only remaining returnable quantities can be received against the original issue and carrying value.',
                    )
                  : t(
                      'Hủy đơn sẽ giải phóng lượng hàng còn giữ.',
                      'Cancelling releases the stock still reserved.',
                    )}
          </p>
          {['fulfill', 'return'].includes(kind) &&
            order.lines.map((line) => {
              const tracked = Boolean(data.skus.find((sku) => sku.id === line.skuId)?.serialTracked)
              return (
                <section className="inv-document-line" key={line.id}>
                  <strong>
                    {line.sku} · {line.name}
                  </strong>
                  {returning && (
                    <label>
                      <span>
                        {t('Số lượng trả', 'Return quantity')} · {line.sku}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={line.returnableQuantity}
                        step={1}
                        name={`quantity-${line.id}`}
                        defaultValue={0}
                      />
                    </label>
                  )}
                  {tracked && (
                    <label>
                      <span>
                        {t('Serial', 'Serial')} · {line.sku}
                      </span>
                      <textarea
                        required={!returning}
                        name={`serial-${line.id}`}
                        rows={3}
                        placeholder={t('Mỗi serial một dòng', 'One serial per line')}
                        maxLength={50000}
                      />
                    </label>
                  )}
                  {!returning && (
                    <small>
                      {t('Số lượng', 'Quantity')}: {line.quantity}
                    </small>
                  )}
                </section>
              )
            })}
          {['cancel', 'return'].includes(kind) && (
            <label>
              <span>{t('Lý do', 'Reason')} *</span>
              <textarea
                name="reason"
                required
                minLength={kind === 'return' ? 5 : 3}
                maxLength={2000}
              />
            </label>
          )}
        </fieldset>
        {error && (
          <div className="inv-error" role="alert">
            <p>{error}</p>
            {stockInsufficient && (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setRestockOpen(true)}
              >
                <Package size={14} />
                {t('Tạo yêu cầu nhập hàng', 'Create restock request')}
              </button>
            )}
          </div>
        )}
        <div className="inv-form-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('Đóng', 'Close')}
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? t('Đang xử lý…', 'Processing…') : title}
          </button>
        </div>
      </form>
    </Modal>
  )
}
