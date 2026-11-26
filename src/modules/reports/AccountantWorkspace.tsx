import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { inventoryService } from '../inventory/service'
import type { InventorySnapshot, PurchaseOrder } from '../inventory/types'
import { useAppAccess } from '../operations/access'
import AccountingLedger, { type AccountingLedgerTab } from './AccountingLedger'
import './reports.css'
import './accountant.css'

type Section = 'overview' | 'approvals' | AccountingLedgerTab

const money = (value: number, locale: string) =>
  new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)

const formatDate = (value: string, locale: string) =>
  new Date(value).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

export default function AccountantWorkspace() {
  const { t, locale } = useI18n()
  const permissions = useAppAccess().permissions
  const canApprove = permissions.includes('purchaseOrder.approve')
  const canReadLedger = permissions.includes('accounting.read')
  const [section, setSection] = useState<Section>(canApprove ? 'overview' : 'trial')
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null)
  const [loading, setLoading] = useState(canApprove)
  const [busyOrder, setBusyOrder] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!canApprove) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setSnapshot(await inventoryService.load({ ledgerLimit: 1 }))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được dữ liệu kế toán.', 'Unable to load accounting data.'),
      )
    } finally {
      setLoading(false)
    }
  }, [canApprove, t])

  useEffect(() => {
    if (canApprove) void load()
  }, [canApprove, load])

  const pendingOrders = useMemo(
    () =>
      canApprove
        ? snapshot?.purchaseOrders.filter((order) => order.status === 'draft') ?? []
        : [],
    [canApprove, snapshot],
  )
  const unlinkedDraftReceipts = useMemo(
    () =>
      snapshot?.documents.filter(
        (document) =>
          document.type === 'receipt' &&
          document.status === 'draft' &&
          !document.purchaseOrderId &&
          !document.sourceDocumentId,
      ) ?? [],
    [snapshot],
  )
  const pendingValue = useMemo(
    () =>
      pendingOrders.reduce(
        (total, order) =>
          total + order.lines.reduce((orderTotal, line) => orderTotal + line.quantity * line.unitCost, 0),
        0,
      ),
    [pendingOrders],
  )
  const approvedOrders =
    snapshot?.purchaseOrders.filter((order) => ['approved', 'partial', 'received'].includes(order.status)).length ?? 0

  const approveOrder = async (order: PurchaseOrder) => {
    setBusyOrder(order.id)
    setError('')
    setNotice('')
    try {
      const next = await inventoryService.command('purchaseOrder.approve', { id: order.id })
      setSnapshot(next)
      setNotice(
        t(
          `Đã duyệt đơn ${order.number}. Quản lý kho có thể tiếp tục nhận hàng theo đơn.`,
          `Order ${order.number} approved. The warehouse manager can now receive against it.`,
        ),
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể duyệt đơn mua.', 'Unable to approve purchase order.'),
      )
    } finally {
      setBusyOrder('')
    }
  }

  const supplierName = (order: PurchaseOrder) =>
    snapshot?.suppliers.find((supplier) => supplier.id === order.supplierId)?.name ??
    order.supplierId
  const warehouseName = (order: PurchaseOrder) =>
    snapshot?.warehouses.find((warehouse) => warehouse.id === order.warehouseId)?.name ??
    order.warehouseId
  const skuName = (id: string) =>
    snapshot?.skus.find((sku) => sku.id === id)?.name ?? id

  return (
    <main className="accountant-workspace" aria-label={t('Không gian kế toán', 'Accounting workspace')}>
      <header className="accountant-header">
        <div>
          <span className="accountant-eyebrow">
            <ShieldCheck size={14} />
            {t('KIỂM SOÁT TÀI CHÍNH', 'FINANCIAL CONTROL')}
          </span>
          <h1>{t('Kế toán', 'Accounting')}</h1>
          <p>
            {t(
              'Kiểm tra và duyệt đề xuất mua hàng trước khi kho nhận hàng; theo dõi sổ và số dư kế toán tại cùng một nơi.',
              'Review and approve purchase proposals before stock is received, then monitor journals and balances in one workspace.',
            )}
          </p>
        </div>
        <div className="accountant-control-note">
          <ShieldCheck size={17} />
          <span>
            <strong>{t('Kiểm soát hai bước', 'Two-step control')}</strong>
            <small>{t('Kế toán duyệt · Quản lý kho nhận', 'Accountant approves · Warehouse receives')}</small>
          </span>
        </div>
      </header>

      <div className="accountant-task-layout">
        <nav className="accountant-menu" aria-label={t('Nhiệm vụ kế toán', 'Accounting tasks')}>
          {canApprove && (
            <>
              <span className="accountant-menu-label">{t('CÔNG VIỆC', 'WORKSPACE')}</span>
              <button
                type="button"
                aria-current={section === 'overview' ? 'page' : undefined}
                onClick={() => setSection('overview')}
              >
                <LayoutDashboard size={16} />
                {t('Tổng quan', 'Overview')}
              </button>
              <button
                type="button"
                aria-current={section === 'approvals' ? 'page' : undefined}
                onClick={() => setSection('approvals')}
              >
                <ClipboardCheck size={16} />
                {t('Duyệt mua hàng', 'Purchase approvals')}
                <span className="accountant-menu-count">{pendingOrders.length}</span>
              </button>
            </>
          )}
          {canReadLedger && (
            <>
              <span className="accountant-menu-label">{t('SỔ KẾ TOÁN', 'ACCOUNTING BOOKS')}</span>
              <button
                type="button"
                aria-current={section === 'trial' ? 'page' : undefined}
                onClick={() => setSection('trial')}
              >
                <BarChart3 size={16} />
                {t('Bảng cân đối thử', 'Trial balance')}
              </button>
              <button
                type="button"
                aria-current={section === 'journals' ? 'page' : undefined}
                onClick={() => setSection('journals')}
              >
                <BookOpenCheck size={16} />
                {t('Sổ nhật ký', 'Journal')}
              </button>
              <button
                type="button"
                aria-current={section === 'accounts' ? 'page' : undefined}
                onClick={() => setSection('accounts')}
              >
                <ListChecks size={16} />
                {t('Hệ thống tài khoản', 'Chart of accounts')}
              </button>
            </>
          )}
        </nav>

        <div className="accountant-task-content">
          {(section === 'overview' || section === 'approvals') && error && (
            <div className="accountant-message accountant-message-error" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button type="button" onClick={() => void load()} disabled={loading}>
                {t('Thử lại', 'Retry')}
              </button>
            </div>
          )}
          {(section === 'overview' || section === 'approvals') && notice && (
            <div className="accountant-message accountant-message-success" role="status">
              {notice}
            </div>
          )}

          {canApprove && section === 'overview' && (
            <section className="accountant-overview" aria-label={t('Tổng quan kế toán', 'Accounting overview')}>
              <header className="accountant-section-heading">
                <div>
                  <h2>{t('Công việc kế toán', 'Accounting tasks')}</h2>
                  <p>{t('Theo dõi đề xuất mua và truy cập nhanh các sổ kế toán.', 'Review purchase proposals and open accounting books.')}</p>
                </div>
                <button
                  type="button"
                  className="accounting-secondary-button"
                  onClick={() => void load()}
                  disabled={loading || Boolean(busyOrder)}
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                  {t('Làm mới', 'Refresh')}
                </button>
              </header>
              <div className="accountant-metrics">
                <article>
                  <span><ClipboardCheck size={16} />{t('Chờ duyệt', 'Pending review')}</span>
                  <strong>{loading ? '—' : pendingOrders.length}</strong>
                  <small>{t('Đề xuất mua hàng', 'Purchase proposals')}</small>
                </article>
                <article>
                  <span><BookOpenCheck size={16} />{t('Giá trị chờ duyệt', 'Value awaiting approval')}</span>
                  <strong>{loading ? '—' : money(pendingValue, locale)}</strong>
                  <small>{t('Theo giá đặt hàng', 'Based on ordered value')}</small>
                </article>
                <article>
                  <span><BadgeCheck size={16} />{t('Đơn đã xử lý', 'Processed orders')}</span>
                  <strong>{loading ? '—' : approvedOrders}</strong>
                  <small>{t('Đã duyệt hoặc hoàn tất', 'Approved or completed')}</small>
                </article>
              </div>
              <div className="accountant-shortcuts">
                <button type="button" onClick={() => setSection('approvals')}>
                  <ClipboardCheck size={18} />
                  <span>
                    <strong>{t('Duyệt mua hàng', 'Purchase approvals')}</strong>
                    <small>{t(`${pendingOrders.length} đề xuất đang chờ`, `${pendingOrders.length} proposals awaiting review`)}</small>
                  </span>
                </button>
                {canReadLedger && (
                  <button type="button" onClick={() => setSection('trial')}>
                    <BarChart3 size={18} />
                    <span>
                      <strong>{t('Bảng cân đối thử', 'Trial balance')}</strong>
                      <small>{t('Kiểm tra tổng phát sinh Nợ/Có', 'Review debit and credit totals')}</small>
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}

          {canApprove && section === 'approvals' ? (
        <section className="accountant-approvals" aria-label={t('Đơn mua chờ duyệt', 'Purchase orders awaiting approval')}>
          {unlinkedDraftReceipts.length > 0 && (
            <div className="accountant-receipt-warning" role="note">
              <AlertTriangle size={17} />
              <div>
                <strong>{t('Có phiếu nhập nháp không liên kết đơn mua', 'Unlinked draft receipts found')}</strong>
                <p>
                  {t(
                    'Phiếu PN là chứng từ nhập kho, không phải đơn mua để kế toán duyệt. Nếu đây là hàng bổ sung, nhân viên gửi yêu cầu trong Kho để quản lý lập đơn mua; kế toán duyệt đơn đó trước khi kho nhận hàng.',
                    'A PN receipt is a stock document, not a purchase order for accounting approval. Staff submit restock requests in Inventory for the manager to prepare a purchase order; accounting approves it before the warehouse receives goods.',
                  )}
                </p>
                <ul>
                  {unlinkedDraftReceipts.map((document) => (
                    <li key={document.id}>
                      {document.number} · {formatDate(document.createdAt, locale)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="accountant-section-heading">
            <div>
              <h2>{t('Đề xuất mua hàng', 'Purchase proposals')}</h2>
              <p>{t('Chỉ duyệt sau khi đối chiếu nhà cung cấp, số lượng và đơn giá.', 'Approve only after checking the supplier, quantities and unit costs.')}</p>
            </div>
            <button type="button" className="accounting-secondary-button" onClick={() => void load()} disabled={loading || Boolean(busyOrder)}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              {t('Làm mới', 'Refresh')}
            </button>
          </div>

          {loading && <p className="accountant-empty">{t('Đang tải đề xuất mua hàng…', 'Loading purchase proposals…')}</p>}
          {!loading && pendingOrders.length === 0 && !error && (
            <div className="accountant-empty">
              <BadgeCheck size={26} />
              <strong>{t('Không có đơn mua chờ duyệt', 'No purchase orders need review')}</strong>
              <span>
                {t(
                  'Nhân viên gửi yêu cầu bổ sung trong Kho → quản lý lập đơn mua → kế toán duyệt trước khi kho nhận hàng.',
                  'Staff submit a restock request in Inventory → the manager creates a purchase order → accounting approves before warehouse receipt.',
                )}
              </span>
            </div>
          )}

          {!loading && pendingOrders.length > 0 && (
            <div className="accountant-order-list">
              {pendingOrders.map((order) => {
                const total = order.lines.reduce(
                  (sum, line) => sum + line.quantity * line.unitCost,
                  0,
                )
                return (
                  <article className="accountant-order-card" key={order.id}>
                    <div className="accountant-order-main">
                      <div className="accountant-order-title">
                        <div>
                          <span className="accountant-order-number">{order.number}</span>
                          <span className="accountant-pending-tag">{t('Chờ duyệt', 'Pending review')}</span>
                        </div>
                        <strong>{money(total, locale)}</strong>
                      </div>
                      <div className="accountant-order-meta">
                        <span><small>{t('Nhà cung cấp', 'Supplier')}</small>{supplierName(order)}</span>
                        <span><small>{t('Kho nhận', 'Receiving warehouse')}</small>{warehouseName(order)}</span>
                        <span><small>{t('Ngày lập', 'Created')}</small>{formatDate(order.createdAt, locale)}</span>
                        <span><small>{t('Số mặt hàng', 'Line items')}</small>{order.lines.length}</span>
                      </div>
                      {order.reference && <p className="accountant-order-reference">{t('Tham chiếu', 'Reference')}: {order.reference}</p>}
                      {order.note && <p className="accountant-order-note">{order.note}</p>}
                      <details className="accountant-order-details">
                        <summary>{t('Kiểm tra chi tiết mặt hàng', 'Review line-item details')}</summary>
                        <div className="accountant-line-list">
                          {order.lines.map((line) => (
                            <div key={line.id}>
                              <span><strong>{skuName(line.skuId)}</strong><small>{t('Số lượng', 'Quantity')}: {line.quantity}</small></span>
                              <span>{money(line.unitCost, locale)} × {line.quantity}<strong>{money(line.unitCost * line.quantity, locale)}</strong></span>
                            </div>
                          ))}
                        </div>
                        <small className="accountant-created-by">{t('Người lập', 'Prepared by')}: {order.createdBy}</small>
                      </details>
                    </div>
                    <button
                      type="button"
                      className="accountant-approve-button"
                      disabled={Boolean(busyOrder)}
                      onClick={() => void approveOrder(order)}
                    >
                      {busyOrder === order.id ? <RefreshCw size={15} className="spin" /> : <BadgeCheck size={16} />}
                      {busyOrder === order.id ? t('Đang duyệt…', 'Approving…') : t('Duyệt đơn', 'Approve order')}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
          </section>
          ) : canReadLedger &&
            (section === 'trial' || section === 'journals' || section === 'accounts') ? (
            <AccountingLedger key={section} initialTab={section} showViewSelect={false} />
          ) : null}
        </div>
      </div>
    </main>
  )
}
