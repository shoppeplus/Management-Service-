import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ClipboardList,
  PackageCheck,
  Plus,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { EmptyState, Metrics, ModulePageHeader, SearchToolbar } from '../operations/ui'
import { dateTime, money, normalizeSearch } from '../operations/domain'
import { InventoryApiError, inventoryService } from '../inventory/service'
import type { InventorySnapshot } from '../inventory/types'
import type { InventorySalesOrder } from '../inventory/salesTypes'
import { SalesActionForm } from '../inventory/SalesOrderPanel'
import BusinessOrderCreateForm from './BusinessOrderCreateForm'
import { useOperations } from '../operations/context'
import type { CreateOrderInput } from '../operations/types'
import type { OperationsData } from '../operations/types'
import './orders.css'
import '../inventory/inventory.css'

type OrderStatus = InventorySalesOrder['status']
type SalesAction = 'confirm' | 'cancel' | 'fulfill' | 'return'

export default function OrdersPage() {
  const { t, locale } = useI18n()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const {
    inbox,
    data: operationsData,
    service: operationsService,
    busy: operationsBusy,
    run: runOperations,
  } = useOperations()
  const [data, setData] = useState<InventorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [operation, setOperation] = useState<{ id: string; kind: SalesAction } | null>(null)
  const requestGeneration = useRef(0)
  const mutation = useRef(false)
  const createRequested = params.get('create') === '1'
  const initialCustomerId = params.get('customer') || undefined

  const redirectToLogin = useCallback(
    () => navigate('/login', { replace: true, state: { from: pathname } }),
    [navigate, pathname],
  )

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current
    setLoading(true)
    setError('')
    try {
      const next = await inventoryService.load()
      if (generation === requestGeneration.current) setData(next)
    } catch (cause) {
      if (generation !== requestGeneration.current) return
      if (cause instanceof InventoryApiError && cause.status === 401) {
        redirectToLogin()
        return
      }
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được đơn hàng.', 'Unable to load orders.'),
      )
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [redirectToLogin, t])

  useEffect(() => {
    const generation = requestGeneration
    void refresh()
    return () => {
      generation.current++
    }
  }, [refresh])

  useEffect(() => {
    if (createRequested && data) setCreating(true)
  }, [createRequested, data])

  const run = async (action: string, input: Record<string, unknown>) => {
    if (mutation.current || loading)
      throw new Error(t('Vui lòng chờ thao tác đang xử lý.', 'Please wait for the current action.'))
    mutation.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await inventoryService.command(action, input)
      setData(next)
      setNotice(t('Đã cập nhật đơn hàng.', 'Order updated.'))
      return next
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) redirectToLogin()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể cập nhật đơn hàng.', 'Unable to update order.'),
      )
      throw cause
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }

  const orders = useMemo(() => {
    if (!data) return []
    const query = normalizeSearch(search)
    return data.salesOrders
      .filter((order) => {
        if (warehouseFilter && order.warehouseId !== warehouseFilter) return false
        if (statusFilter !== 'all' && order.status !== statusFilter) return false
        if (!query) return true
        const itemText = order.lines.map((line) => `${line.sku} ${line.name}`).join(' ')
        return normalizeSearch(
          `${order.number} ${order.customerReference} ${order.reference} ${itemText}`,
        ).includes(query)
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [data, search, statusFilter, warehouseFilter])

  const selectedOrder = data?.salesOrders.find((order) => order.id === operation?.id)
  const can = (permission: string) =>
    Boolean(
      data?.tenant.config.inventoryEnabled !== false && data?.permissions.includes(permission),
    )
  const statusLabel = (status: OrderStatus) =>
    ({
      draft: t('Nháp', 'Draft'),
      confirmed: t('Đã giữ hàng', 'Reserved'),
      fulfilled: t('Đã xuất kho', 'Fulfilled'),
      returned: t('Đã nhận trả', 'Returned'),
      cancelled: t('Đã hủy', 'Cancelled'),
    })[status]
  const warehouseName = (id: string) =>
    data?.warehouses.find((warehouse) => warehouse.id === id)?.name ?? '—'
  const closeCreate = () => {
    setCreating(false)
    if (createRequested) {
      const next = new URLSearchParams(params)
      next.delete('create')
      next.delete('customer')
      setParams(next, { replace: true })
    }
  }
  const createBusinessOrder = async (input: CreateOrderInput): Promise<OperationsData> => {
    const result = await runOperations(
      () => operationsService.createOrder(input),
      t('Đã tạo đơn nháp.', 'Draft order created.'),
    )
    await refresh()
    return result
  }

  return (
    <main className="ops-page orders-page" aria-label={t('Đơn hàng', 'Orders')}>
      <ModulePageHeader
        eyebrow="SMARTSALES / ORDERS"
        title={t('Đơn hàng', 'Orders')}
        description={t(
          'Quản lý đơn bán và tình trạng xử lý. Sản phẩm, giá bán và số lượng khả dụng được lấy trực tiếp từ danh mục kho.',
          'Manage sales orders and their progress. Products, selling prices and available quantities come directly from inventory.',
        )}
        action={
          <div className="orders-header-actions">
            <button
              className="button button-secondary"
              disabled={loading || busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
              {t('Tải lại', 'Reload')}
            </button>
            <button
              className="button button-primary"
              disabled={!data || loading || busy || !can('salesOrder.create')}
              onClick={() => setCreating(true)}
            >
              <Plus size={16} />
              {t('Tạo đơn hàng', 'Create order')}
            </button>
          </div>
        }
      />
      {error && (
        <div className="orders-notice orders-notice-error" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="orders-notice orders-notice-success" role="status">
          <Check size={16} />
          <span>{notice}</span>
        </div>
      )}
      {!data ? (
        <section className="ops-card orders-loading" aria-live="polite">
          {loading
            ? t('Đang tải đơn hàng…', 'Loading orders…')
            : t('Chưa thể tải dữ liệu đơn hàng.', 'Order data is unavailable.')}
        </section>
      ) : (
        <>
          {loading && (
            <p className="ops-muted" role="status">
              {t('Đang đồng bộ dữ liệu…', 'Syncing data…')}
            </p>
          )}
          <Metrics
            items={[
              {
                label: t('Tất cả đơn', 'All orders'),
                value: data.salesOrders.length,
                icon: ShoppingBag,
              },
              {
                label: t('Đơn nháp', 'Draft orders'),
                value: data.salesOrders.filter((order) => order.status === 'draft').length,
                icon: ClipboardList,
                color: 'amber',
              },
              {
                label: t('Đã giữ hàng', 'Reserved'),
                value: data.salesOrders.filter((order) => order.status === 'confirmed').length,
                icon: PackageCheck,
                color: 'blue',
              },
              {
                label: t('Đã xuất kho', 'Fulfilled'),
                value: data.salesOrders.filter((order) =>
                  ['fulfilled', 'returned'].includes(order.status),
                ).length,
                icon: Check,
                color: 'green',
              },
            ]}
          />
          <section className="ops-card orders-card">
            <div className="ops-card-heading">
              <div>
                <h2>{t('Danh sách đơn hàng', 'Order list')}</h2>
                <span className="ops-muted">
                  {t(`${orders.length} đơn hàng`, `${orders.length} orders`)}
                </span>
              </div>
            </div>
            <SearchToolbar
              value={search}
              onChange={setSearch}
              placeholder={t('Tìm mã đơn, khách hàng, SKU…', 'Search order, customer or SKU…')}
            >
              <select
                className="ops-filter-select"
                aria-label={t('Lọc kho', 'Filter warehouse')}
                value={warehouseFilter}
                onChange={(event) => setWarehouseFilter(event.target.value)}
              >
                <option value="">{t('Tất cả kho', 'All warehouses')}</option>
                {data.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <select
                className="ops-filter-select"
                aria-label={t('Lọc trạng thái đơn hàng', 'Filter order status')}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as OrderStatus | 'all')}
              >
                <option value="all">{t('Mọi trạng thái', 'All statuses')}</option>
                {(
                  ['draft', 'confirmed', 'fulfilled', 'returned', 'cancelled'] as OrderStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </SearchToolbar>
            {orders.length ? (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>{t('Mã đơn', 'Order')}</th>
                      <th>{t('Khách hàng', 'Customer')}</th>
                      <th>{t('Kho', 'Warehouse')}</th>
                      <th>{t('Sản phẩm', 'Products')}</th>
                      <th>{t('Giá trị đơn', 'Order value')}</th>
                      <th>{t('Trạng thái', 'Status')}</th>
                      <th>{t('Thao tác', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.number}</strong>
                          <small>{dateTime(order.createdAt, locale)}</small>
                          {order.reference && <small>{order.reference}</small>}
                        </td>
                        <td>{order.customerReference}</td>
                        <td>{warehouseName(order.warehouseId)}</td>
                        <td className="orders-product-cell">
                          {order.lines.map((line) => (
                            <div key={line.id}>
                              <strong>{line.name}</strong>
                              <small>
                                {line.sku} · {line.quantity} × {money(line.unitPrice, locale)}
                                {line.returnedQuantity > 0
                                  ? ` · ${t('Đã trả', 'Returned')}: ${line.returnedQuantity}`
                                  : ''}
                              </small>
                            </div>
                          ))}
                        </td>
                        <td>
                          {money(
                            order.lines.reduce(
                              (sum, line) => sum + line.quantity * line.unitPrice,
                              0,
                            ),
                            locale,
                          )}
                        </td>
                        <td>
                          <span className={`ops-badge ops-badge-${order.status}`}>
                            <span />
                            {statusLabel(order.status)}
                          </span>
                        </td>
                        <td>
                          <div className="orders-row-actions">
                            {order.status === 'draft' && can('salesOrder.confirm') && (
                              <button
                                disabled={busy}
                                onClick={() => setOperation({ id: order.id, kind: 'confirm' })}
                              >
                                {t('Xác nhận', 'Confirm')}
                              </button>
                            )}
                            {['draft', 'confirmed'].includes(order.status) &&
                              can('salesOrder.cancel') && (
                                <button
                                  disabled={busy}
                                  onClick={() => setOperation({ id: order.id, kind: 'cancel' })}
                                >
                                  {t('Hủy đơn', 'Cancel')}
                                </button>
                              )}
                            {order.status === 'confirmed' && can('salesOrder.fulfill') && (
                              <button
                                disabled={busy}
                                onClick={() => setOperation({ id: order.id, kind: 'fulfill' })}
                              >
                                {t('Xuất kho', 'Fulfill')}
                              </button>
                            )}
                            {order.status === 'fulfilled' &&
                              order.lines.some((line) => line.returnableQuantity > 0) &&
                              can('salesOrder.return') && (
                                <button
                                  disabled={busy}
                                  onClick={() => setOperation({ id: order.id, kind: 'return' })}
                                >
                                  {t('Nhận trả hàng', 'Receive return')}
                                </button>
                              )}
                            {order.fulfillmentDocumentId && (
                              <small className="orders-issue-reference">
                                {t('Phiếu xuất', 'Issue')}:{' '}
                                {data.documents.find(
                                  (document) => document.id === order.fulfillmentDocumentId,
                                )?.number ?? order.fulfillmentDocumentId}
                              </small>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                message={t('Không có đơn hàng phù hợp.', 'No matching orders.')}
                onClear={() => {
                  setSearch('')
                  setWarehouseFilter('')
                  setStatusFilter('all')
                }}
              />
            )}
          </section>
        </>
      )}
      {data && creating && (
        <BusinessOrderCreateForm
          inventory={data}
          inbox={inbox}
          operations={operationsData}
          initialCustomerId={initialCustomerId}
          busy={busy || operationsBusy || loading}
          onClose={closeCreate}
          onCreate={createBusinessOrder}
        />
      )}
      {data && selectedOrder && operation && (
        <SalesActionForm
          key={`${selectedOrder.id}-${operation.kind}`}
          order={selectedOrder}
          data={data}
          kind={operation.kind}
          run={run}
          onClose={() => setOperation(null)}
        />
      )}
    </main>
  )
}
