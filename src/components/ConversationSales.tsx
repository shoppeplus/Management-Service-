import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { Conversation, Customer } from '../types/inbox'
import type { Product } from '../modules/operations/types'
import type { PurchaseAnalysis } from '../types/purchase'
import type { InventorySnapshot } from '../modules/inventory/types'
import type { SalesOrderSeedLine } from '../modules/inventory/SalesOrderPanel'
import { SalesOrderCreateForm } from '../modules/inventory/SalesOrderPanel'
import { inventoryService, InventoryApiError } from '../modules/inventory/service'
import { analyzePurchaseDemo, conversationRevision } from '../lib/purchase'
import { useI18n } from '../i18n'
import { Modal } from './shared'

interface Props {
  conversation: Conversation
  customer: Customer
  onNotify: (text: string, kind?: 'success' | 'error') => void
  onClose: () => void
}

interface SalesDraft {
  lines: SalesOrderSeedLine[]
  note: string
}

export default function ConversationSales({
  conversation,
  customer,
  onNotify,
  onClose,
}: Props) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [data, setData] = useState<InventorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<PurchaseAnalysis | null>(null)
  const [form, setForm] = useState<SalesDraft | null>(null)
  const [createdId, setCreatedId] = useState('')
  const loadLock = useRef(false)
  const mutationLock = useRef(false)
  const mounted = useRef(true)
  const revision = conversationRevision(conversation)
  const stale = analysis !== null && analysis.revision !== revision
  const inventoryProducts = useMemo(() => {
    if (!data) return []
    return data.skus
      .filter((sku) => sku.active && sku.priceKnown)
      .map((sku): Product => ({
        id: sku.id,
        sku: sku.sku,
        name: sku.name,
        price: sku.price ?? 0,
        stock: data.balances
          .filter((balance) => balance.skuId === sku.id)
          .reduce((total, balance) => total + balance.available, 0),
        imageUrl: sku.metadata?.imageUrl,
        description: sku.metadata?.description,
        unit: sku.unit,
        category: sku.category,
      }))
  }, [data])
  const linked =
    data?.salesOrders.filter((order) => order.reference === `conversation:${conversation.id}`) ?? []
  const created = data?.salesOrders.find((order) => order.id === createdId)
  const load = useCallback(async () => {
    if (loadLock.current) return
    loadLock.current = true
    setLoading(true)
    setError('')
    try {
      const next = await inventoryService.load()
      if (mounted.current) setData(next)
    } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof InventoryApiError && cause.status === 401) {
        navigate('/login', { replace: true, state: { from: '/inbox' } })
      } else {
        setError(cause instanceof Error ? cause.message : 'Inventory API error')
      }
    } finally {
      loadLock.current = false
      if (mounted.current) setLoading(false)
    }
  }, [navigate])
  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
    }
  }, [load])
  const analyze = () => {
    if (!data) return
    setError('')
    try {
      setAnalysis(analyzePurchaseDemo(conversation, inventoryProducts))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tìm được sản phẩm trong tin nhắn.', 'Unable to match products in messages.'),
      )
    }
  }
  const openOrder = (fromAnalysis: boolean) => {
    const suggestions = fromAnalysis && analysis && !stale ? analysis : null
    const lines = suggestions
      ? suggestions.items.map((item) => ({
          skuId: item.productId,
          quantity: item.quantity === null ? '' : String(item.quantity),
        }))
      : []
    const note = suggestions
      ? [
          suggestions.phone ? `${t('Điện thoại', 'Phone')}: ${suggestions.phone.value}` : '',
          suggestions.shippingAddress
            ? `${t('Địa chỉ giao hàng', 'Shipping address')}: ${suggestions.shippingAddress.value}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : ''
    setForm({ lines, note })
  }
  const run = async (action: string, input: Record<string, unknown>) => {
    if (mutationLock.current)
      throw new Error(t('Đơn đang được xử lý.', 'Order is being processed.'))
    mutationLock.current = true
    setError('')
    try {
      const next = await inventoryService.command(action, input)
      if (mounted.current) setData(next)
      onNotify(t('Đơn bán đã được lưu trên hệ thống kho.', 'Sales order saved to the inventory system.'))
      return next
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : t('Không thể lưu đơn.', 'Unable to save order.')
      onNotify(message, 'error')
      throw cause
    } finally {
      mutationLock.current = false
    }
  }
  const summary: Record<PurchaseAnalysis['intent'], string> = {
    purchase: t('Khách có nhu cầu mua hàng', 'Purchase intent detected'),
    inquiry: t('Khách đang tìm hiểu sản phẩm', 'Customer is exploring products'),
    support: t('Khách cần hỗ trợ đơn đã mua', 'Customer needs help with an existing order'),
    none: t('Chưa có nhu cầu mua rõ ràng', 'No clear purchase intent'),
  }
  const statusLabel = (status: (typeof linked)[number]['status']) =>
    ({
      draft: t('Nháp', 'Draft'),
      confirmed: t('Đã giữ hàng', 'Reserved'),
      fulfilled: t('Đã xuất kho', 'Fulfilled'),
      returned: t('Đã nhận trả', 'Returned'),
      cancelled: t('Đã hủy', 'Cancelled'),
    })[status]
  if (form && data) {
    return (
      <SalesOrderCreateForm
        data={data}
        run={run}
        initialCustomerReference={`${customer.name} (${customer.id})`}
        initialReference={`conversation:${conversation.id}`}
        initialNote={form.note}
        initialLines={form.lines}
        onClose={() => setForm(null)}
        onCreated={(id) => {
          setCreatedId(id)
          setForm(null)
        }}
      />
    )
  }
  return (
    <Modal title={t('Tạo đơn nhanh', 'Quick order')} onClose={onClose}>
      <div className="modal-body conversation-sales-dialog">
        <div className="sales-heading">
          <div className="sales-customer-context">
            <ShoppingBag size={18} />
            <div>
              <strong>{customer.name}</strong>
              <p>
                {t('Lên đơn gắn với hội thoại này', 'Create an order linked to this conversation')}
              </p>
            </div>
          </div>
          <button
            className="button button-primary sales-quick-create"
            disabled={loading || !data || !data.permissions.includes('salesOrder.create')}
            onClick={() => openOrder(false)}
          >
            <Plus size={14} />
            {t('Tạo đơn thủ công', 'Create order manually')}
          </button>
        </div>
        {created && (
          <div className="sales-created" role="status">
            <CheckCircle2 size={15} />
            <span>
              {t('Đã tạo đơn nháp', 'Draft created')} <strong>{created.number}</strong>
            </span>
          </div>
        )}
        <div className="sales-body">
          {loading && (
            <p className="sales-muted" role="status">
              <LoaderCircle size={13} className="spin" />
              {t(
                'Đang tải sản phẩm và đơn hàng từ kho…',
                'Loading products and orders from inventory…',
              )}
            </p>
          )}
          {data && (
            <>
              <div className="sales-analysis-controls">
                <span className="sales-mode">
                  {t('Đối chiếu từ khóa trong tin nhắn', 'Match keywords in customer messages')}
                </span>
                <button
                  className="button button-secondary"
                  disabled={inventoryProducts.length === 0}
                  onClick={analyze}
                >
                  <Search size={13} />
                  {analysis
                    ? t('Tìm lại sản phẩm', 'Search again')
                    : t('Tìm sản phẩm trong tin nhắn', 'Find products in messages')}
                </button>
              </div>
              {!inventoryProducts.length && (
                <p className="sales-warning" role="status">
                  {t(
                    'Chưa có sản phẩm đang kinh doanh với giá bán đã thiết lập trong kho.',
                    'There are no active inventory products with a selling price set.',
                  )}
                </p>
              )}
              {!analysis && inventoryProducts.length > 0 && (
                <p className="sales-muted">
                  {t(
                    'Gợi ý chỉ dùng sản phẩm có giá bán trong danh mục kho. Kiểm tra đơn trước khi lưu.',
                    'Suggestions use only products with an inventory selling price. Review each order before saving.',
                  )}
                </p>
              )}
              {stale && (
                <p className="sales-warning" role="status">
                  {t(
                    'Hội thoại đã thay đổi. Phân tích lại để cập nhật nhu cầu mới nhất.',
                    'The conversation has changed. Analyze again for the latest request.',
                  )}
                </p>
              )}
              {analysis && !stale && (
                <div className="purchase-result">
                  <strong className={`purchase-intent intent-${analysis.intent}`}>
                    {summary[analysis.intent]}
                  </strong>
                  <p>{analysis.summary}</p>
                  {analysis.items.map((item) => {
                    const product = inventoryProducts.find((record) => record.id === item.productId)
                    if (!product) return null
                    return (
                      <article className="purchase-product" key={item.productId}>
                        <Package size={15} />
                        <div>
                          <strong>{product.name}</strong>
                          <small>
                            {product.sku} ·{' '}
                            {new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
                              product.price,
                            )}{' '}
                            VND · {t(`Còn ${product.stock}`, `${product.stock} available`)}
                          </small>
                          <span>
                            {t('Số lượng', 'Quantity')}:{' '}
                            {item.quantity ?? t('Chưa rõ — cần nhập', 'Unknown — enter manually')} ·{' '}
                            {item.confidence === 'high'
                              ? t('Có lời đề nghị mua', 'Explicit request')
                              : t('Cần xác nhận nhu cầu', 'Confirm intent')}
                          </span>
                          <blockquote>“{item.quote}”</blockquote>
                          {(product.stock === 0 ||
                            (item.quantity !== null && item.quantity > product.stock)) && (
                            <p className="sales-warning">
                              {t(
                                'Tồn khả dụng chưa đủ. Đơn nháp chưa giữ kho.',
                                'Available stock is insufficient. Draft orders do not reserve inventory.',
                              )}
                            </p>
                          )}
                        </div>
                      </article>
                    )
                  })}
                  {!analysis.items.length && (
                    <p className="sales-muted">
                      {t(
                        'Chưa đủ thông tin để điền sản phẩm. Bạn vẫn có thể chọn sản phẩm thủ công.',
                        'There is not enough information to fill products. You can still select products manually.',
                      )}
                    </p>
                  )}
                  {analysis.items.length > 0 &&
                    ['purchase', 'inquiry'].includes(analysis.intent) && (
                      <div className="inv-actions">
                        <button className="button button-primary" onClick={() => openOrder(true)}>
                          <ShoppingBag size={14} />
                          {t('Điền đơn từ gợi ý', 'Fill order from suggestions')}
                        </button>
                      </div>
                    )}
                </div>
              )}
              <div className="sales-linked-orders">
                <strong>
                  {t('Đơn của hội thoại này', 'Orders in this conversation')}{' '}
                  <span>{linked.length}</span>
                </strong>
                {linked.map((order) => (
                  <Link key={order.id} to="/orders">
                    <span>
                      {order.number} · {statusLabel(order.status)}
                    </span>
                    <strong>
                      {new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(
                        order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
                      )}{' '}
                      VND
                    </strong>
                  </Link>
                ))}
                {!linked.length && (
                  <p className="sales-muted">
                    {t('Chưa có đơn liên kết.', 'No linked orders yet.')}
                  </p>
                )}
              </div>
            </>
          )}
          {error && (
            <div className="sales-warning" role="alert">
              <p>{error}</p>
              <button
                className="button button-secondary"
                disabled={loading}
                onClick={() => void load()}
              >
                <RefreshCw size={12} />
                {t('Tải lại dữ liệu', 'Reload data')}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
