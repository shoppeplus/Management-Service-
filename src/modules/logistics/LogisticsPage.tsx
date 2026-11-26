import { AlertTriangle, CheckCircle2, PackageCheck, Plus, Truck } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import { APP_MODE } from '../../services/inboxService'
import { CARRIERS, getCarrier } from '../operations/carriers'
import { operationsErrorMessage } from '../operations/service'
import { useOperations } from '../operations/context'
import { dateTime, money, normalizeSearch, SHIPMENT_TRANSITIONS } from '../operations/domain'
import { operationLabel } from '../operations/labels'
import type { CarrierId, Shipment, ShipmentStatus } from '../operations/types'
import {
  ActivityTimeline,
  DetailDrawer,
  EmptyState,
  Metrics,
  ModulePageHeader,
  RecordLink,
  SearchToolbar,
  StatusBadge,
} from '../operations/ui'

const carrierNames = Object.fromEntries(
  CARRIERS.map((carrier) => [carrier.id, carrier.name]),
) as Partial<Record<CarrierId, string>>
carrierNames.manual = 'Vận chuyển thủ công'

function CreateShipmentForm({
  initialOrderId,
  onClose,
  onCreated,
}: {
  initialOrderId?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { locale, t } = useI18n()
  const { data, inbox, service, run, busy } = useOperations()
  const eligibleOrders = data.orders.filter(
    (order) =>
      order.status === 'packing' &&
      !data.shipments.some(
        (shipment) => shipment.orderId === order.id && shipment.status !== 'cancelled',
      ),
  )
  const [orderId, setOrderId] = useState(
    eligibleOrders.some((order) => order.id === initialOrderId) ? initialOrderId! : '',
  )
  const [carrierId, setCarrierId] = useState<CarrierId>(() =>
    APP_MODE === 'demo' ? 'demo-express' : 'manual',
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const selected = data.orders.find((order) => order.id === orderId)
  const disabled = busy || submitting
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (disabled) return
    if (!eligibleOrders.some((order) => order.id === orderId)) {
      setError(
        t(
          'Chọn một đơn đã đóng gói và chưa có vận đơn hoạt động.',
          'Select a packing order without an active shipment.',
        ),
      )
      return
    }
    setError('')
    setSubmitting(true)
    try {
      let createdId = ''
      const previousIds = new Set(data.shipments.map((shipment) => shipment.id))
      await run(
        async () => {
          const next = await service.createShipment({ orderId, carrierId })
          createdId = next.shipments.find((shipment) => !previousIds.has(shipment.id))?.id || ''
          return next
        },
        APP_MODE === 'demo'
          ? t('Đã tạo vận đơn mô phỏng.', 'Demo shipment created.')
          : t('Đã tạo phiếu vận chuyển nội bộ.', 'Internal shipment record created.'),
      )
      onCreated(createdId)
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={
        APP_MODE === 'demo'
          ? t('Tạo vận đơn Demo', 'Create Demo shipment')
          : t('Tạo phiếu vận chuyển', 'Create shipment record')
      }
      onClose={() => {
        if (!busy && !submitting) onClose()
      }}
    >
      <form className="ops-form" onSubmit={submit}>
        <div className="modal-body">
          <p className="ops-inline-notice">
            {APP_MODE === 'demo'
              ? t(
                  'Adapter mô phỏng: không đặt lấy hàng và không gửi dữ liệu cho hãng vận chuyển thực.',
                  'Simulated adapter: no pickup is booked and no data is sent to a real carrier.',
                )
              : t(
                  'Phiếu này chỉ ghi nhận vận chuyển nội bộ, không kết nối hoặc đặt dịch vụ hãng vận chuyển.',
                  'This record tracks internal fulfillment only; it does not connect to or book a carrier.',
                )}
          </p>
          {eligibleOrders.length ? (
            <>
              <label className="ops-field">
                {t('Đơn hàng sẵn sàng giao', 'Order ready to ship')}
                <select
                  required
                  disabled={disabled}
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                >
                  <option value="">{t('Chọn đơn hàng', 'Select an order')}</option>
                  {eligibleOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.number} ·{' '}
                      {inbox.customers.find((customer) => customer.id === order.customerId)?.name ||
                        order.recipientName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ops-field">
                {APP_MODE === 'demo'
                  ? t('Đơn vị vận chuyển mô phỏng', 'Simulated carrier')
                  : t('Hình thức vận chuyển', 'Fulfillment method')}
                <select
                  disabled={disabled}
                  value={carrierId}
                  onChange={(event) => setCarrierId(event.target.value as CarrierId)}
                >
                  {(APP_MODE === 'demo'
                    ? Object.entries(carrierNames).filter(([id]) => id !== 'manual')
                    : [['manual', t('Ghi nhận nội bộ', 'Internal record')]]
                  ).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="ops-form-hint">
                {APP_MODE === 'demo'
                  ? t(
                      `Giao dự kiến trong ${getCarrier(carrierId)?.deliveryDays || 0} ngày theo đồng hồ Demo.`,
                      `Estimated delivery in ${getCarrier(carrierId)?.deliveryDays || 0} days using the Demo clock.`,
                    )
                  : t(
                      'Không tạo mã vận đơn hoặc ngày giao dự kiến từ hãng.',
                      'No carrier tracking number or estimated delivery date is provided.',
                    )}
              </p>
              {selected && (
                <div className="ops-shipping-preview">
                  <dl className="ops-info-grid">
                    <dt>{t('Người nhận', 'Recipient')}</dt>
                    <dd>{selected.recipientName}</dd>
                    <dt>{t('Điện thoại', 'Phone')}</dt>
                    <dd>{selected.recipientPhone}</dd>
                    <dt>{t('Địa chỉ', 'Address')}</dt>
                    <dd>{selected.shippingAddress}</dd>
                    <dt>{t('Phí đã báo khách', 'Customer shipping fee')}</dt>
                    <dd>{money(selected.shippingFee, locale)}</dd>
                    <dt>{t('Thu hộ dự kiến', 'Expected COD')}</dt>
                    <dd>
                      {money(
                        selected.paymentMethod === 'cod' && selected.paymentStatus === 'unpaid'
                          ? selected.total
                          : 0,
                        locale,
                      )}
                    </dd>
                  </dl>
                  <p className="ops-form-hint">
                    {t(
                      'Phí trong Demo theo đơn hàng, không phải báo giá hãng vận chuyển.',
                      'Demo shipping fees follow the order, not a real carrier quote.',
                    )}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="ops-empty">
              <PackageCheck size={28} />
              <h3>{t('Chưa có đơn sẵn sàng giao', 'No orders ready to ship')}</h3>
              <p>
                {t(
                  'Xác nhận đơn và chuyển sang đóng gói trước khi tạo vận đơn.',
                  'Confirm an order and start packing before creating its shipment.',
                )}
              </p>
              <Link className="button button-secondary" to="/orders">
                {t('Mở đơn hàng', 'Open orders')}
              </Link>
            </div>
          )}
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
            disabled={busy || submitting}
            onClick={onClose}
          >
            {t('Hủy', 'Cancel')}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={disabled || !eligibleOrders.length || !orderId}
          >
            {submitting
              ? t('Đang tạo…', 'Creating…')
              : APP_MODE === 'demo'
                ? t('Tạo vận đơn Demo', 'Create Demo shipment')
                : t('Tạo phiếu vận chuyển', 'Create shipment record')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function LogisticsPage() {
  const { locale, t } = useI18n()
  const { inbox, data, service, busy, run } = useOperations()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ShipmentStatus | 'all'>('all')
  const [carrier, setCarrier] = useState<CarrierId | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [description, setDescription] = useState('')
  const [pendingTransition, setPendingTransition] = useState<ShipmentStatus | null>(null)
  const [error, setError] = useState('')
  const orderFilter = params.get('order')
  const selected = params.get('id')
    ? data.shipments.find((shipment) => shipment.id === params.get('id'))
    : orderFilter
      ? data.shipments
          .filter((shipment) => shipment.orderId === orderFilter)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      : undefined
  const order = data.orders.find((record) => record.id === selected?.orderId)
  const customer = inbox.customers.find((record) => record.id === order?.customerId)
  const query = normalizeSearch(search.trim())
  const shipments = data.shipments
    .filter((shipment) => {
      const relatedOrder = data.orders.find((record) => record.id === shipment.orderId)
      const relatedCustomer = inbox.customers.find(
        (record) => record.id === relatedOrder?.customerId,
      )
      return (
        (!orderFilter || shipment.orderId === orderFilter) &&
        (status === 'all' || shipment.status === status) &&
        (carrier === 'all' || shipment.carrierId === carrier) &&
        (!query ||
          normalizeSearch(
            `${shipment.trackingNumber} ${relatedOrder?.number || ''} ${relatedCustomer?.name || ''} ${relatedOrder?.recipientPhone || ''}`,
          ).includes(query))
      )
    })
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.trackingNumber.localeCompare(a.trackingNumber),
    )
  const openCreate = creating || params.get('create') === '1'
  const closeCreate = () => {
    setCreating(false)
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('create')
      return next
    })
  }
  const select = (id: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('id', id)
      return next
    })
    setDescription('')
    setError('')
    setPendingTransition(null)
  }
  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setCarrier('all')
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('order')
      return next
    })
  }
  const transitionLabel = (next: ShipmentStatus) =>
    APP_MODE === 'demo'
      ? next === 'in_transit'
        ? t('Mô phỏng lấy hàng / giao lại', 'Simulate pickup / retry')
        : next === 'delivered'
          ? t('Mô phỏng giao thành công', 'Simulate successful delivery')
          : next === 'exception'
            ? t('Mô phỏng sự cố giao hàng', 'Simulate delivery exception')
            : next === 'returned'
              ? t('Mô phỏng hoàn hàng', 'Simulate return')
              : t('Hủy vận đơn Demo', 'Cancel Demo shipment')
      : next === 'in_transit'
        ? t('Ghi nhận đang vận chuyển', 'Record in transit')
        : next === 'delivered'
          ? t('Ghi nhận đã giao', 'Record delivered')
          : next === 'exception'
            ? t('Ghi nhận sự cố', 'Record exception')
            : next === 'returned'
              ? t('Ghi nhận hàng hoàn về', 'Record returned')
              : t('Hủy phiếu vận chuyển', 'Cancel shipment record')
  const advance = async (shipment: Shipment, next: ShipmentStatus) => {
    if (busy) return
    if (['exception', 'returned'].includes(next) && !description.trim()) {
      setError(
        t(
          'Nhập lý do sự cố hoặc hoàn hàng để lưu lịch sử.',
          'Enter the exception or return reason for the tracking history.',
        ),
      )
      return
    }
    setError('')
    try {
      await run(
        () => service.advanceShipment(shipment.id, next, description.trim() || undefined),
        t('Đã cập nhật vận đơn và đơn hàng liên quan.', 'Shipment and related order updated.'),
      )
      setDescription('')
      setPendingTransition(null)
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }

  return (
    <div className="ops-page">
      <ModulePageHeader
        eyebrow={t('VẬN HÀNH GIAO NHẬN', 'FULFILMENT OPERATIONS')}
        title={t('Vận chuyển', 'Logistics')}
        description={t(
          'Theo dõi giao nhận, sự cố và hoàn hàng trong một quy trình thống nhất.',
          'Track deliveries, exceptions and returns in a connected workflow.',
        )}
        action={
          <button className="button button-primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            {t('Tạo vận đơn', 'Create shipment')}
          </button>
        }
      />
      <div className="ops-demo-banner">
        <Truck size={19} />
        <div>
          <strong>
            {APP_MODE === 'demo'
              ? t('Vận chuyển mô phỏng', 'Simulated logistics')
              : t('Theo dõi vận chuyển nội bộ', 'Internal fulfillment tracking')}
          </strong>
          <p>
            {APP_MODE === 'demo'
              ? t(
                  'Các hãng Demo không kết nối đơn vị vận chuyển thực. Mọi thao tác chỉ cập nhật dữ liệu Demo.',
                  'Demo carriers have no real carrier connection. Actions update Demo records only.',
                )
              : t(
                  'Trạng thái do nhân viên ghi nhận, không phải dữ liệu hãng vận chuyển. Hàng hoàn cần được xử lý riêng bằng nghiệp vụ kho.',
                  'Staff record these statuses; they are not carrier updates. Returned goods must be processed separately through inventory.',
                )}
          </p>
        </div>
      </div>
      <Metrics
        items={[
          {
            label: t('Chờ lấy hàng', 'Awaiting pickup'),
            value: data.shipments.filter((shipment) => shipment.status === 'ready').length,
            icon: PackageCheck,
            hint: t('Đã tạo vận đơn', 'Shipment created'),
          },
          {
            label: t('Đang vận chuyển', 'In transit'),
            value: data.shipments.filter((shipment) => shipment.status === 'in_transit').length,
            icon: Truck,
            color: 'blue',
            hint: t('Đang trên đường giao', 'Out for delivery'),
          },
          {
            label: t('Giao thành công', 'Delivered'),
            value: data.shipments.filter((shipment) => shipment.status === 'delivered').length,
            icon: CheckCircle2,
            color: 'green',
            hint: t('Đã hoàn tất giao hàng', 'Delivery completed'),
          },
          {
            label: t('Cần xử lý', 'Exceptions'),
            value: data.shipments.filter((shipment) => shipment.status === 'exception').length,
            icon: AlertTriangle,
            color: 'amber',
            hint: t('Có sự cố cần theo dõi', 'Delivery issues to resolve'),
          },
        ]}
      />
      <div className={`ops-split ${selected ? 'has-detail' : ''}`}>
        <section className="ops-card" aria-label={t('Danh sách vận đơn', 'Shipment list')}>
          <div className="ops-card-heading">
            <div>
              <h2>{t('Tất cả vận đơn', 'All shipments')}</h2>
              <span className="ops-muted">
                {t(`${shipments.length} vận đơn`, `${shipments.length} shipments`)}
              </span>
            </div>
            {orderFilter && (
              <button className="button button-secondary" onClick={clearFilters}>
                {t('Bỏ lọc đơn hàng', 'Clear order filter')}
              </button>
            )}
          </div>
          <SearchToolbar
            value={search}
            onChange={setSearch}
            placeholder={t(
              'Tìm vận đơn, mã đơn, khách hàng…',
              'Search tracking, order or customer…',
            )}
          >
            <select
              className="ops-filter-select"
              aria-label={t('Lọc trạng thái vận đơn', 'Filter shipment status')}
              value={status}
              onChange={(event) => setStatus(event.target.value as ShipmentStatus | 'all')}
            >
              <option value="all">{t('Mọi trạng thái', 'All statuses')}</option>
              {(Object.keys(SHIPMENT_TRANSITIONS) as ShipmentStatus[]).map((value) => (
                <option key={value} value={value}>
                  {operationLabel(value, locale)}
                </option>
              ))}
            </select>
            <select
              className="ops-filter-select"
              aria-label={t('Lọc đơn vị vận chuyển', 'Filter carrier')}
              value={carrier}
              onChange={(event) => setCarrier(event.target.value as CarrierId | 'all')}
            >
              <option value="all">{t('Mọi đơn vị', 'All carriers')}</option>
              {Object.entries(carrierNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </SearchToolbar>
          {shipments.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t('Vận đơn', 'Shipment')}</th>
                    <th>{t('Đơn hàng / khách hàng', 'Order / customer')}</th>
                    <th>{t('Trạng thái', 'Status')}</th>
                    <th>{t('Thu hộ', 'COD')}</th>
                    <th>{t('Dự kiến giao', 'Estimated delivery')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => {
                    const relatedOrder = data.orders.find(
                      (record) => record.id === shipment.orderId,
                    )
                    const relatedCustomer = inbox.customers.find(
                      (record) => record.id === relatedOrder?.customerId,
                    )
                    return (
                      <tr
                        key={shipment.id}
                        className={selected?.id === shipment.id ? 'selected' : ''}
                      >
                        <td>
                          <button className="ops-row-link" onClick={() => select(shipment.id)}>
                            {shipment.trackingNumber}
                          </button>
                          <small>{carrierNames[shipment.carrierId]}</small>
                        </td>
                        <td>
                          {relatedOrder?.number || shipment.orderId}
                          <small>{relatedCustomer?.name || relatedOrder?.recipientName}</small>
                        </td>
                        <td>
                          <StatusBadge value={shipment.status} />
                        </td>
                        <td className="ops-nowrap">{money(shipment.codAmount, locale)}</td>
                        <td className="ops-nowrap">
                          {dateTime(shipment.estimatedDeliveryAt, locale)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={t('Không có vận đơn phù hợp', 'No matching shipments')}
              onClear={clearFilters}
            />
          )}
        </section>
        {selected && order && (
          <DetailDrawer
            title={selected.trackingNumber}
            subtitle={
              APP_MODE === 'demo'
                ? t('CHI TIẾT VẬN ĐƠN DEMO', 'DEMO SHIPMENT DETAILS')
                : t('CHI TIẾT PHIẾU VẬN CHUYỂN', 'SHIPMENT RECORD DETAILS')
            }
            onClose={() =>
              setParams((previous) => {
                const next = new URLSearchParams(previous)
                next.delete('id')
                next.delete('order')
                return next
              })
            }
          >
            <section className="ops-detail-section">
              <div className="ops-detail-summary">
                <StatusBadge value={selected.status} />
                {APP_MODE === 'demo' && <span className="ops-demo-label">DEMO</span>}
              </div>
              <p>
                <strong>{carrierNames[selected.carrierId] || selected.carrierId}</strong>
              </p>
              <RecordLink to={`/orders?id=${order.id}`}>{order.number}</RecordLink>
              <RecordLink to={`/customers?id=${order.customerId}`}>
                {customer?.name || order.recipientName}
              </RecordLink>
            </section>
            <section className="ops-detail-section">
              <h3>{t('Thông tin giao nhận', 'Delivery details')}</h3>
              <dl className="ops-info-grid">
                <dt>{t('Người nhận', 'Recipient')}</dt>
                <dd>{order.recipientName}</dd>
                <dt>{t('Điện thoại', 'Phone')}</dt>
                <dd>{order.recipientPhone}</dd>
                <dt>{t('Địa chỉ', 'Address')}</dt>
                <dd>{order.shippingAddress}</dd>
                <dt>{t('Phí vận chuyển', 'Shipping fee')}</dt>
                <dd>{money(selected.shippingFee, locale)}</dd>
                <dt>{t('Thu hộ COD', 'COD amount')}</dt>
                <dd>{money(selected.codAmount, locale)}</dd>
                <dt>
                  {APP_MODE === 'demo'
                    ? t('Dự kiến giao', 'Estimated delivery')
                    : t('Ngày tạo phiếu', 'Record created')}
                </dt>
                <dd>
                  {dateTime(
                    APP_MODE === 'demo' ? selected.estimatedDeliveryAt : selected.createdAt,
                    locale,
                  )}
                </dd>
              </dl>
            </section>
            {SHIPMENT_TRANSITIONS[selected.status].length > 0 && (
              <section className="ops-detail-section">
                <h3>
                  {APP_MODE === 'demo'
                    ? t('Mô phỏng tiến trình', 'Simulate tracking')
                    : t('Ghi nhận tiến trình nội bộ', 'Record internal fulfillment')}
                </h3>
                <label className="ops-field">
                  {t('Ghi chú tiến trình / lý do sự cố', 'Tracking note / exception reason')}
                  <textarea
                    rows={2}
                    maxLength={1000}
                    disabled={busy}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t(
                      'Bắt buộc khi báo sự cố hoặc hoàn hàng…',
                      'Required for an exception or return…',
                    )}
                  />
                </label>
                <div className="ops-record-actions">
                  {SHIPMENT_TRANSITIONS[selected.status].map((next) => (
                    <button
                      className={`button ${next === 'delivered' ? 'button-primary' : 'button-secondary'}`}
                      key={next}
                      disabled={busy}
                      onClick={() => {
                        if (['cancelled', 'delivered', 'returned'].includes(next)) {
                          setPendingTransition(next)
                          setError('')
                        } else void advance(selected, next)
                      }}
                    >
                      {transitionLabel(next)}
                    </button>
                  ))}
                </div>
                {error && !pendingTransition && (
                  <p className="ops-form-error" role="alert">
                    {error}
                  </p>
                )}
              </section>
            )}
            <section className="ops-detail-section">
              <h3>{t('Theo dõi hành trình', 'Tracking history')}</h3>
              <ol className="ops-timeline ops-tracking-events">
                {selected.events
                  .slice()
                  .reverse()
                  .map((event) => (
                    <li key={event.id}>
                      <span className="ops-tracking-dot" />
                      <div>
                        <StatusBadge value={event.status} />
                        <p>{event.description}</p>
                        <time dateTime={event.createdAt}>{dateTime(event.createdAt, locale)}</time>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
            <section className="ops-detail-section">
              <RecordLink to={`/care?customer=${order.customerId}&order=${order.id}&create=1`}>
                {t('Tạo yêu cầu hỗ trợ giao hàng', 'Create delivery support ticket')}
              </RecordLink>
            </section>
            <section className="ops-detail-section">
              <h3>{t('Lịch sử vận hành', 'Operations history')}</h3>
              <ActivityTimeline
                events={data.auditEvents.filter(
                  (event) => event.entity === 'shipment' && event.entityId === selected.id,
                )}
              />
            </section>
          </DetailDrawer>
        )}
      </div>
      {openCreate && (
        <CreateShipmentForm
          initialOrderId={params.get('order') || undefined}
          onClose={closeCreate}
          onCreated={(id) => {
            setCreating(false)
            setParams((previous) => {
              const next = new URLSearchParams(previous)
              next.delete('create')
              if (id) next.set('id', id)
              return next
            })
          }}
        />
      )}
      {selected && pendingTransition && (
        <Modal
          title={transitionLabel(pendingTransition)}
          onClose={() => {
            if (!busy) {
              setPendingTransition(null)
              setError('')
            }
          }}
        >
          <div className="modal-body">
            <p>
              {pendingTransition === 'delivered'
                ? t(
                    'Đơn hàng sẽ chuyển sang đã giao. Nếu thanh toán COD chưa thu, Demo ghi nhận đã thu tiền. Không có giao dịch tiền thực.',
                    'The order will be marked delivered. For unpaid COD orders, the Demo records payment collection. No real funds are transferred.',
                  )
                : pendingTransition === 'returned'
                  ? t(
                      'Đơn sẽ chuyển sang hoàn hàng và sản phẩm được nhập lại kho một lần. Tiền đã thu không tự hoàn; cần ghi nhận hoàn tiền riêng tại đơn hàng.',
                      'The order will be marked returned and items will be restocked once. Collected funds are not automatically refunded; record the refund separately on the order.',
                    )
                  : t(
                      'Hủy vận đơn chờ lấy hàng. Đơn hàng vẫn ở trạng thái đóng gói để có thể tạo vận đơn thay thế.',
                      'Cancel the shipment awaiting pickup. The order remains in packing so a replacement shipment can be created.',
                    )}
            </p>
            {['returned', 'exception'].includes(pendingTransition) && (
              <label className="ops-field">
                {t('Lý do hoàn hàng', 'Return reason')}
                <textarea
                  required
                  rows={2}
                  maxLength={1000}
                  value={description}
                  disabled={busy}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="ops-form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                setPendingTransition(null)
                setError('')
              }}
            >
              {t('Quay lại', 'Go back')}
            </button>
            <button
              className="button button-primary"
              disabled={busy || (pendingTransition === 'returned' && !description.trim())}
              onClick={() => void advance(selected, pendingTransition)}
            >
              {busy
                ? t('Đang xử lý…', 'Processing…')
                : t('Xác nhận mô phỏng', 'Confirm simulation')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
