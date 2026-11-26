import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Warehouse,
  Wallet,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { Modal } from '../../components/shared'
import { Metrics, ModulePageHeader } from '../operations/ui'
import { dateTime, money, normalizeSearch } from '../operations/domain'
import {
  CountRecordForm,
  DocumentForm,
  InventoryConfigForm,
  SetupForm,
  SimpleCommandForm,
} from './InventoryForms'
import type { FormKind } from './InventoryForms'
import { InventoryApiError, inventoryService } from './service'
import type {
  InventorySnapshot,
  PurchaseOrder,
  StockRestockRequest,
  StockBalance,
  StockCount,
  StockDocument,
} from './types'
import './inventory.css'
import InventoryInsights from './InventoryInsights'
import {
  PurchaseOrderCreateForm,
  PurchaseOrderReceiveForm,
  RestockRequestCreateForm,
} from './PurchaseOrderForms'
import ProductImportForm from './ProductImportForm'

type Tab =
  | 'stock'
  | 'documents'
  | 'purchaseOrders'
  | 'warehouses'
  | 'reservations'
  | 'counts'
  | 'serials'
  | 'history'

function Panel({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="inv-panel">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}
function Table({
  columns,
  children,
  empty,
}: {
  columns: string[]
  children: ReactNode
  empty?: string
}) {
  return (
    <div className="inv-table-scroll">
      <table className="inv-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={`${index}-${column}`} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td className="inv-empty" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function InventoryPage({ catalogOnly = false }: { catalogOnly?: boolean }) {
  const { t, locale } = useI18n()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [data, setData] = useState<InventorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [tab, setTab] = useState<Tab>('stock')
  const [form, setForm] = useState<FormKind | null>(null)
  const [editRecord, setEditRecord] = useState<{
    kind: 'warehouse' | 'supplier' | 'sku'
    id: string
  } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [purchaseOrderCreateOpen, setPurchaseOrderCreateOpen] = useState(false)
  const [restockRequestCreateOpen, setRestockRequestCreateOpen] = useState(false)
  const [restockRequestForOrder, setRestockRequestForOrder] =
    useState<StockRestockRequest | null>(null)
  const [purchaseOrderReceive, setPurchaseOrderReceive] = useState<PurchaseOrder | null>(null)
  const [productImportOpen, setProductImportOpen] = useState(false)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<StockDocument | null>(null)
  const [recordCount, setRecordCount] = useState<StockCount | null>(null)
  const [warrantyChange, setWarrantyChange] = useState<string | null>(null)
  const [qualityChange, setQualityChange] = useState<StockBalance | null>(null)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const mutation = useRef(false)
  const requestGeneration = useRef(0)
  const operationGeneration = useRef(0)
  const hadSession = useRef(false)
  const clearWorkspace = useCallback(() => {
    setData(null)
    setForm(null)
    setEditRecord(null)
    setConfigOpen(false)
    setPurchaseOrderCreateOpen(false)
    setRestockRequestCreateOpen(false)
    setRestockRequestForOrder(null)
    setPurchaseOrderReceive(null)
    setProductImportOpen(false)
    setLedgerLoading(false)
    setSelectedDocument(null)
    setRecordCount(null)
    setWarrantyChange(null)
    setQualityChange(null)
    setWarehouseFilter('')
    setCategoryFilter('')
    setSearch('')
    setNotice('')
  }, [])
  const redirectToLogin = useCallback(
    () => navigate('/login', { replace: true, state: { from: pathname } }),
    [navigate, pathname],
  )
  const authExpired = useCallback(() => {
    requestGeneration.current++
    operationGeneration.current++
    mutation.current = false
    clearWorkspace()
    hadSession.current = false
    setLoading(false)
    setBusy(false)
    setConnectionFailed(false)
    setError(
      t(
        'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Đăng nhập lại để tiếp tục.',
        'Your session expired or was revoked. Sign in again to continue.',
      ),
    )
    redirectToLogin()
  }, [clearWorkspace, redirectToLogin, t])
  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current
    setLoading(true)
    setLedgerLoading(false)
    setError('')
    setConnectionFailed(false)
    try {
      const next = await inventoryService.load()
      if (generation === requestGeneration.current) {
        setData(next)
        hadSession.current = true
      }
    } catch (cause) {
      if (generation !== requestGeneration.current) return
      if (cause instanceof InventoryApiError && cause.status === 401) {
        if (hadSession.current) authExpired()
        else {
          clearWorkspace()
          redirectToLogin()
        }
        return
      }
      setConnectionFailed(true)
      setError(cause instanceof Error ? cause.message : 'Inventory API error')
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [authExpired, clearWorkspace, redirectToLogin])
  useEffect(() => {
    const generationRef = requestGeneration
    void refresh()
    return () => {
      generationRef.current++
    }
  }, [refresh])
  const loadOlderLedger = async () => {
    const cursor = data?.pagination?.nextBeforeSequence
    if (!cursor || !data || busy || loading || ledgerLoading) return
    const generation = ++requestGeneration.current
    const operation = ++operationGeneration.current
    const scope = `${data.tenant.id}:${data.actor.userId}`
    setLedgerLoading(true)
    setBusy(true)
    setError('')
    try {
      const page = await inventoryService.load({ ledgerLimit: 200, beforeSequence: cursor })
      if (
        generation !== requestGeneration.current ||
        `${page.tenant.id}:${page.actor.userId}` !== scope
      )
        return
      setData((current) => {
        if (!current || `${current.tenant.id}:${current.actor.userId}` !== scope) return current
        const byId = new Map(current.ledger.map((entry) => [entry.id, entry]))
        for (const entry of page.ledger) byId.set(entry.id, entry)
        return {
          ...current,
          ledger: [...byId.values()].sort((left, right) => right.sequence - left.sequence),
          pagination: page.pagination,
        }
      })
    } catch (cause) {
      if (generation === requestGeneration.current) {
        if (cause instanceof InventoryApiError && cause.status === 401) authExpired()
        else setError(cause instanceof Error ? cause.message : 'Inventory API error')
      }
    } finally {
      if (generation === requestGeneration.current) setLedgerLoading(false)
      if (operation === operationGeneration.current) setBusy(false)
    }
  }
  const run = async (action: string, input: Record<string, unknown>) => {
    if (mutation.current || loading || busy)
      throw new Error(t('Vui lòng chờ thao tác đang xử lý.', 'Please wait for the current action.'))
    if (action !== 'config.update' && !inventoryEnabled)
      throw new Error(
        t(
          'Phân hệ kho đang tắt. Bật lại trong cấu hình doanh nghiệp để tiếp tục.',
          'Inventory is disabled. Re-enable it in business configuration to continue.',
        ),
      )
    mutation.current = true
    const operation = ++operationGeneration.current
    const generation = ++requestGeneration.current
    setLedgerLoading(false)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await inventoryService.command(action, input)
      if (generation !== requestGeneration.current)
        throw new Error(
          t(
            'Phiên hoặc yêu cầu đã thay đổi. Tải lại kho để kiểm tra.',
            'The session or request changed. Reload inventory to verify.',
          ),
        )
      setData(next)
      setNotice(
        t(
          'Máy chủ đã xác nhận thao tác và lưu nhật ký.',
          'The server confirmed the operation and saved its audit log.',
        ),
      )
      return next
    } catch (cause) {
      if (generation === requestGeneration.current) {
        if (cause instanceof InventoryApiError && cause.status === 401) authExpired()
        else setError(cause instanceof Error ? cause.message : 'Inventory API error')
      }
      throw cause
    } finally {
      if (operation === operationGeneration.current) {
        mutation.current = false
        setBusy(false)
      }
    }
  }
  const execute = (action: string, id: string) => {
    void run(action, { id }).catch(() => {})
  }
  const skus = useMemo(
    () =>
      data?.skus.filter(
        (sku) =>
          (!categoryFilter || sku.category === categoryFilter) &&
          (!search || normalizeSearch(`${sku.name} ${sku.sku}`).includes(normalizeSearch(search))),
      ) ?? [],
    [data, categoryFilter, search],
  )
  const skuIds = useMemo(() => new Set(skus.map((sku) => sku.id)), [skus])
  const balances =
    data?.balances.filter(
      (balance) =>
        (!warehouseFilter || balance.warehouseId === warehouseFilter) && skuIds.has(balance.skuId),
    ) ?? []
  const inPeriod = (stamp: string) =>
    (!from || stamp.slice(0, 10) >= from) && (!to || stamp.slice(0, 10) <= to)
  const ledger =
    data?.ledger.filter(
      (entry) =>
        (!warehouseFilter || entry.warehouseId === warehouseFilter) &&
        skuIds.has(entry.skuId) &&
        inPeriod(entry.createdAt),
    ) ?? []
  const documents =
    data?.documents.filter(
      (document) =>
        (!warehouseFilter ||
          document.warehouseId === warehouseFilter ||
          document.targetWarehouseId === warehouseFilter) &&
        document.lines.some((line) => skuIds.has(line.skuId)) &&
        inPeriod(document.createdAt),
    ) ?? []
  const purchaseOrders =
    data?.purchaseOrders?.filter(
      (purchaseOrder) =>
        (!warehouseFilter || purchaseOrder.warehouseId === warehouseFilter) &&
        purchaseOrder.lines.some((line) => skuIds.has(line.skuId)) &&
        inPeriod(purchaseOrder.createdAt),
    ) ?? []
  const purchaseRequests =
    data?.purchaseRequests.filter(
      (request) =>
        (!warehouseFilter || request.warehouseId === warehouseFilter) &&
        inPeriod(request.createdAt),
    ) ?? []
  const canCreateStandaloneReceipt = ['owner', 'admin'].includes(data?.actor.role ?? '')
  const availableBySku = new Map<string, number>()
  balances.forEach((balance) =>
    availableBySku.set(balance.skuId, (availableBySku.get(balance.skuId) ?? 0) + balance.available),
  )
  const lowSkus = skus.filter(
    (sku) => sku.active && (availableBySku.get(sku.id) ?? 0) <= sku.reorderPoint,
  )
  const can = (action: string) => Boolean(data?.permissions.includes(action))
  const inventoryTabs = ([
    ['stock', t('Tồn kho', 'Stock'), []],
    [
      'documents',
      t('Chứng từ', 'Documents'),
      ['document.create', 'document.approve', 'document.post', 'document.cancel', 'document.transfer_receive'],
    ],
    [
      'purchaseOrders',
      t('Đơn mua hàng', 'Purchase orders'),
      [
        'purchaseRequest.create',
        'purchaseRequest.read',
        'purchaseRequest.manage',
        'purchaseOrder.create',
        'purchaseOrder.approve',
        'purchaseOrder.cancel',
        'purchaseOrder.receive',
      ],
    ],
    [
      'warehouses',
      t('Kho & danh mục', 'Warehouses & setup'),
      ['warehouse.create', 'warehouse.update', 'location.create', 'supplier.create', 'supplier.update', 'sku.create', 'sku.update', 'sku.import'],
    ],
    ['reservations', t('Giữ chỗ', 'Reservations'), ['reservation.create', 'reservation.release']],
    ['counts', t('Kiểm kê', 'Counts'), ['count.create', 'count.record', 'count.approve']],
    [
      'serials',
      t('Serial & bảo hành', 'Serials & warranty'),
      ['warranty.create', 'warranty.transition', 'quality.reclassify'],
    ],
    [
      'history',
      t('Sổ kho & nhật ký', 'Ledger & audit'),
      ['document.approve', 'document.post', 'count.approve', 'config.update'],
    ],
  ] as [Tab, string, string[]][]).filter(([key, , permissions]) =>
    key === 'stock' || permissions.some(can),
  )
  const inventoryEnabled = data?.tenant.config.inventoryEnabled !== false
  const warehouseName = (id: string | null) =>
    data?.warehouses.find((warehouse) => warehouse.id === id)?.name ?? '—'
  const skuName = (id: string) => data?.skus.find((sku) => sku.id === id)?.name ?? id
  const locationName = (id: string | null) =>
    data?.locations.find((location) => location.id === id)?.code ?? t('Mặc định', 'Default')
  const statusName = (status: string) =>
    ({
      draft: t('Nháp', 'Draft'),
      approved: t('Đã duyệt', 'Approved'),
      partial: t('Nhận một phần', 'Partially received'),
      posted: t('Đã ghi sổ', 'Posted'),
      in_transit: t('Đang điều chuyển', 'In transit'),
      received: t('Đã nhận', 'Received'),
      cancelled: t('Đã hủy', 'Cancelled'),
      active: t('Đang giữ', 'Active'),
      released: t('Đã giải phóng', 'Released'),
      open: t('Đang mở', 'Open'),
      proposed: t('Đã lập đề xuất', 'Proposed'),
      recorded: t('Đã ghi nhận', 'Recorded'),
      completed: t('Hoàn tất', 'Completed'),
      repairing: t('Đang sửa', 'Repairing'),
      returned: t('Đã trả khách', 'Returned to customer'),
      rejected: t('Từ chối', 'Rejected'),
      in_stock: t('Trong kho', 'In stock'),
      issued: t('Đã xuất', 'Issued'),
      available: t('Khả dụng', 'Available'),
      damaged: t('Hàng lỗi', 'Damaged'),
      warranty: t('Bảo hành', 'Warranty'),
    })[status] ?? status
  const typeName = (type: string) =>
    ({
      receipt: t('Nhập', 'Receipt'),
      issue: t('Xuất', 'Issue'),
      transfer: t('Điều chuyển', 'Transfer'),
      adjustment: t('Điều chỉnh', 'Adjustment'),
      transfer_dispatch: t('Xuất điều chuyển', 'Transfer dispatch'),
      transfer_receive: t('Nhận điều chuyển', 'Transfer receipt'),
      count_adjustment: t('Chênh lệch kiểm kê', 'Count variance'),
      quality_reclassify: t('Phân loại tồn', 'Stock classification'),
    })[type] ?? type
  const empty = t('Chưa có dữ liệu phù hợp.', 'No matching records.')
  const actionButton = (kind: FormKind, action: string, label: string) =>
    can(action) && (
      <button
        className="button button-secondary"
        disabled={busy || loading || !inventoryEnabled}
        onClick={() => setForm(kind)}
      >
        <Plus size={14} />
        {label}
      </button>
    )

  return (
    <main
      className={`ops-page inventory-page ${catalogOnly ? 'inventory-catalog-page' : ''}`}
      aria-label={
        catalogOnly ? t('Sản phẩm', 'Products') : t('Quản lý kho', 'Inventory management')
      }
    >
      <ModulePageHeader
        eyebrow={catalogOnly ? 'SMARTSALES / CATALOG' : 'SMARTSALES / INVENTORY'}
        title={catalogOnly ? t('Sản phẩm', 'Products') : t('Quản lý kho hàng', 'Inventory')}
        description={
          catalogOnly
            ? t(
                'Quản lý danh mục hàng hóa, giá bán và tình trạng tồn kho trong một nơi.',
                'Manage your item catalog, selling prices and stock availability in one place.',
              )
            : t(
                'Theo dõi hàng hóa, nhập xuất, đơn mua và tồn kho trên cùng một màn hình.',
                'Track products, receipts, issues, purchase orders and stock in one workspace.',
              )
        }
        action={
          <div className="inv-actions">
            <button
              className="button button-secondary"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} />
              {t('Tải lại', 'Reload')}
            </button>
          </div>
        }
      />
      {error && (
        <div className="inv-error" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="inv-success" role="status">
          <Check size={17} />
          <span>{notice}</span>
        </div>
      )}
      {loading && data && (
        <p className="inv-note" role="status">
          {t('Đang tải từ máy chủ kho…', 'Loading from inventory server…')}
        </p>
      )}
      {!data ? (
        <section className="inv-panel inv-unavailable">
          {loading ? (
            <p className="inv-note" role="status">
              {t('Đang kiểm tra phiên đăng nhập…', 'Checking your session…')}
            </p>
          ) : (
            <>
              <p className="inv-note">
                {t('Chưa thể tải dữ liệu kho.', 'Inventory data could not be loaded.')}
              </p>
              {connectionFailed && (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={15} />
                  {t('Thử kết nối lại', 'Retry connection')}
                </button>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <div className="inv-tenant">
            <span>
              <ShieldCheck size={15} />
              <strong>{data.tenant.name}</strong>
            </span>
            <span>
              {t('Quyền', 'Role')}: {data.actor.role}
            </span>
            <span>{t('API kho · dữ liệu máy chủ', 'Inventory API · server data')}</span>
          </div>
          {!catalogOnly && (
            <fieldset className="inv-filters" disabled={busy || loading}>
              <label className="inv-search">
                <Search size={16} />
                <input
                  aria-label={t('Tìm tên hàng hoặc SKU', 'Search item or SKU')}
                  placeholder={
                    catalogOnly
                      ? t('Tìm sản phẩm hoặc SKU…', 'Search products or SKU…')
                      : t('Tìm tên hàng hoặc SKU…', 'Search item or SKU…')
                  }
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                <span>{t('Kho', 'Warehouse')}</span>
                <select
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
              </label>
              <label>
                <span>{t('Nhóm hàng', 'Category')}</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="">{t('Tất cả nhóm', 'All categories')}</option>
                  {[...new Set(data.skus.map((sku) => sku.category).filter(Boolean))].map(
                    (category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {!catalogOnly && (
                <>
                  <label>
                    <span>{t('Từ ngày (UTC)', 'From date (UTC)')}</span>
                    <input
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t('Đến ngày (UTC)', 'To date (UTC)')}</span>
                    <input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  </label>
                </>
              )}
            </fieldset>
          )}
          {!catalogOnly && (
            <p className="inv-note">
              {catalogOnly
                ? t(
                    'Danh mục dùng SKU của kho; thao tác thêm và sửa tuân theo quyền được cấp.',
                    'The catalog uses inventory SKUs; adding and editing follow your assigned permissions.',
                  )
                : t(
                    'Tồn kho là số hiện tại. Khoảng ngày lọc chứng từ và sổ biến động theo UTC; không thay đổi số dư hiện tại.',
                    'Stock shows current balances. Date filters apply to documents and ledger in UTC; current balances remain current.',
                  )}
            </p>
          )}
          <Metrics
            items={
              catalogOnly
                ? [
                    { label: t('Sản phẩm', 'Products'), value: skus.length, icon: Boxes },
                    {
                      label: t('Có thể bán', 'Available to sell'),
                      value: [...availableBySku.values()]
                        .reduce((total, quantity) => total + quantity, 0)
                        .toLocaleString(),
                      icon: Warehouse,
                    },
                    {
                      label: t('Nhóm hàng', 'Categories'),
                      value: new Set(skus.map((sku) => sku.category).filter(Boolean)).size,
                      icon: ClipboardList,
                    },
                    {
                      label: t('Sắp hết hàng', 'Low stock'),
                      value: lowSkus.length,
                      icon: AlertTriangle,
                      color: 'amber',
                    },
                  ]
                : [
                    {
                      label: t('SKU đang quản lý', 'Managed SKUs'),
                      value: skus.length,
                      icon: Boxes,
                    },
                    {
                      label: t('Tồn thực tế', 'On hand'),
                      value: balances
                        .reduce((total, balance) => total + balance.onHand, 0)
                        .toLocaleString(),
                      icon: Warehouse,
                    },
                    {
                      label: t('Giá trị tồn (giá vốn)', 'Inventory value (cost)'),
                      value: money(
                        balances.reduce((total, balance) => total + balance.inventoryValue, 0),
                        locale,
                      ),
                      icon: Wallet,
                    },
                    {
                      label: t('SKU chạm ngưỡng nhập', 'SKUs at reorder point'),
                      value: lowSkus.length,
                      hint: t('Theo mức tối thiểu từng SKU', 'Based on each SKU threshold'),
                      icon: AlertTriangle,
                      color: 'amber',
                    },
                  ]
            }
          />
          {!catalogOnly && (
            <div className="inv-summary">
              <span>
                {t('Khả dụng', 'Available')}:{' '}
                <strong>{balances.reduce((total, balance) => total + balance.available, 0)}</strong>
              </span>
              <span>
                {t('Đã giữ chỗ', 'Reserved')}:{' '}
                <strong>{balances.reduce((total, balance) => total + balance.reserved, 0)}</strong>
              </span>
              <span>
                {t('Hàng lỗi / bảo hành', 'Damaged / warranty')}:{' '}
                <strong>
                  {balances.reduce(
                    (total, balance) => total + (balance.damaged ?? 0) + (balance.warranty ?? 0),
                    0,
                  )}
                </strong>
              </span>
              <span>
                <ArrowDownToLine size={14} />
                {t('Giá trị nhập trong kỳ', 'Receipt value in period')}:{' '}
                <strong>
                  {money(
                    data.documents
                      .filter(
                        (document) =>
                          document.type === 'receipt' &&
                          document.status === 'posted' &&
                          document.postedAt &&
                          inPeriod(document.postedAt) &&
                          (!warehouseFilter || document.warehouseId === warehouseFilter),
                      )
                      .flatMap((document) => document.lines)
                      .filter((line) => skuIds.has(line.skuId))
                      .reduce((total, line) => total + (line.inventoryValue ?? 0), 0),
                    locale,
                  )}
                </strong>
              </span>
              <span>
                <ArrowUpFromLine size={14} />
                {t('Giá trị xuất trong kỳ', 'Issue value in period')}:{' '}
                <strong>
                  {money(
                    Math.abs(
                      data.documents
                        .filter(
                          (document) =>
                            document.type === 'issue' &&
                            document.status === 'posted' &&
                            document.postedAt &&
                            inPeriod(document.postedAt) &&
                            (!warehouseFilter || document.warehouseId === warehouseFilter),
                        )
                        .flatMap((document) => document.lines)
                        .filter((line) => skuIds.has(line.skuId))
                        .reduce((total, line) => total + (line.inventoryValue ?? 0), 0),
                    ),
                    locale,
                  )}
                </strong>
              </span>
            </div>
          )}
          {catalogOnly ? (
            <Panel
              title={t('Danh mục sản phẩm', 'Product catalog')}
              action={
                <div className="inv-actions">
                  {can('sku.import') && (
                    <button
                      className="button button-secondary"
                      disabled={busy || loading || !inventoryEnabled}
                      onClick={() => setProductImportOpen(true)}
                    >
                      {t('Nhập từ Excel', 'Import from Excel')}
                    </button>
                  )}
                  {actionButton('sku', 'sku.create', t('Thêm sản phẩm', 'Add product'))}
                </div>
              }
            >
              <Table
                columns={[
                  t('Sản phẩm', 'Product'),
                  'SKU',
                  t('Nhóm hàng', 'Category'),
                  t('Có thể bán', 'Available'),
                  t('Giá bán', 'Selling price'),
                  t('Trạng thái', 'Status'),
                  t('Thao tác', 'Actions'),
                ]}
                empty={!skus.length ? empty : undefined}
              >
                {skus.map((sku) => (
                  <tr key={sku.id}>
                    <td>
                      <strong>{sku.name}</strong>
                      <small>{sku.unit}</small>
                    </td>
                    <td>{sku.sku}</td>
                    <td>{sku.category || '—'}</td>
                    <td>
                      <strong className={lowSkus.includes(sku) ? 'inv-warning-text' : ''}>
                        {availableBySku.get(sku.id) ?? 0}
                      </strong>
                    </td>
                    <td>
                      {sku.priceKnown && sku.price !== undefined
                        ? money(sku.price, locale)
                        : t('Chưa thiết lập', 'Not set')}
                    </td>
                    <td>
                      <span
                        className={`inv-tag ${sku.active ? 'inv-tag-posted' : 'inv-tag-cancelled'}`}
                      >
                        {sku.active
                          ? t('Đang kinh doanh', 'Active')
                          : t('Ngừng kinh doanh', 'Inactive')}
                      </span>
                    </td>
                    <td>
                      {can('sku.update') && (
                        <button
                          className="button button-secondary"
                          disabled={busy || loading || !inventoryEnabled}
                          onClick={() => setEditRecord({ kind: 'sku', id: sku.id })}
                        >
                          {t('Sửa', 'Edit')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>
          ) : (
            <>
              <nav className="inv-tabs" aria-label={t('Chức năng kho', 'Inventory sections')}>
                {inventoryTabs.map(([key, label]) => (
                  <button
                    key={key}
                    aria-current={tab === key ? 'page' : undefined}
                    disabled={busy || loading}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {tab === 'stock' && (
                <>
                  <Panel
                    title={t('Tồn theo SKU · kho · vị trí', 'Stock by SKU · warehouse · location')}
                    action={
                      <div className="inv-actions">
                        {canCreateStandaloneReceipt &&
                          actionButton(
                            'document',
                            'document.create',
                            t('Nhập thêm hàng', 'Receive stock'),
                          )}
                        {actionButton(
                          'document',
                          'document.create',
                          t('Tạo chứng từ', 'Create document'),
                        )}
                      </div>
                    }
                  >
                    <p className="inv-note inv-panel-note">
                      {canCreateStandaloneReceipt
                        ? t(
                            'Mua hàng bổ sung phải theo đơn mua đã được kế toán duyệt; phiếu nhập độc lập dành cho nghiệp vụ do chủ/quản trị viên xử lý. Nhận hàng khách trả theo đơn tại trang Đơn hàng.',
                            'Replenishment purchases must use a purchase order approved by accounting; standalone receipts are for owner/administrator-managed operations. Process customer returns from the Orders page.',
                          )
                        : t(
                            'Mua hàng bổ sung: nhân viên bán gửi yêu cầu, quản lý lập đơn mua, kế toán duyệt rồi kho nhận theo đơn. Không tạo phiếu nhập độc lập; nhận hàng khách trả theo đơn tại trang Đơn hàng.',
                            'For replenishment, sales submits a request, the manager creates a purchase order, accounting approves it, then the warehouse receives against that order. Standalone receipts are unavailable; process customer returns from the Orders page.',
                          )}
                    </p>
                    <Table
                      columns={[
                        t('Hàng hóa', 'Item'),
                        t('Kho / vị trí', 'Warehouse / location'),
                        t('Thực tế', 'On hand'),
                        t('Giữ chỗ', 'Reserved'),
                        t('Lỗi / bảo hành', 'Damaged / warranty'),
                        t('Khả dụng', 'Available'),
                        t('Giá trị', 'Value'),
                        t('Cảnh báo / phân loại', 'Alert / classification'),
                      ]}
                      empty={!balances.length ? empty : undefined}
                    >
                      {balances.map((balance) => {
                        const sku = data.skus.find((item) => item.id === balance.skuId)
                        const low = balance.available <= (sku?.reorderPoint ?? 0)
                        return (
                          <tr key={`${balance.warehouseId}-${balance.locationId}-${balance.skuId}`}>
                            <td>
                              <strong>{sku?.name}</strong>
                              <small>
                                {sku?.sku} · {sku?.unit}
                              </small>
                            </td>
                            <td>
                              {warehouseName(balance.warehouseId)}
                              <small>{locationName(balance.locationId)}</small>
                            </td>
                            <td>{balance.onHand}</td>
                            <td>{balance.reserved}</td>
                            <td>
                              {balance.damaged ?? 0} / {balance.warranty ?? 0}
                            </td>
                            <td>
                              <strong className={low ? 'inv-warning-text' : ''}>
                                {balance.available}
                              </strong>
                            </td>
                            <td>{money(balance.inventoryValue, locale)}</td>
                            <td>
                              {balance.available <= 0 ? (
                                <span className="inv-tag inv-tag-warning">
                                  {t('Hết khả dụng', 'Unavailable')}
                                </span>
                              ) : low ? (
                                <span className="inv-tag inv-tag-warning">
                                  {t('Dưới / chạm mức tối thiểu', 'At / below minimum')}
                                </span>
                              ) : (
                                <span className="inv-tag">
                                  {t('Trong định mức', 'Within threshold')}
                                </span>
                              )}
                              {can('quality.reclassify') && (
                                <button
                                  className="inv-text-button"
                                  disabled={busy || loading || !inventoryEnabled}
                                  onClick={() => setQualityChange(balance)}
                                >
                                  {t('Phân loại hàng', 'Classify stock')}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </Table>
                  </Panel>
                  {!!lowSkus.length && (
                    <Panel title={t('Đề xuất bổ sung theo định mức', 'Replenishment by threshold')}>
                      <p className="inv-note inv-panel-note">
                        {t(
                          'Gợi ý quy tắc: mức tối đa − tồn khả dụng, chưa trừ đơn mua đang chờ. Cần kiểm tra nhu cầu trước khi đặt hàng.',
                          'Rule: maximum stock minus available stock, before pending purchases. Review demand before ordering.',
                        )}
                      </p>
                      <div className="inv-reorder-list">
                        {lowSkus.map((sku) => (
                          <div key={sku.id}>
                            <div>
                              <strong>{sku.name}</strong>
                              <small>
                                {sku.sku} · {t('Tối thiểu', 'Minimum')} {sku.reorderPoint} /{' '}
                                {t('Tối đa', 'Maximum')} {sku.maxStock}
                              </small>
                            </div>
                            <span>
                              {Math.max(0, sku.maxStock - (availableBySku.get(sku.id) ?? 0))}{' '}
                              {sku.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  )}
                  <InventoryInsights data={data} warehouseId={warehouseFilter} skuIds={skuIds} />
                </>
              )}
              {tab === 'documents' && (
                <Panel
                  title={t(
                    'Phiếu nhập · xuất · điều chuyển · điều chỉnh',
                    'Receipts · issues · transfers · adjustments',
                  )}
                  action={actionButton(
                    'document',
                    'document.create',
                    t('Tạo chứng từ', 'Create document'),
                  )}
                >
                  <Table
                    columns={[
                      t('Chứng từ', 'Document'),
                      t('Kho', 'Warehouse'),
                      t('Trạng thái', 'Status'),
                      t('Số dòng', 'Lines'),
                      t('Ngày tạo', 'Created'),
                      t('Thao tác', 'Actions'),
                    ]}
                    empty={!documents.length ? empty : undefined}
                  >
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <button
                            className="inv-text-button"
                            onClick={() => setSelectedDocument(document)}
                          >
                            {document.number}
                          </button>
                          <small>
                            {typeName(document.type)} · {document.reference || '—'}
                          </small>
                        </td>
                        <td>
                          {warehouseName(document.warehouseId)}
                          {document.targetWarehouseId && (
                            <small>→ {warehouseName(document.targetWarehouseId)}</small>
                          )}
                        </td>
                        <td>
                          <span className={`inv-tag inv-tag-${document.status}`}>
                            {statusName(document.status)}
                          </span>
                        </td>
                        <td>{document.lines.length}</td>
                        <td>{dateTime(document.createdAt, locale)}</td>
                        <td>
                          <div className="inv-actions">
                            {document.status === 'draft' && can('document.approve') && (
                              <button
                                className="button button-secondary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() => execute('document.approve', document.id)}
                              >
                                {t('Duyệt', 'Approve')}
                              </button>
                            )}
                            {document.status === 'approved' && can('document.post') && (
                              <button
                                className="button button-primary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() => execute('document.post', document.id)}
                              >
                                {t('Ghi sổ', 'Post')}
                              </button>
                            )}
                            {document.status === 'in_transit' &&
                              can('document.transfer_receive') && (
                                <button
                                  className="button button-primary"
                                  disabled={busy || loading || !inventoryEnabled}
                                  onClick={() => execute('document.transfer_receive', document.id)}
                                >
                                  {t('Nhận hàng', 'Receive')}
                                </button>
                              )}
                            {['draft', 'approved'].includes(document.status) &&
                              can('document.cancel') && (
                                <button
                                  className="button button-secondary"
                                  disabled={busy || loading || !inventoryEnabled}
                                  onClick={() => execute('document.cancel', document.id)}
                                >
                                  {t('Hủy phiếu', 'Cancel')}
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Panel>
              )}
              {tab === 'purchaseOrders' && (
                <Panel
                  title={t(
                    'Đơn mua hàng và tiến độ nhận',
                    'Purchase orders and receiving progress',
                  )}
                  action={
                    <div className="inv-actions">
                      {can('purchaseRequest.create') && (
                        <button
                          className="button button-secondary"
                          disabled={busy || loading || !inventoryEnabled}
                          onClick={() => setRestockRequestCreateOpen(true)}
                        >
                          <ClipboardList size={14} />
                          {t('Tạo yêu cầu nhập hàng', 'Create restock request')}
                        </button>
                      )}
                      {can('purchaseOrder.create') && (
                        <button
                          className="button button-secondary"
                          disabled={busy || loading || !inventoryEnabled}
                          onClick={() => {
                            setRestockRequestForOrder(null)
                            setPurchaseOrderCreateOpen(true)
                          }}
                        >
                          <Plus size={14} />
                          {t('Tạo đơn mua', 'Create purchase order')}
                        </button>
                      )}
                    </div>
                  }
                >
                  <p className="inv-note inv-panel-note">
                    {t(
                      'Số lượng đã nhận chỉ tăng sau khi phiếu nhận được ghi sổ. Có thể nhận nhiều đợt; số đang chờ ghi sổ được giữ riêng để tránh nhận vượt đơn.',
                      'Received quantities increase only after the receiving document is posted. Orders can be received in parts; pending receipts are tracked separately to prevent over-receiving.',
                    )}
                  </p>
                  {can('purchaseRequest.read') && (
                    <>
                      <h3>{t('Yêu cầu bổ sung hàng', 'Restock requests')}</h3>
                      <Table
                        columns={[
                          t('Yêu cầu', 'Request'),
                          t('Kho', 'Warehouse'),
                          t('Sản phẩm cần bổ sung', 'Requested items'),
                          t('Trạng thái', 'Status'),
                          t('Thao tác', 'Actions'),
                        ]}
                        empty={!purchaseRequests.length ? empty : undefined}
                      >
                        {purchaseRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <strong>{request.number}</strong>
                              <small>
                                {request.sourceReference || request.note || t('Không có tham chiếu', 'No reference')}
                              </small>
                              <small>{dateTime(request.createdAt, locale)}</small>
                            </td>
                            <td>{warehouseName(request.warehouseId)}</td>
                            <td>
                              {request.lines.map((line) => (
                                <div key={line.id}>
                                  <strong>{skuName(line.skuId)}</strong>
                                  <small>
                                    {t('Cần bổ sung', 'Requested')}: {line.requestedQuantity}
                                  </small>
                                </div>
                              ))}
                            </td>
                            <td>
                              <span className={`inv-tag inv-tag-${request.status}`}>
                                {statusName(request.status)}
                              </span>
                              {request.purchaseOrderNumber && (
                                <small>
                                  {t('Đơn mua', 'Purchase order')}: {request.purchaseOrderNumber}
                                </small>
                              )}
                            </td>
                            <td>
                              {request.status === 'open' &&
                                can('purchaseRequest.manage') &&
                                can('purchaseOrder.create') && (
                                  <button
                                    className="button button-primary"
                                    disabled={busy || loading || !inventoryEnabled}
                                    onClick={() => {
                                      setRestockRequestForOrder(request)
                                      setPurchaseOrderCreateOpen(true)
                                    }}
                                  >
                                    {t('Lập đề xuất mua', 'Prepare purchase order')}
                                  </button>
                                )}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </>
                  )}
                  <Table
                    columns={[
                      t('Đơn mua / nhà cung cấp', 'Order / supplier'),
                      t('Kho', 'Warehouse'),
                      t('Trạng thái', 'Status'),
                      t(
                        'Hàng hóa · đặt / đã nhận / chờ ghi sổ / còn lại',
                        'Items · ordered / received / pending / outstanding',
                      ),
                      t('Giá trị đặt', 'Ordered value'),
                      t('Thao tác', 'Actions'),
                    ]}
                    empty={!purchaseOrders.length ? empty : undefined}
                  >
                    {purchaseOrders.map((purchaseOrder) => {
                      const pendingDocuments = data.documents.filter(
                        (document) =>
                          document.purchaseOrderId === purchaseOrder.id &&
                          ['draft', 'approved'].includes(document.status),
                      )
                      const canReceive = purchaseOrder.lines.some(
                        (line) =>
                          line.quantity - line.receivedQuantity - line.pendingReceiptQuantity > 0,
                      )
                      return (
                        <tr key={purchaseOrder.id}>
                          <td>
                            <strong>{purchaseOrder.number}</strong>
                            <small>
                              {data.suppliers.find(
                                (supplier) => supplier.id === purchaseOrder.supplierId,
                              )?.name ?? purchaseOrder.supplierId}
                              {purchaseOrder.reference ? ` · ${purchaseOrder.reference}` : ''}
                            </small>
                            <small>{dateTime(purchaseOrder.createdAt, locale)}</small>
                          </td>
                          <td>{warehouseName(purchaseOrder.warehouseId)}</td>
                          <td>
                            <span className={`inv-tag inv-tag-${purchaseOrder.status}`}>
                              {statusName(purchaseOrder.status)}
                            </span>
                          </td>
                          <td>
                            {purchaseOrder.lines.map((line) => (
                              <div key={line.id}>
                                <strong>{skuName(line.skuId)}</strong>
                                <small>
                                  {locationName(line.locationId)} · {line.quantity} /{' '}
                                  {line.receivedQuantity} / {line.pendingReceiptQuantity} /{' '}
                                  {line.outstandingQuantity}
                                </small>
                              </div>
                            ))}
                          </td>
                          <td>
                            {money(
                              purchaseOrder.lines.reduce(
                                (total, line) => total + line.quantity * line.unitCost,
                                0,
                              ),
                              locale,
                            )}
                          </td>
                          <td>
                            <div className="inv-actions">
                              {purchaseOrder.status === 'draft' && can('purchaseOrder.approve') && (
                                <button
                                  className="button button-secondary"
                                  disabled={busy || loading || !inventoryEnabled}
                                  onClick={() => execute('purchaseOrder.approve', purchaseOrder.id)}
                                >
                                  {t('Duyệt đơn', 'Approve order')}
                                </button>
                              )}
                              {['approved', 'partial'].includes(purchaseOrder.status) &&
                                can('purchaseOrder.receive') && (
                                  <button
                                    className="button button-primary"
                                    disabled={busy || loading || !inventoryEnabled || !canReceive}
                                    onClick={() => setPurchaseOrderReceive(purchaseOrder)}
                                  >
                                    {t('Nhận theo đơn', 'Receive order')}
                                  </button>
                                )}
                              {['draft', 'approved'].includes(purchaseOrder.status) &&
                                can('purchaseOrder.cancel') && (
                                  <button
                                    className="button button-secondary"
                                    disabled={
                                      busy ||
                                      loading ||
                                      !inventoryEnabled ||
                                      pendingDocuments.length > 0
                                    }
                                    onClick={() =>
                                      execute('purchaseOrder.cancel', purchaseOrder.id)
                                    }
                                  >
                                    {t('Hủy đơn', 'Cancel order')}
                                  </button>
                                )}
                              {purchaseOrder.receiptDocumentIds.length > 0 && (
                                <button
                                  className="inv-text-button"
                                  disabled={busy || loading}
                                  onClick={() => setTab('documents')}
                                >
                                  {t('Xem phiếu nhận', 'View receiving documents')}
                                </button>
                              )}
                            </div>
                            {pendingDocuments.length > 0 && (
                              <small>
                                {t(
                                  'Có phiếu nhận đang chờ xử lý; hủy phiếu trước khi hủy đơn.',
                                  'Receiving documents are pending; cancel them before cancelling the order.',
                                )}
                              </small>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </Table>
                </Panel>
              )}
              {tab === 'warehouses' && (
                <>
                  <Panel
                    title={t('Cấu hình doanh nghiệp', 'Business configuration')}
                    action={
                      can('config.update') && (
                        <button
                          className="button button-secondary"
                          disabled={busy || loading}
                          onClick={() => setConfigOpen(true)}
                        >
                          {t('Chỉnh cấu hình kho', 'Edit inventory configuration')}
                        </button>
                      )
                    }
                  >
                    <p className="inv-note inv-panel-note">
                      {t('Phân hệ kho', 'Inventory module')}:{' '}
                      <strong>
                        {inventoryEnabled ? t('Đang bật', 'Enabled') : t('Đang tắt', 'Disabled')}
                      </strong>{' '}
                      · {t('Nhiều kho', 'Multiple warehouses')}:{' '}
                      <strong>
                        {data.tenant.config.multiWarehouseEnabled !== false
                          ? t('Đang bật', 'Enabled')
                          : t('Đang tắt', 'Disabled')}
                      </strong>{' '}
                      · {t('Cảnh báo tồn lâu sau', 'Stale stock after')}{' '}
                      <strong>{String(data.tenant.config.staleDays ?? 90)}</strong>{' '}
                      {t('ngày', 'days')}.{' '}
                      {t(
                        'Tắt phân hệ sẽ chặn thao tác nghiệp vụ; người có quyền cấu hình có thể bật lại.',
                        'Disabling the module blocks inventory mutations; users with configuration permission can re-enable it.',
                      )}
                    </p>
                  </Panel>
                  <Panel
                    title={t('Kho và vị trí lưu trữ', 'Warehouses and storage locations')}
                    action={
                      <div className="inv-actions">
                        {actionButton(
                          'location',
                          'location.create',
                          t('Thêm vị trí', 'Add location'),
                        )}
                        {actionButton(
                          'warehouse',
                          'warehouse.create',
                          t('Tạo kho', 'Create warehouse'),
                        )}
                      </div>
                    }
                  >
                    <Table
                      columns={[
                        t('Mã kho', 'Code'),
                        t('Tên / địa chỉ', 'Name / address'),
                        t('Vị trí', 'Locations'),
                        t('Trạng thái', 'Status'),
                        t('Thao tác', 'Actions'),
                      ]}
                      empty={!data.warehouses.length ? empty : undefined}
                    >
                      {data.warehouses.map((warehouse) => (
                        <tr key={warehouse.id}>
                          <td>{warehouse.code}</td>
                          <td>
                            <strong>{warehouse.name}</strong>
                            <small>{warehouse.address || '—'}</small>
                          </td>
                          <td>
                            {data.locations
                              .filter((location) => location.warehouseId === warehouse.id)
                              .map((location) => location.code)
                              .join(', ') || '—'}
                          </td>
                          <td>
                            {warehouse.active
                              ? t('Hoạt động', 'Active')
                              : t('Ngừng hoạt động', 'Inactive')}
                          </td>
                          <td>
                            {can('warehouse.update') && (
                              <button
                                className="button button-secondary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() =>
                                  setEditRecord({ kind: 'warehouse', id: warehouse.id })
                                }
                              >
                                {t('Sửa kho', 'Edit warehouse')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </Panel>
                  <Panel
                    title={t('Danh tính SKU dùng trong kho', 'Inventory SKU identities')}
                    action={actionButton('sku', 'sku.create', t('Đăng ký SKU', 'Register SKU'))}
                  >
                    <p className="inv-note inv-panel-note">
                      {t(
                        'Danh tính hàng hóa cho giao dịch kho. Danh mục sản phẩm, biến thể và thuộc tính động thuộc giai đoạn Sản phẩm.',
                        'Item identities for inventory transactions. Product catalog, variants and dynamic attributes belong to the Product phase.',
                      )}
                    </p>
                    <Table
                      columns={[
                        'SKU',
                        t('Tên hàng', 'Item name'),
                        t('Nhóm', 'Category'),
                        t('Định mức min / max', 'Min / max'),
                        'Serial',
                        t('Trạng thái', 'Status'),
                        t('Thao tác', 'Actions'),
                      ]}
                      empty={!skus.length ? empty : undefined}
                    >
                      {skus.map((sku) => (
                        <tr key={sku.id}>
                          <td>{sku.sku}</td>
                          <td>
                            {sku.name}
                            <small>{sku.unit}</small>
                          </td>
                          <td>{sku.category || '—'}</td>
                          <td>
                            {sku.reorderPoint} / {sku.maxStock}
                          </td>
                          <td>
                            {sku.serialTracked
                              ? t('Bắt buộc', 'Required')
                              : t('Không theo dõi', 'Not tracked')}
                          </td>
                          <td>
                            {sku.active
                              ? t('Hoạt động', 'Active')
                              : t('Ngừng hoạt động', 'Inactive')}
                          </td>
                          <td>
                            {can('sku.update') && (
                              <button
                                className="button button-secondary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() => setEditRecord({ kind: 'sku', id: sku.id })}
                              >
                                {t('Sửa SKU', 'Edit SKU')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </Panel>
                  <Panel
                    title={t('Nhà cung cấp', 'Suppliers')}
                    action={actionButton(
                      'supplier',
                      'supplier.create',
                      t('Thêm nhà cung cấp', 'Add supplier'),
                    )}
                  >
                    <Table
                      columns={[
                        t('Mã', 'Code'),
                        t('Tên', 'Name'),
                        t('Liên hệ', 'Contact'),
                        t('Trạng thái', 'Status'),
                        t('Thao tác', 'Actions'),
                      ]}
                      empty={!data.suppliers.length ? empty : undefined}
                    >
                      {data.suppliers.map((supplier) => (
                        <tr key={supplier.id}>
                          <td>{supplier.code}</td>
                          <td>{supplier.name}</td>
                          <td>
                            {supplier.phone || '—'}
                            <small>{supplier.email}</small>
                          </td>
                          <td>
                            {supplier.active !== false && supplier.active !== 0
                              ? t('Hoạt động', 'Active')
                              : t('Ngừng hoạt động', 'Inactive')}
                          </td>
                          <td>
                            {can('supplier.update') && (
                              <button
                                className="button button-secondary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() => setEditRecord({ kind: 'supplier', id: supplier.id })}
                              >
                                {t('Sửa nhà cung cấp', 'Edit supplier')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </Panel>
                </>
              )}
              {tab === 'reservations' && (
                <Panel
                  title={t('Giữ chỗ tồn kho khả dụng', 'Available stock reservations')}
                  action={actionButton(
                    'reservation',
                    'reservation.create',
                    t('Giữ chỗ', 'Reserve stock'),
                  )}
                >
                  <Table
                    columns={[
                      t('Tham chiếu', 'Reference'),
                      t('Hàng hóa', 'Item'),
                      t('Kho', 'Warehouse'),
                      t('Số lượng', 'Quantity'),
                      t('Trạng thái', 'Status'),
                      t('Thao tác', 'Actions'),
                    ]}
                    empty={!data.reservations.length ? empty : undefined}
                  >
                    {data.reservations
                      .filter(
                        (reservation) =>
                          !warehouseFilter || reservation.warehouseId === warehouseFilter,
                      )
                      .map((reservation) => (
                        <tr key={reservation.id}>
                          <td>{reservation.reference}</td>
                          <td>{skuName(reservation.skuId)}</td>
                          <td>{warehouseName(reservation.warehouseId)}</td>
                          <td>{reservation.quantity}</td>
                          <td>{statusName(reservation.status)}</td>
                          <td>
                            {reservation.status === 'active' && can('reservation.release') && (
                              <button
                                className="button button-secondary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() => execute('reservation.release', reservation.id)}
                              >
                                {t('Giải phóng', 'Release')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </Table>
                </Panel>
              )}
              {tab === 'counts' && (
                <Panel
                  title={t('Kiểm kê và đối soát', 'Physical counts and reconciliation')}
                  action={actionButton(
                    'count',
                    'count.create',
                    t('Tạo đợt kiểm kê', 'Create stock count'),
                  )}
                >
                  <p className="inv-note inv-panel-note">
                    {t(
                      'Ghi số đếm thực tế rồi duyệt chênh lệch. Máy chủ kiểm tra biến động sau thời điểm mở kiểm kê trước khi điều chỉnh.',
                      'Record physical quantities, then approve variances. The server checks stock changes since the count opened before adjusting.',
                    )}
                  </p>
                  <Table
                    columns={[
                      t('Đợt kiểm kê', 'Count'),
                      t('Kho', 'Warehouse'),
                      t('Trạng thái', 'Status'),
                      t('Ngày tạo', 'Created'),
                      t('Thao tác', 'Actions'),
                    ]}
                    empty={!data.counts.length ? empty : undefined}
                  >
                    {data.counts
                      .filter((count) => !warehouseFilter || count.warehouseId === warehouseFilter)
                      .map((count) => (
                        <tr key={count.id}>
                          <td>{count.name}</td>
                          <td>{warehouseName(count.warehouseId)}</td>
                          <td>{statusName(count.status)}</td>
                          <td>{dateTime(count.createdAt, locale)}</td>
                          <td>
                            <div className="inv-actions">
                              {!['approved', 'completed', 'cancelled'].includes(count.status) &&
                                can('count.record') && (
                                  <button
                                    className="button button-secondary"
                                    disabled={busy || loading || !inventoryEnabled}
                                    onClick={() => setRecordCount(count)}
                                  >
                                    <ClipboardList size={14} />
                                    {t('Ghi số đếm', 'Record count')}
                                  </button>
                                )}
                              {!['approved', 'completed', 'cancelled'].includes(count.status) &&
                                can('count.approve') && (
                                  <button
                                    className="button button-primary"
                                    disabled={busy || loading || !inventoryEnabled}
                                    onClick={() => execute('count.approve', count.id)}
                                  >
                                    {t('Duyệt chênh lệch', 'Approve variances')}
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </Table>
                </Panel>
              )}
              {tab === 'serials' && (
                <>
                  <Panel title={t('Truy xuất thiết bị theo Serial', 'Serial traceability')}>
                    <Table
                      columns={[
                        'Serial Number',
                        t('Hàng hóa', 'Item'),
                        t('Kho', 'Warehouse'),
                        t('Trạng thái', 'Status'),
                        t('Nhóm chất lượng', 'Quality bucket'),
                        t('Bảo hành từ ngày xuất', 'Warranty from issue date'),
                      ]}
                      empty={!data.serials.length ? empty : undefined}
                    >
                      {data.serials
                        .filter(
                          (serial) =>
                            skuIds.has(serial.skuId) &&
                            (!warehouseFilter || serial.warehouseId === warehouseFilter),
                        )
                        .map((serial) => (
                          <tr key={serial.id}>
                            <td>
                              <strong>{serial.serialNumber}</strong>
                            </td>
                            <td>{skuName(serial.skuId)}</td>
                            <td>{warehouseName(serial.warehouseId)}</td>
                            <td>{statusName(serial.status)}</td>
                            <td>{serial.qualityStatus ? statusName(serial.qualityStatus) : '—'}</td>
                            <td>
                              {serial.warrantyEndAt
                                ? dateTime(serial.warrantyEndAt, locale)
                                : serial.warrantyMonths === 0
                                  ? t('Không bảo hành', 'No warranty')
                                  : t('Chưa xác định thời hạn', 'Coverage not recorded')}
                              {serial.warrantyStartAt && (
                                <small>
                                  {t('Từ', 'From')} {dateTime(serial.warrantyStartAt, locale)}
                                </small>
                              )}
                            </td>
                          </tr>
                        ))}
                    </Table>
                  </Panel>
                  <Panel
                    title={t('Hồ sơ bảo hành', 'Warranty cases')}
                    action={actionButton(
                      'warranty',
                      'warranty.create',
                      t('Tiếp nhận bảo hành', 'Open warranty case'),
                    )}
                  >
                    <Table
                      columns={[
                        'Serial Number',
                        t('Khách hàng / lỗi', 'Customer / issue'),
                        t('Bảo hành khi tiếp nhận', 'Coverage at intake'),
                        t('Trạng thái', 'Status'),
                        t('Thao tác', 'Actions'),
                      ]}
                      empty={!data.warranties.length ? empty : undefined}
                    >
                      {data.warranties.map((warranty) => (
                        <tr key={warranty.id}>
                          <td>
                            {data.serials.find((serial) => serial.id === warranty.serialId)
                              ?.serialNumber ?? '—'}
                          </td>
                          <td>
                            {warranty.customerName}
                            <small>{warranty.issue}</small>
                          </td>
                          <td>
                            {warranty.warrantyValidAtIntake
                              ? t('Còn hạn khi tiếp nhận', 'Covered at intake')
                              : warranty.warrantyEndsAt
                                ? t('Hết hạn khi tiếp nhận', 'Expired at intake')
                                : t(
                                    'Chưa xác định / không bảo hành',
                                    'Unknown coverage / no warranty',
                                  )}
                            {warranty.warrantyEndsAt && (
                              <small>{dateTime(warranty.warrantyEndsAt, locale)}</small>
                            )}
                          </td>
                          <td>{statusName(warranty.status)}</td>
                          <td>
                            {can('warranty.transition') && warranty.status !== 'returned' && (
                              <button
                                className="button button-secondary"
                                disabled={busy || loading || !inventoryEnabled}
                                onClick={() => setWarrantyChange(warranty.id)}
                              >
                                {t('Cập nhật trạng thái', 'Update status')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </Panel>
                </>
              )}
              {tab === 'history' && (
                <>
                  <Panel title={t('Sổ biến động tồn kho', 'Stock movement ledger')}>
                    <p className="inv-note inv-panel-note">
                      {t(
                        'Hiển thị các biến động đã tải. Dùng Tải biến động cũ hơn để đọc tiếp; bộ lọc áp dụng trên toàn bộ phần sổ đã tải.',
                        'Shows loaded movements. Use Load older movements to continue; filters apply to all loaded entries.',
                      )}
                      {data.pagination?.nextBeforeSequence
                        ? ` (${data.ledger.length} ${t('dòng đã tải', 'loaded entries')})`
                        : ''}
                    </p>
                    <Table
                      columns={[
                        '#',
                        t('Thời gian', 'Time'),
                        t('Nghiệp vụ', 'Operation'),
                        t('Hàng hóa / kho', 'Item / warehouse'),
                        t('Thay đổi', 'Change'),
                        t('Tồn sau', 'Balance after'),
                        t('Giá trị thay đổi', 'Value change'),
                      ]}
                      empty={!ledger.length ? empty : undefined}
                    >
                      {ledger.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.sequence}</td>
                          <td>{dateTime(entry.createdAt, locale)}</td>
                          <td>{typeName(entry.kind)}</td>
                          <td>
                            {skuName(entry.skuId)}
                            <small>
                              {warehouseName(entry.warehouseId)} · {locationName(entry.locationId)}
                            </small>
                          </td>
                          <td className={entry.quantity < 0 ? 'inv-warning-text' : ''}>
                            {entry.quantity > 0 ? '+' : ''}
                            {entry.quantity}
                          </td>
                          <td>{entry.onHandAfter}</td>
                          <td>{money(entry.valueChange, locale)}</td>
                        </tr>
                      ))}
                    </Table>
                    {data.pagination?.nextBeforeSequence && (
                      <div className="inv-pagination">
                        <button
                          className="button button-secondary"
                          disabled={busy || loading || ledgerLoading}
                          onClick={() => void loadOlderLedger()}
                        >
                          {ledgerLoading
                            ? t('Đang tải biến động…', 'Loading movements…')
                            : t('Tải biến động cũ hơn', 'Load older movements')}
                        </button>
                      </div>
                    )}
                  </Panel>
                  <Panel
                    title={t(
                      'Nhật ký thao tác máy chủ · 100 mục gần nhất',
                      'Server audit log · latest 100 entries',
                    )}
                  >
                    <Table
                      columns={[
                        t('Thời gian', 'Time'),
                        t('Thao tác', 'Action'),
                        t('Người thực hiện', 'Actor'),
                        t('Thực thể', 'Entity'),
                      ]}
                      empty={!data.auditEvents.length ? empty : undefined}
                    >
                      {data.auditEvents.slice(0, 100).map((event) => (
                        <tr key={event.id}>
                          <td>{dateTime(event.createdAt, locale)}</td>
                          <td>{event.action}</td>
                          <td>
                            <code>{event.actorId}</code>
                          </td>
                          <td>
                            <code>{event.entityId}</code>
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </Panel>
                </>
              )}
            </>
          )}
          {form === 'document' && (
            <DocumentForm
              data={data}
              run={run}
              onClose={() => setForm(null)}
              canCreateStandaloneReceipt={canCreateStandaloneReceipt}
            />
          )}
          {form && form !== 'document' && (
            <SetupForm kind={form} data={data} run={run} onClose={() => setForm(null)} />
          )}
          {editRecord && (
            <SetupForm
              key={`${editRecord.kind}-${editRecord.id}`}
              kind={editRecord.kind}
              recordId={editRecord.id}
              data={data}
              run={run}
              onClose={() => setEditRecord(null)}
            />
          )}
          {configOpen && (
            <InventoryConfigForm data={data} run={run} onClose={() => setConfigOpen(false)} />
          )}
          {purchaseOrderCreateOpen && (
            <PurchaseOrderCreateForm
              data={data}
              request={restockRequestForOrder ?? undefined}
              run={run}
              onClose={() => {
                setPurchaseOrderCreateOpen(false)
                setRestockRequestForOrder(null)
              }}
            />
          )}
          {restockRequestCreateOpen && (
            <RestockRequestCreateForm
              data={data}
              run={run}
              onClose={() => setRestockRequestCreateOpen(false)}
            />
          )}
          {purchaseOrderReceive && (
            <PurchaseOrderReceiveForm
              key={purchaseOrderReceive.id}
              data={data}
              purchaseOrder={purchaseOrderReceive}
              run={run}
              onClose={() => setPurchaseOrderReceive(null)}
              onReceiptCreated={() => setTab('documents')}
            />
          )}
          {productImportOpen && (
            <ProductImportForm data={data} run={run} onClose={() => setProductImportOpen(false)} />
          )}
          {recordCount && (
            <CountRecordForm
              count={recordCount}
              data={data}
              run={run}
              onClose={() => setRecordCount(null)}
            />
          )}
          {warrantyChange && (
            <SimpleCommandForm
              title={t('Cập nhật bảo hành', 'Update warranty')}
              action="warranty.transition"
              run={run}
              onClose={() => setWarrantyChange(null)}
              fields={[
                {
                  name: 'status',
                  label: t('Trạng thái tiếp theo', 'Next status'),
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'received', label: t('Đã tiếp nhận', 'Received') },
                    { value: 'repairing', label: t('Đang sửa', 'Repairing') },
                    { value: 'completed', label: t('Đã sửa xong', 'Completed') },
                    { value: 'returned', label: t('Đã trả khách', 'Returned to customer') },
                    { value: 'rejected', label: t('Từ chối', 'Rejected') },
                  ].filter((option) => {
                    const current =
                      data.warranties.find((item) => item.id === warrantyChange)?.status ?? ''
                    const transitions: Record<string, string[]> = {
                      received: ['repairing', 'rejected', 'returned'],
                      repairing: ['completed', 'rejected'],
                      completed: ['returned'],
                      rejected: ['returned'],
                    }
                    return transitions[current]?.includes(option.value)
                  }),
                },
                {
                  name: 'note',
                  label: t('Nội dung xử lý', 'Resolution note'),
                  type: 'textarea',
                  required: true,
                },
              ]}
              transform={(values) => ({ ...values, id: warrantyChange })}
            />
          )}
          {qualityChange && (
            <SimpleCommandForm
              title={`${t('Phân loại tồn', 'Classify stock')} · ${skuName(qualityChange.skuId)}`}
              action="quality.reclassify"
              run={run}
              onClose={() => setQualityChange(null)}
              fields={[
                {
                  name: 'from',
                  label: t('Từ nhóm', 'From bucket'),
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'available', label: t('Khả dụng', 'Available') },
                    { value: 'damaged', label: t('Hàng lỗi', 'Damaged') },
                    { value: 'warranty', label: t('Bảo hành', 'Warranty') },
                  ],
                },
                {
                  name: 'to',
                  label: t('Sang nhóm', 'To bucket'),
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'available', label: t('Khả dụng', 'Available') },
                    { value: 'damaged', label: t('Hàng lỗi', 'Damaged') },
                    { value: 'warranty', label: t('Bảo hành', 'Warranty') },
                  ],
                },
                {
                  name: 'quantity',
                  label: t('Số lượng', 'Quantity'),
                  type: 'number',
                  min: 1,
                  initial: '1',
                  required: true,
                },
                {
                  name: 'reason',
                  label: t('Lý do (ít nhất 5 ký tự)', 'Reason (at least 5 characters)'),
                  required: true,
                },
                ...(data.skus.find((sku) => sku.id === qualityChange.skuId)?.serialTracked
                  ? [
                      {
                        name: 'serialNumbers',
                        label: t('Serial, mỗi dòng một mã', 'Serials, one per line'),
                        type: 'textarea' as const,
                        required: true,
                      },
                    ]
                  : []),
              ]}
              transform={(values) => ({
                ...values,
                ...(typeof values.serialNumbers === 'string'
                  ? {
                      serialNumbers: values.serialNumbers
                        .split(/[\n,;]+/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    }
                  : {}),
                warehouseId: qualityChange.warehouseId,
                locationId: qualityChange.locationId,
                skuId: qualityChange.skuId,
              })}
            />
          )}
          {selectedDocument && (
            <Modal
              title={`${selectedDocument.number} · ${typeName(selectedDocument.type)}`}
              wide
              onClose={() => setSelectedDocument(null)}
            >
              <div className="modal-body">
                <p className="inv-note">
                  {warehouseName(selectedDocument.warehouseId)}
                  {selectedDocument.targetWarehouseId
                    ? ` → ${warehouseName(selectedDocument.targetWarehouseId)}`
                    : ''}{' '}
                  · {statusName(selectedDocument.status)}
                </p>
                <p className="inv-note">
                  {selectedDocument.reason || selectedDocument.reference || '—'}
                </p>
                <Table
                  columns={[
                    'SKU',
                    t('Số lượng', 'Quantity'),
                    t('Giá trị ghi sổ', 'Posted value'),
                    'Serial Number',
                  ]}
                >
                  {selectedDocument.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{skuName(line.skuId)}</td>
                      <td>{line.quantity}</td>
                      <td>
                        {line.inventoryValue === null
                          ? t('Chưa ghi sổ', 'Not posted')
                          : money(line.inventoryValue, locale)}
                      </td>
                      <td>{line.serialNumbers.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Modal>
          )}
        </>
      )}
    </main>
  )
}
