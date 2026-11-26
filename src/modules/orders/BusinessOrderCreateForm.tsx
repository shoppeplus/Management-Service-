import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import type { Customer, InboxData } from '../../types/inbox'
import { money } from '../operations/domain'
import type { CreateOrderInput, OperationsData } from '../operations/types'
import { APP_MODE } from '../../services/inboxService'
import type { InventorySnapshot } from '../inventory/types'

type OrderLineInput = { key: number; productId: string; quantity: string }

export default function BusinessOrderCreateForm({
  inventory,
  inbox,
  operations,
  initialCustomerId,
  busy,
  onClose,
  onCreate,
}: {
  inventory: InventorySnapshot
  inbox: InboxData
  operations: OperationsData
  initialCustomerId?: string
  busy: boolean
  onClose: () => void
  onCreate: (input: CreateOrderInput) => Promise<OperationsData>
}) {
  const { locale, t } = useI18n()
  const activeWarehouses = inventory.warehouses.filter((item) => item.active)
  const initialCustomer = inbox.customers.find((item) => item.id === initialCustomerId)
  const [customerId, setCustomerId] = useState(initialCustomerId || '')
  const [warehouseId, setWarehouseId] = useState(activeWarehouses[0]?.id || '')
  const [recipientName, setRecipientName] = useState(initialCustomer?.name || '')
  const [recipientPhone, setRecipientPhone] = useState(initialCustomer?.phone || '')
  const [shippingAddress, setShippingAddress] = useState(initialCustomer?.location || '')
  const [paymentMethod, setPaymentMethod] = useState<CreateOrderInput['paymentMethod']>('cod')
  const [discount, setDiscount] = useState('0')
  const [shippingFee, setShippingFee] = useState('0')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<OrderLineInput[]>([{ key: 0, productId: '', quantity: '1' }])
  const [error, setError] = useState('')
  const nextKey = useRef(1)
  const idempotency = useRef<{ body: string; key: string } | null>(null)
  const products = operations.products.filter((item) => item.active)
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )
  const lineTotal = lines.reduce((sum, line) => {
    const price = productById.get(line.productId)?.price ?? 0
    const quantity = Number(line.quantity)
    return sum + (Number.isSafeInteger(quantity) && quantity > 0 ? price * quantity : 0)
  }, 0)
  const availableFor = (productId: string) =>
    inventory.balances
      .filter((balance) => balance.warehouseId === warehouseId && balance.skuId === productId)
      .reduce((sum, balance) => sum + balance.available, 0)

  const chooseCustomer = (id: string) => {
    setCustomerId(id)
    const selected = inbox.customers.find((item) => item.id === id)
    if (selected) {
      setRecipientName(selected.name)
      setRecipientPhone(selected.phone)
      setShippingAddress(selected.location)
    }
  }
  const updateLine = (key: number, patch: Partial<OrderLineInput>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setError('')
    const numericDiscount = Number(discount)
    const numericShippingFee = Number(shippingFee)
    if (!activeWarehouses.some((item) => item.id === warehouseId))
      return setError(t('Chọn kho đang hoạt động.', 'Select an active warehouse.'))
    if (!inbox.customers.some((item) => item.id === customerId))
      return setError(t('Chọn khách hàng hợp lệ.', 'Select a valid customer.'))
    if (
      !lines.length ||
      lines.some(
        (line) =>
          !productById.has(line.productId) ||
          !Number.isSafeInteger(Number(line.quantity)) ||
          Number(line.quantity) < 1 ||
          Number(line.quantity) > 999,
      )
    )
      return setError(t('Kiểm tra sản phẩm và số lượng.', 'Check the products and quantities.'))
    if (
      !Number.isSafeInteger(numericDiscount) ||
      numericDiscount < 0 ||
      !Number.isSafeInteger(numericShippingFee) ||
      numericShippingFee < 0 ||
      !Number.isSafeInteger(lineTotal) ||
      numericDiscount > lineTotal
    )
      return setError(
        t('Giảm giá hoặc phí giao hàng không hợp lệ.', 'Invalid discount or shipping fee.'),
      )
    if (!recipientName.trim() || !recipientPhone.trim() || !shippingAddress.trim())
      return setError(
        t('Nhập đủ thông tin người nhận và địa chỉ.', 'Complete recipient and address details.'),
      )
    const input: CreateOrderInput = {
      customerId,
      ...(APP_MODE === 'live' ? { warehouseId } : {}),
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
      })),
      discount: numericDiscount,
      shippingFee: numericShippingFee,
      paymentMethod,
      shippingAddress: shippingAddress.trim(),
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      note: note.trim(),
    }
    const serialized = JSON.stringify(input)
    if (!idempotency.current || idempotency.current.body !== serialized)
      idempotency.current = { body: serialized, key: crypto.randomUUID() }
    try {
      const before = new Set(operations.orders.map((order) => order.id))
      const result = await onCreate({ ...input, clientRequestId: idempotency.current.key })
      const created = result.orders.find((order) => !before.has(order.id))
      if (!created)
        throw new Error(
          t(
            'Không xác định được mã đơn vừa tạo. Tải lại danh sách trước khi thử lại.',
            'The created order could not be identified. Reload the list before retrying.',
          ),
        )
      idempotency.current = null
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể tạo đơn hàng.', 'Unable to create order.'),
      )
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
      <form className="ops-form" onSubmit={(event) => void submit(event)}>
        <div className="modal-body">
          <p className="ops-inline-notice">
            {t(
              'Đơn hàng dùng khách hàng chuẩn và sản phẩm, giá, tồn kho hiện có. Tạo đơn nháp chưa giữ hàng.',
              'Orders use canonical customers and current products, prices and stock. Draft creation does not reserve stock.',
            )}
          </p>
          <label className="ops-field">
            {t('Khách hàng', 'Customer')}
            <select
              required
              value={customerId}
              disabled={busy}
              onChange={(event) => chooseCustomer(event.target.value)}
            >
              <option value="">{t('Chọn khách hàng', 'Select a customer')}</option>
              {inbox.customers.map((item: Customer) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.phone}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            {t('Kho xuất', 'Source warehouse')}
            <select
              required
              value={warehouseId}
              disabled={busy}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">{t('Chọn kho', 'Select a warehouse')}</option>
              {activeWarehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {lines.map((line, index) => {
            const product = productById.get(line.productId)
            return (
              <section className="ops-form-section" key={line.key}>
                <label className="ops-field">
                  {t(`Sản phẩm ${index + 1}`, `Product ${index + 1}`)}
                  <select
                    required
                    value={line.productId}
                    disabled={busy}
                    onChange={(event) => updateLine(line.key, { productId: event.target.value })}
                  >
                    <option value="">{t('Chọn sản phẩm', 'Select a product')}</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name} · {money(item.price, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ops-field">
                  {t(`Số lượng ${index + 1}`, `Quantity ${index + 1}`)}
                  <input
                    required
                    type="number"
                    min="1"
                    max="999"
                    step="1"
                    value={line.quantity}
                    disabled={busy}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                  />
                </label>
                {product && (
                  <p className="ops-form-hint">
                    {money(product.price, locale)} ·{' '}
                    {t('Khả dụng tại kho', 'Available at warehouse')}: {availableFor(product.id)}
                  </p>
                )}
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  >
                    <Trash2 size={14} />
                    {t('Xóa dòng', 'Remove line')}
                  </button>
                )}
              </section>
            )
          })}
          <button
            type="button"
            className="button button-secondary"
            disabled={busy || lines.length >= 50}
            onClick={() =>
              setLines((current) => [
                ...current,
                { key: nextKey.current++, productId: '', quantity: '1' },
              ])
            }
          >
            <Plus size={14} />
            {t('Thêm sản phẩm', 'Add product')}
          </button>
          <p className="ops-form-hint">
            {t('Tạm tính', 'Subtotal')}: {money(lineTotal, locale)}
          </p>
          <div className="ops-form-grid">
            <label className="ops-field">
              {t('Giảm giá (₫)', 'Discount (VND)')}
              <input
                type="number"
                min="0"
                step="1"
                value={discount}
                disabled={busy}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </label>
            <label className="ops-field">
              {t('Phí giao hàng (₫)', 'Shipping fee (VND)')}
              <input
                type="number"
                min="0"
                step="1"
                value={shippingFee}
                disabled={busy}
                onChange={(event) => setShippingFee(event.target.value)}
              />
            </label>
          </div>
          <label className="ops-field">
            {t('Phương thức thanh toán', 'Payment method')}
            <select
              value={paymentMethod}
              disabled={busy}
              onChange={(event) =>
                setPaymentMethod(event.target.value as CreateOrderInput['paymentMethod'])
              }
            >
              <option value="cod">{t('Thu hộ (COD)', 'Cash on delivery')}</option>
              <option value="bank_transfer">{t('Chuyển khoản', 'Bank transfer')}</option>
            </select>
          </label>
          <label className="ops-field">
            {t('Tên người nhận', 'Recipient name')}
            <input
              required
              maxLength={200}
              value={recipientName}
              disabled={busy}
              onChange={(event) => setRecipientName(event.target.value)}
            />
          </label>
          <label className="ops-field">
            {t('Số điện thoại', 'Phone')}
            <input
              required
              maxLength={24}
              value={recipientPhone}
              disabled={busy}
              onChange={(event) => setRecipientPhone(event.target.value)}
            />
          </label>
          <label className="ops-field">
            {t('Địa chỉ giao hàng', 'Shipping address')}
            <textarea
              required
              maxLength={500}
              value={shippingAddress}
              disabled={busy}
              onChange={(event) => setShippingAddress(event.target.value)}
            />
          </label>
          <label className="ops-field">
            {t('Ghi chú', 'Note')}
            <textarea
              maxLength={5000}
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error && (
            <p className="ops-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('Hủy', 'Cancel')}
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={
              busy || !products.length || !activeWarehouses.length || !inbox.customers.length
            }
          >
            {t('Tạo đơn nháp', 'Create draft')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
