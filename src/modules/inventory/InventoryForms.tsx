import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import type { DocumentType, InventorySnapshot, StockCount } from './types'
import { returnUnitCost } from './returnValuation'

export type RunCommand = (
  action: string,
  input: Record<string, unknown>,
) => Promise<InventorySnapshot>
export type FormKind =
  'warehouse' | 'location' | 'supplier' | 'sku' | 'document' | 'reservation' | 'count' | 'warranty'

interface Field {
  name: string
  label: string
  type?: 'text' | 'number' | 'email' | 'checkbox' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  required?: boolean
  min?: number
  max?: number
  maxLength?: number
  initial?: string | number | boolean
  onChange?: (value: string) => void
}

export function SimpleCommandForm({
  title,
  fields,
  action,
  run,
  onClose,
  transform,
}: {
  title: string
  fields: Field[]
  action: string
  run: RunCommand
  onClose: () => void
  transform?: (values: Record<string, unknown>) => Record<string, unknown>
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const input = Object.fromEntries(
      fields.map((field) => {
        const value = form.get(field.name)
        return [
          field.name,
          field.type === 'number'
            ? value === '' && !field.required
              ? undefined
              : Number(value)
            : field.type === 'checkbox'
              ? value === 'on'
              : String(value ?? '').trim(),
        ]
      }),
    )
    setBusy(true)
    setError('')
    try {
      await run(action, transform ? transform(input) : input)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Không thể lưu.', 'Unable to save.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          {fields.map((field) => (
            <label key={field.name} className={field.type === 'checkbox' ? 'inv-checkbox' : ''}>
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.type === 'select' ? (
                <select
                  key={`${field.name}-${field.options?.map((option) => option.value).join(',')}`}
                  name={field.name}
                  required={field.required}
                  defaultValue={typeof field.initial === 'boolean' ? '' : (field.initial ?? '')}
                  onChange={(event) => field.onChange?.(event.target.value)}
                >
                  <option value="">{t('Chọn…', 'Select…')}</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  name={field.name}
                  required={field.required}
                  maxLength={field.maxLength ?? 2000}
                  rows={3}
                  defaultValue={typeof field.initial === 'string' ? field.initial : ''}
                />
              ) : (
                <input
                  name={field.name}
                  type={field.type ?? 'text'}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  step={field.type === 'number' ? 1 : undefined}
                  maxLength={field.type === 'number' ? undefined : (field.maxLength ?? 500)}
                  defaultValue={
                    field.type === 'checkbox'
                      ? undefined
                      : (field.initial as string | number | undefined)
                  }
                  defaultChecked={field.type === 'checkbox' ? Boolean(field.initial) : undefined}
                />
              )}
            </label>
          ))}
        </fieldset>
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
            {busy ? t('Đang lưu…', 'Saving…') : t('Lưu', 'Save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function InventoryConfigForm({
  data,
  run,
  onClose,
}: {
  data: InventorySnapshot
  run: RunCommand
  onClose: () => void
}) {
  const { t } = useI18n()
  const config = data.tenant.config
  return (
    <SimpleCommandForm
      title={t('Cấu hình phân hệ kho', 'Inventory module configuration')}
      action="config.update"
      run={run}
      onClose={onClose}
      fields={[
        {
          name: 'inventoryEnabled',
          label: t('Bật phân hệ quản lý kho', 'Enable inventory module'),
          type: 'checkbox',
          initial: config.inventoryEnabled !== false,
        },
        {
          name: 'multiWarehouseEnabled',
          label: t('Cho phép nhiều kho và điều chuyển', 'Enable multiple warehouses and transfers'),
          type: 'checkbox',
          initial: config.multiWarehouseEnabled !== false,
        },
        {
          name: 'staleDays',
          label: t(
            'Số ngày không biến động để cảnh báo hàng tồn lâu',
            'Days without movement before stale-stock alert',
          ),
          type: 'number',
          required: true,
          min: 1,
          max: 3650,
          initial: typeof config.staleDays === 'number' ? config.staleDays : 90,
        },
      ]}
      transform={(values) => ({ config: values })}
    />
  )
}

function ProductForm({
  record,
  data,
  run,
  onClose,
}: {
  record?: InventorySnapshot['skus'][number]
  data: InventorySnapshot
  run: RunCommand
  onClose: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const specificationLines = String(form.get('specifications') ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (specificationLines.length > 12) {
      setError(t('Tối đa 12 thông số sản phẩm.', 'Use at most 12 product specifications.'))
      return
    }
    const specifications = []
    for (const line of specificationLines) {
      const colon = line.indexOf(':')
      if (colon <= 0 || !line.slice(colon + 1).trim()) {
        setError(
          t('Mỗi thông số cần có dạng Tên: Giá trị.', 'Each specification must use Label: Value.'),
        )
        return
      }
      specifications.push({
        label: line.slice(0, colon).trim(),
        value: line.slice(colon + 1).trim(),
      })
    }
    const priceValue = String(form.get('price') ?? '').trim()
    const warrantyValue = String(form.get('warrantyMonths') ?? '').trim()
    const openingQuantityValue = String(form.get('openingQuantity') ?? '').trim()
    const openingCostValue = String(form.get('openingCost') ?? '').trim()
    const warehouseId = String(form.get('openingWarehouse') ?? '').trim()
    const openingQuantity = openingQuantityValue === '' ? 0 : Number(openingQuantityValue)
    const openingCost = openingCostValue === '' ? undefined : Number(openingCostValue)
    if (
      !record &&
      (!Number.isSafeInteger(openingQuantity) ||
        openingQuantity < 0 ||
        (openingQuantity > 0 &&
          (!warehouseId || !Number.isSafeInteger(openingCost) || Number(openingCost) < 0)))
    ) {
      setError(
        t(
          'Chọn kho và nhập số lượng nguyên cùng giá vốn hợp lệ để ghi nhận tồn đầu kỳ.',
          'Select a warehouse and enter a whole quantity and valid unit cost for opening stock.',
        ),
      )
      return
    }
    const input = {
      ...(record ? { id: record.id } : {}),
      sku: String(form.get('sku') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      category: String(form.get('category') ?? '').trim(),
      unit: String(form.get('unit') ?? '').trim(),
      price: priceValue === '' ? null : Number(priceValue),
      reorderPoint: Number(form.get('reorderPoint')),
      maxStock: Number(form.get('maxStock')),
      leadTimeDays: Number(form.get('leadTimeDays')),
      serialTracked: form.has('serialTracked'),
      warrantyMonths: warrantyValue === '' ? null : Number(warrantyValue),
      imageUrl: String(form.get('imageUrl') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      specifications,
      sourceUrl: String(form.get('sourceUrl') ?? '').trim(),
      ...(record ? { active: form.has('active') } : {}),
    }
    setBusy(true)
    setError('')
    try {
      if (!record && openingQuantity > 0) {
        await run('sku.import', {
          warehouseId,
          rows: [{ ...input, quantity: openingQuantity, cost: openingCost }],
        })
      } else {
        await run(record ? 'sku.update' : 'sku.create', input)
      }
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể lưu sản phẩm.', 'Unable to save product.'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={record ? t('Chỉnh sửa sản phẩm', 'Edit product') : t('Thêm sản phẩm', 'Add product')}
      wide
      className="modal-product"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form
        className="inv-form inv-product-form modal-body"
        onSubmit={(event) => void submit(event)}
      >
        <p className="inv-product-intro">
          {t(
            'Thông tin này được dùng trong danh mục, nhập kho và đơn bán. Tồn thực tế chỉ thay đổi qua chứng từ kho.',
            'Product details are used in the catalog, receipts and sales orders. On-hand stock changes only through inventory documents.',
          )}
        </p>
        <fieldset disabled={busy}>
          <section className="inv-product-section">
            <header>
              <span>01</span>
              <div>
                <h3>{t('Thông tin cơ bản', 'Product details')}</h3>
                <p>
                  {t(
                    'Mã định danh và giá bán của sản phẩm.',
                    'Product identity and selling price.',
                  )}
                </p>
              </div>
            </header>
            <div className="inv-product-grid">
              <label>
                <span>SKU *</span>
                <input
                  name="sku"
                  required
                  maxLength={50}
                  defaultValue={record?.sku ?? ''}
                  autoFocus
                />
              </label>
              <label>
                <span>{t('Tên sản phẩm', 'Product name')} *</span>
                <input name="name" required maxLength={200} defaultValue={record?.name ?? ''} />
              </label>
              <label>
                <span>{t('Danh mục', 'Category')}</span>
                <input name="category" maxLength={200} defaultValue={record?.category ?? ''} />
              </label>
              <label>
                <span>{t('Đơn vị tính', 'Unit')} *</span>
                <input
                  name="unit"
                  required
                  maxLength={200}
                  defaultValue={record?.unit ?? t('Cái', 'Item')}
                />
              </label>
              <label className="inv-product-price">
                <span>{t('Giá bán (VND)', 'Selling price (VND)')}</span>
                <input
                  name="price"
                  type="number"
                  min={0}
                  step={1}
                  placeholder={t('Để trống nếu chưa có giá', 'Leave blank if not set')}
                  defaultValue={record?.priceKnown ? record.price : ''}
                />
                <small>
                  {t(
                    'Giá 0 đồng khác với chưa thiết lập giá.',
                    'A zero price is different from an unset price.',
                  )}
                </small>
              </label>
            </div>
          </section>
          <section className="inv-product-section">
            <header>
              <span>02</span>
              <div>
                <h3>{t('Quản lý tồn kho', 'Stock controls')}</h3>
                <p>
                  {t(
                    'Thiết lập cảnh báo và theo dõi sản phẩm.',
                    'Configure replenishment alerts and traceability.',
                  )}
                </p>
              </div>
            </header>
            <div className="inv-product-grid">
              <label>
                <span>{t('Mức tồn tối thiểu', 'Minimum stock')} *</span>
                <input
                  name="reorderPoint"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={record?.reorderPoint ?? 5}
                />
              </label>
              <label>
                <span>{t('Mức tồn tối đa', 'Maximum stock')} *</span>
                <input
                  name="maxStock"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={record?.maxStock ?? 100}
                />
              </label>
              <label>
                <span>{t('Thời gian nhập (ngày)', 'Lead time (days)')} *</span>
                <input
                  name="leadTimeDays"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={record?.leadTimeDays ?? 7}
                />
              </label>
              <label>
                <span>{t('Thời hạn bảo hành (tháng)', 'Warranty period (months)')}</span>
                <input
                  name="warrantyMonths"
                  type="number"
                  min={0}
                  max={1200}
                  step={1}
                  defaultValue={record?.warrantyMonths ?? ''}
                />
              </label>
              <label className="inv-product-toggle">
                <input
                  name="serialTracked"
                  type="checkbox"
                  defaultChecked={Boolean(record?.serialTracked)}
                />
                <span>{t('Theo dõi từng Serial Number', 'Track individual serial numbers')}</span>
              </label>
              {record && (
                <label className="inv-product-toggle">
                  <input name="active" type="checkbox" defaultChecked={Boolean(record.active)} />
                  <span>{t('Đang kinh doanh', 'Available for sale')}</span>
                </label>
              )}
            </div>
          </section>
          <section className="inv-product-section">
            <header>
              <span>03</span>
              <div>
                <h3>{t('Thông tin hiển thị', 'Customer-facing details')}</h3>
                <p>
                  {t(
                    'Mô tả và thông số đã xác minh để nhân viên tư vấn chính xác.',
                    'Verified descriptions and specifications for accurate customer advice.',
                  )}
                </p>
              </div>
            </header>
            <div className="inv-product-grid">
              <label className="inv-product-wide">
                <span>{t('Mô tả sản phẩm', 'Product description')}</span>
                <textarea
                  name="description"
                  rows={3}
                  maxLength={4000}
                  defaultValue={record?.metadata?.description ?? ''}
                />
              </label>
              <label className="inv-product-wide">
                <span>
                  {t(
                    'Thông số (mỗi dòng: Tên: Giá trị, tối đa 12 dòng)',
                    'Specifications (one Label: Value per line, up to 12)',
                  )}
                </span>
                <textarea
                  name="specifications"
                  rows={4}
                  maxLength={4000}
                  placeholder={t(
                    'Ví dụ: Chất liệu: Thép không gỉ',
                    'Example: Material: Stainless steel',
                  )}
                  defaultValue={
                    record?.metadata?.specifications
                      ?.map((spec) => `${spec.label}: ${spec.value}`)
                      .join('\n') ?? ''
                  }
                />
              </label>
              <label>
                <span>{t('URL hình ảnh', 'Image URL')}</span>
                <input
                  type="url"
                  name="imageUrl"
                  maxLength={2048}
                  defaultValue={record?.metadata?.imageUrl ?? ''}
                />
              </label>
              <label>
                <span>{t('URL nguồn tham khảo', 'Reference URL')}</span>
                <input
                  type="url"
                  name="sourceUrl"
                  maxLength={2048}
                  defaultValue={record?.metadata?.sourceUrl ?? ''}
                />
              </label>
            </div>
          </section>
          {!record && data.permissions.includes('sku.import') && (
            <section className="inv-product-section">
              <header>
                <span>04</span>
                <div>
                  <h3>{t('Tồn đầu kỳ (không bắt buộc)', 'Opening stock (optional)')}</h3>
                  <p>
                    {t(
                      'Ghi nhận tồn qua phiếu nhập đã duyệt và ghi sổ; giá vốn 0 chỉ dùng nếu hàng miễn phí.',
                      'Opening stock is recorded through an approved and posted receipt; zero cost is only for free goods.',
                    )}
                  </p>
                </div>
              </header>
              <div className="inv-product-grid">
                <label>
                  <span>{t('Kho nhập', 'Receiving warehouse')}</span>
                  <select
                    name="openingWarehouse"
                    defaultValue={data.warehouses.find((item) => item.active)?.id ?? ''}
                  >
                    <option value="">{t('Chọn kho', 'Select warehouse')}</option>
                    {data.warehouses
                      .filter((item) => item.active)
                      .map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t('Số lượng ban đầu', 'Opening quantity')}</span>
                  <input name="openingQuantity" type="number" min={0} step={1} defaultValue={0} />
                </label>
                <label>
                  <span>{t('Giá vốn / đơn vị (VND)', 'Unit cost (VND)')}</span>
                  <input name="openingCost" type="number" min={0} step={1} />
                </label>
              </div>
            </section>
          )}
        </fieldset>
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
            {busy
              ? t('Đang lưu…', 'Saving…')
              : record
                ? t('Lưu thay đổi', 'Save changes')
                : t('Tạo sản phẩm', 'Create product')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function SetupForm({
  kind,
  data,
  recordId,
  run,
  onClose,
}: {
  kind: Exclude<FormKind, 'document'>
  data: InventorySnapshot
  recordId?: string
  run: RunCommand
  onClose: () => void
}) {
  const { t } = useI18n()
  const [reservationWarehouseId, setReservationWarehouseId] = useState('')
  const warehouseRecord =
    kind === 'warehouse' ? data.warehouses.find((item) => item.id === recordId) : undefined
  const supplierRecord =
    kind === 'supplier' ? data.suppliers.find((item) => item.id === recordId) : undefined
  const skuRecord = kind === 'sku' ? data.skus.find((item) => item.id === recordId) : undefined
  const existing = warehouseRecord ?? supplierRecord ?? skuRecord
  if (kind === 'sku')
    return <ProductForm record={skuRecord} data={data} run={run} onClose={onClose} />
  const warehouses = data.warehouses
    .filter((warehouse) => warehouse.active)
    .map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))
  const skuOptions = data.skus
    .filter((sku) => sku.active)
    .map((sku) => ({ value: sku.id, label: `${sku.sku} · ${sku.name}` }))
  const definitions: Record<
    Exclude<FormKind, 'document' | 'sku'>,
    { title: string; action: string; fields: Field[] }
  > = {
    warehouse: {
      title: existing ? t('Chỉnh sửa kho', 'Edit warehouse') : t('Tạo kho', 'Create warehouse'),
      action: existing ? 'warehouse.update' : 'warehouse.create',
      fields: [
        {
          name: 'code',
          label: t('Mã kho', 'Warehouse code'),
          required: true,
          initial: warehouseRecord ? warehouseRecord.code : '',
        },
        {
          name: 'name',
          label: t('Tên kho', 'Warehouse name'),
          required: true,
          initial: warehouseRecord ? warehouseRecord.name : '',
        },
        {
          name: 'address',
          label: t('Địa chỉ', 'Address'),
          initial: warehouseRecord ? warehouseRecord.address : '',
        },
        ...(existing
          ? [
              {
                name: 'active',
                label: t('Kho đang hoạt động', 'Warehouse active'),
                type: 'checkbox' as const,
                initial: Boolean(existing.active),
              },
            ]
          : []),
      ],
    },
    location: {
      title: t('Tạo vị trí lưu trữ', 'Create storage location'),
      action: 'location.create',
      fields: [
        {
          name: 'warehouseId',
          label: t('Kho', 'Warehouse'),
          type: 'select',
          options: warehouses,
          required: true,
        },
        { name: 'code', label: t('Mã khu / kệ / ô', 'Area / shelf / bin code'), required: true },
        { name: 'name', label: t('Tên vị trí', 'Location name'), required: true },
      ],
    },
    supplier: {
      title: existing
        ? t('Chỉnh sửa nhà cung cấp', 'Edit supplier')
        : t('Thêm nhà cung cấp', 'Add supplier'),
      action: existing ? 'supplier.update' : 'supplier.create',
      fields: [
        {
          name: 'code',
          label: t('Mã nhà cung cấp', 'Supplier code'),
          required: true,
          initial: supplierRecord ? supplierRecord.code : '',
        },
        {
          name: 'name',
          label: t('Tên nhà cung cấp', 'Supplier name'),
          required: true,
          initial: supplierRecord ? supplierRecord.name : '',
        },
        {
          name: 'phone',
          label: t('Điện thoại', 'Phone'),
          initial: supplierRecord ? (supplierRecord.phone ?? '') : '',
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          initial: supplierRecord ? (supplierRecord.email ?? '') : '',
        },
        {
          name: 'address',
          label: t('Địa chỉ', 'Address'),
          initial: supplierRecord ? (supplierRecord.address ?? '') : '',
        },
        ...(existing
          ? [
              {
                name: 'active',
                label: t('Nhà cung cấp đang hoạt động', 'Supplier active'),
                type: 'checkbox' as const,
                initial: Boolean(existing.active),
              },
            ]
          : []),
      ],
    },
    reservation: {
      title: t('Giữ chỗ tồn kho', 'Reserve stock'),
      action: 'reservation.create',
      fields: [
        {
          name: 'warehouseId',
          label: t('Kho', 'Warehouse'),
          type: 'select',
          options: warehouses,
          required: true,
          onChange: setReservationWarehouseId,
        },
        {
          name: 'locationId',
          label: t('Vị trí giữ hàng', 'Reservation location'),
          type: 'select',
          options: data.locations
            .filter((location) => location.warehouseId === reservationWarehouseId)
            .map((location) => ({
              value: location.id,
              label: `${location.code} · ${location.name}`,
            })),
        },
        {
          name: 'skuId',
          label: t('Hàng hóa', 'Item'),
          type: 'select',
          options: skuOptions,
          required: true,
        },
        {
          name: 'quantity',
          label: t('Số lượng', 'Quantity'),
          type: 'number',
          min: 1,
          initial: '1',
          required: true,
        },
        { name: 'reference', label: t('Mã đơn / tham chiếu', 'Order / reference'), required: true },
      ],
    },
    count: {
      title: t('Tạo đợt kiểm kê', 'Create stock count'),
      action: 'count.create',
      fields: [
        {
          name: 'warehouseId',
          label: t('Kho', 'Warehouse'),
          type: 'select',
          options: warehouses,
          required: true,
        },
        { name: 'name', label: t('Tên đợt kiểm kê', 'Count name'), required: true },
      ],
    },
    warranty: {
      title: t('Tiếp nhận bảo hành', 'Open warranty case'),
      action: 'warranty.create',
      fields: [
        {
          name: 'serialId',
          label: 'Serial Number',
          type: 'select',
          required: true,
          options: data.serials.map((serial) => ({ value: serial.id, label: serial.serialNumber })),
        },
        { name: 'customerName', label: t('Tên khách hàng', 'Customer name'), required: true },
        { name: 'issue', label: t('Mô tả lỗi', 'Issue'), type: 'textarea', required: true },
      ],
    },
  }
  return (
    <SimpleCommandForm
      {...definitions[kind]}
      run={run}
      onClose={onClose}
      transform={
        existing && ['warehouse', 'supplier'].includes(kind)
          ? (values) => ({ ...values, id: existing.id })
          : kind === 'reservation'
            ? (values) => {
                const next = { ...values }
                if (!next.locationId) delete next.locationId
                return next
              }
            : undefined
      }
    />
  )
}

export function DocumentForm({
  data,
  run,
  onClose,
  canCreateStandaloneReceipt,
}: {
  data: InventorySnapshot
  run: RunCommand
  onClose: () => void
  canCreateStandaloneReceipt: boolean
}) {
  const { t } = useI18n()
  const [type, setType] = useState<DocumentType>(
    canCreateStandaloneReceipt ? 'receipt' : 'issue',
  )
  const [warehouseId, setWarehouseId] = useState(
    data.warehouses.find((warehouse) => warehouse.active)?.id ?? '',
  )
  const [targetWarehouseId, setTargetWarehouseId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [returnToStock, setReturnToStock] = useState(false)
  const [sourceDocumentId, setSourceDocumentId] = useState('')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState([
    {
      key: 1,
      skuId: '',
      quantity: '1',
      unitCost: '',
      locationId: '',
      targetLocationId: '',
      serialNumbers: '',
    },
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const updateLine = (key: number, patch: Partial<(typeof lines)[number]>) =>
    setLines((old) => old.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const serialList = (line: (typeof lines)[number]) =>
    line.serialNumbers
      .split(/[\n,;]+/)
      .map((serial) => serial.trim())
      .filter(Boolean)
  const cost = (line: (typeof lines)[number]) =>
    returnToStock
      ? returnUnitCost(data, sourceDocumentId, line.skuId, Number(line.quantity), serialList(line))
      : line.unitCost === ''
        ? null
        : Number(line.unitCost)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError('')
    if (type === 'transfer' && targetWarehouseId === warehouseId) {
      setError(t('Kho nguồn và kho đích phải khác nhau.', 'Source and destination must differ.'))
      return
    }
    if (type === 'receipt' && !canCreateStandaloneReceipt && !returnToStock) {
      setError(
        t(
          'Phiếu nhập mua phải được tạo từ đơn mua đã được kế toán duyệt.',
          'Purchase receipts must be created from a purchase order approved by accounting.',
        ),
      )
      return
    }
    if (
      lines.some(
        (line) =>
          !line.skuId ||
          !Number.isSafeInteger(Number(line.quantity)) ||
          Number(line.quantity) === 0 ||
          (type !== 'adjustment' && Number(line.quantity) < 1) ||
          ((type === 'receipt' || (type === 'adjustment' && Number(line.quantity) > 0)) &&
            (cost(line) === null || !Number.isSafeInteger(cost(line)) || Number(cost(line)) < 0)),
      )
    ) {
      setError(
        t(
          'Kiểm tra SKU, số lượng nguyên và giá vốn VND của từng dòng.',
          'Check each SKU, integer quantity and unit cost in VND.',
        ),
      )
      return
    }
    if (returnToStock && new Set(lines.map((line) => line.skuId)).size !== lines.length) {
      setError(
        t(
          'Phiếu trả chỉ dùng một dòng cho mỗi SKU để đối soát giá vốn gốc.',
          'Use one line per SKU on returns to reconcile original carrying cost.',
        ),
      )
      return
    }
    setBusy(true)
    try {
      await run('document.create', {
        type,
        warehouseId,
        ...(type === 'transfer' ? { targetWarehouseId } : {}),
        ...(supplierId && type === 'receipt' ? { supplierId } : {}),
        ...(returnToStock && type === 'receipt' ? { returnToStock: true, sourceDocumentId } : {}),
        reference,
        reason,
        lines: lines.map((line) => ({
          skuId: line.skuId,
          quantity: Number(line.quantity),
          ...(cost(line) !== null &&
          (type === 'receipt' || (type === 'adjustment' && Number(line.quantity) > 0))
            ? { unitCost: cost(line) }
            : {}),
          ...(line.locationId ? { locationId: line.locationId } : {}),
          ...(line.targetLocationId && type === 'transfer'
            ? { targetLocationId: line.targetLocationId }
            : {}),
          ...(line.serialNumbers.trim()
            ? {
                serialNumbers: line.serialNumbers
                  .split(/[\n,;]+/)
                  .map((serial) => serial.trim())
                  .filter(Boolean),
              }
            : {}),
        })),
      })
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tạo được phiếu.', 'Unable to create document.'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={t('Tạo chứng từ kho', 'Create stock document')}
      wide
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="inv-form modal-body" onSubmit={(event) => void submit(event)}>
        <p className="inv-note">
          {t(
            'Phiếu nháp chưa thay đổi tồn. Duyệt và ghi sổ là hai bước riêng; phiếu ghi sổ không thể sửa hoặc xóa.',
            'Drafts do not change stock. Approval and posting are separate; posted documents cannot be edited or deleted.',
          )}
        </p>
        <fieldset disabled={busy} className="inv-form-grid">
          <label>
            <span>{t('Loại chứng từ', 'Document type')}</span>
            <select
              value={type}
              onChange={(event) => {
                const nextType = event.target.value as DocumentType
                setType(nextType)
                setReturnToStock(nextType === 'receipt' && !canCreateStandaloneReceipt)
              }}
            >
              <option value="receipt">
                {canCreateStandaloneReceipt
                  ? t('Nhập kho', 'Receipt')
                  : t('Hàng khách trả', 'Customer return')}
              </option>
              <option value="issue">{t('Xuất kho', 'Issue')}</option>
              <option value="transfer">{t('Điều chuyển', 'Transfer')}</option>
              <option value="adjustment">
                {t('Điều chỉnh có lý do', 'Adjustment with reason')}
              </option>
            </select>
          </label>
          <label>
            <span>{t('Kho nguồn / kho nhập', 'Source / receiving warehouse')}</span>
            <select
              required
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value)
                setLines((old) => old.map((line) => ({ ...line, locationId: '' })))
              }}
            >
              <option value="">{t('Chọn kho', 'Select warehouse')}</option>
              {data.warehouses
                .filter((warehouse) => warehouse.active)
                .map((warehouse) => (
                  <option value={warehouse.id} key={warehouse.id}>
                    {warehouse.code} · {warehouse.name}
                  </option>
                ))}
            </select>
          </label>
          {type === 'transfer' && (
            <label>
              <span>{t('Kho đích', 'Destination')}</span>
              <select
                required
                value={targetWarehouseId}
                onChange={(event) => {
                  setTargetWarehouseId(event.target.value)
                  setLines((old) => old.map((line) => ({ ...line, targetLocationId: '' })))
                }}
              >
                <option value="">{t('Chọn kho đích', 'Select destination')}</option>
                {data.warehouses
                  .filter((warehouse) => warehouse.active && warehouse.id !== warehouseId)
                  .map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} · {warehouse.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {type === 'receipt' && canCreateStandaloneReceipt && (
            <label>
              <span>{t('Nhà cung cấp', 'Supplier')}</span>
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">{t('Không áp dụng', 'Not applicable')}</option>
                {data.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === 'receipt' && canCreateStandaloneReceipt && (
            <label className="inv-checkbox">
              <span>
                {t('Nhập lại hàng đã xuất / khách trả', 'Return previously issued stock')}
              </span>
              <input
                type="checkbox"
                checked={returnToStock}
                onChange={(event) => setReturnToStock(event.target.checked)}
              />
            </label>
          )}
          {type === 'receipt' && !canCreateStandaloneReceipt && (
            <p className="inv-note inv-panel-note">
              {t(
                'Phiếu nhập trong biểu mẫu này chỉ dùng cho hàng khách trả có tham chiếu phiếu xuất gốc.',
                'Receipts in this form are only for customer returns linked to an original issue.',
              )}
            </p>
          )}
          {returnToStock && (
            <label>
              <span>{t('Phiếu xuất gốc đã ghi sổ', 'Original posted issue')}</span>
              <select
                required
                value={sourceDocumentId}
                onChange={(event) => {
                  setSourceDocumentId(event.target.value)
                  setReference(
                    data.documents.find((document) => document.id === event.target.value)?.number ??
                      '',
                  )
                }}
              >
                <option value="">{t('Chọn phiếu xuất', 'Select issue')}</option>
                {data.documents
                  .filter((document) => document.type === 'issue' && document.status === 'posted')
                  .map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.number} · {document.reference}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            <span>{t('Mã tham chiếu / đơn mua', 'Reference / purchase order')}</span>
            <input
              required={returnToStock}
              value={reference}
              maxLength={200}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label>
            <span>
              {t('Lý do nghiệp vụ', 'Business reason')}
              {type === 'adjustment' || returnToStock ? ' *' : ''}
            </span>
            <input
              required={type === 'adjustment' || returnToStock}
              minLength={type === 'adjustment' || returnToStock ? 5 : undefined}
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </fieldset>
        {lines.map((line, index) => {
          const sku = data.skus.find((item) => item.id === line.skuId)
          return (
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
                    {data.skus
                      .filter((item) => item.active)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} · {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>
                    {t('Số lượng', 'Quantity')} {index + 1}
                  </span>
                  <input
                    required
                    type="number"
                    step="1"
                    min={type === 'adjustment' ? undefined : 1}
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                  />
                </label>
                {(type === 'receipt' || (type === 'adjustment' && Number(line.quantity) > 0)) && (
                  <label>
                    <span>
                      {t('Giá vốn / đơn vị (VND)', 'Unit cost (VND)')} {index + 1}
                    </span>
                    <input
                      type="number"
                      required
                      step="1"
                      min="0"
                      readOnly={returnToStock}
                      value={returnToStock ? (cost(line) ?? '') : line.unitCost}
                      onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                    />
                  </label>
                )}
                <label>
                  <span>
                    {t('Vị trí nguồn / nhận', 'Source / receiving location')} {index + 1}
                  </span>
                  <select
                    value={line.locationId}
                    onChange={(event) => updateLine(line.key, { locationId: event.target.value })}
                  >
                    <option value="">{t('Vị trí mặc định', 'Default location')}</option>
                    {data.locations
                      .filter((location) => location.warehouseId === warehouseId)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} · {location.name}
                        </option>
                      ))}
                  </select>
                </label>
                {type === 'transfer' && (
                  <label>
                    <span>
                      {t('Vị trí đích', 'Destination location')} {index + 1}
                    </span>
                    <select
                      value={line.targetLocationId}
                      onChange={(event) =>
                        updateLine(line.key, { targetLocationId: event.target.value })
                      }
                    >
                      <option value="">{t('Vị trí mặc định', 'Default location')}</option>
                      {data.locations
                        .filter((location) => location.warehouseId === targetWarehouseId)
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.code} · {location.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {!!sku?.serialTracked && (
                  <label className="inv-span-all">
                    <span>
                      {t('Serial Number — mỗi dòng một mã', 'Serial numbers — one per line')}{' '}
                      {index + 1}
                    </span>
                    <textarea
                      required
                      rows={3}
                      value={line.serialNumbers}
                      onChange={(event) =>
                        updateLine(line.key, { serialNumbers: event.target.value })
                      }
                    />
                  </label>
                )}
              </div>
              {lines.length > 1 && (
                <button
                  className="button button-secondary"
                  type="button"
                  aria-label={`${t('Xóa dòng', 'Remove line')} ${index + 1}`}
                  onClick={() => setLines((old) => old.filter((item) => item.key !== line.key))}
                >
                  <Trash2 size={14} />
                  {t('Xóa dòng', 'Remove line')}
                </button>
              )}
            </fieldset>
          )
        })}
        <button
          className="button button-secondary"
          disabled={busy || lines.length >= 50}
          type="button"
          onClick={() =>
            setLines((old) => [
              ...old,
              {
                key: Math.max(...old.map((line) => line.key)) + 1,
                skuId: '',
                quantity: '1',
                unitCost: '',
                locationId: '',
                targetLocationId: '',
                serialNumbers: '',
              },
            ])
          }
        >
          <Plus size={14} />
          {t('Thêm dòng hàng', 'Add line')}
        </button>
        {returnToStock && (
          <p className="inv-note">
            {t(
              'Giá vốn được đối soát từ phiếu xuất gốc và các lần trả đã ghi sổ. Chọn đúng SKU, lượng còn được trả và Serial để tính giá; máy chủ sẽ kiểm tra lại khi ghi sổ.',
              'Carrying cost comes from the original issue and posted returns. Select the SKU, remaining return quantity and serials to calculate cost; the server rechecks when posting.',
            )}
          </p>
        )}
        {type === 'adjustment' && (
          <p className="inv-note">
            {t(
              'Số dương để tăng, số âm để giảm. Kiểm kê nên dùng đợt kiểm kê để đối chiếu chênh lệch.',
              'Use positive quantities to increase and negative to decrease. Use stock counts to reconcile count variances.',
            )}
          </p>
        )}
        {error && (
          <p className="inv-error" role="alert">
            {error}
          </p>
        )}
        <div className="inv-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            type="button"
            onClick={onClose}
          >
            {t('Hủy', 'Cancel')}
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? t('Đang tạo…', 'Creating…') : t('Tạo phiếu nháp', 'Create draft')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function CountRecordForm({
  count,
  data,
  run,
  onClose,
}: {
  count: StockCount
  data: InventorySnapshot
  run: RunCommand
  onClose: () => void
}) {
  const { t } = useI18n()
  const positions = count.lines?.length
    ? count.lines
    : data.skus
        .filter((sku) => sku.active)
        .map((sku) => ({ skuId: sku.id, locationId: null, expectedQuantity: 0 }))
  const fields = positions.flatMap((position, index) => [
    {
      name: `line-${index}`,
      label: `${data.skus.find((sku) => sku.id === position.skuId)?.name ?? position.skuId} · ${data.locations.find((location) => location.id === position.locationId)?.code ?? t('Mặc định', 'Default')} (${t('Hệ thống', 'System')}: ${position.expectedQuantity})`,
      type: 'number' as const,
      required: true,
      min: 0,
    },
    ...(position.expectedQuantity === 0
      ? [
          {
            name: `cost-${index}`,
            label: t(
              'Giá vốn đơn vị nếu phát hiện tồn mới (VND)',
              'Unit cost if new stock is found (VND)',
            ),
            type: 'number' as const,
            min: 0,
          },
        ]
      : []),
  ])
  return (
    <SimpleCommandForm
      title={t('Ghi số kiểm kê thực tế', 'Record physical count')}
      action="count.record"
      fields={fields}
      run={run}
      onClose={onClose}
      transform={(values) => ({
        id: count.id,
        lines: positions.map((position, index) => ({
          skuId: position.skuId,
          ...(position.locationId ? { locationId: position.locationId } : {}),
          countedQuantity: values[`line-${index}`],
          ...(values[`cost-${index}`] === undefined ? {} : { unitCost: values[`cost-${index}`] }),
        })),
      })}
    />
  )
}
