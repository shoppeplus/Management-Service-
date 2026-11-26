import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImageOff,
  LoaderCircle,
  Package,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import type { Customer } from '../types/inbox'
import type { QuotationInput, QuotationParty } from '../types/quotation'
import { operationsErrorMessage } from '../modules/operations/service'
import { quotationCatalogService } from '../services/quotationCatalog'
import type { QuotationCatalog, QuotationCatalogProduct } from '../services/quotationCatalog'
import { InventoryApiError } from '../modules/inventory/service'
import { money } from '../modules/operations/domain'
import { filterQuotationProducts, quotationTotals, validateQuotation } from '../lib/quotation'
import { downloadQuotationPdf } from '../services/quotationPdf'
import { useI18n } from '../i18n'
import { Modal } from './shared'
import '../quotation.css'

interface Props {
  customer?: Pick<Customer, 'name' | 'phone' | 'email' | 'location'>
  conversation?: { id: string }
  initialWarehouseId?: string
  expectedScope?: { tenantId: string; userId: string }
  onSessionExpired?: () => void
  onClose: () => void
  onNotify: (text: string, kind?: 'success' | 'error') => void
}

const PAGE_SIZE = 24

function ProductImage({
  product,
  onUnavailable,
}: {
  product: Pick<QuotationCatalogProduct, 'id' | 'name' | 'imageUrl'>
  onUnavailable: (id: string) => void
}) {
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  return (
    <span className="quotation-product-image">
      {product.imageUrl && !failed ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          onError={() => {
            setFailed(true)
            onUnavailable(product.id)
          }}
        />
      ) : (
        <span className="quotation-no-image">
          <ImageOff size={20} />
          <small>{t('Chưa có ảnh', 'No image')}</small>
        </span>
      )}
    </span>
  )
}

export default function QuotationBuilder({
  customer,
  conversation,
  initialWarehouseId = '',
  expectedScope,
  onSessionExpired,
  onClose,
  onNotify,
}: Props) {
  const { t, locale } = useI18n()
  const expectedTenantId = expectedScope?.tenantId
  const expectedUserId = expectedScope?.userId
  const [catalog, setCatalog] = useState<QuotationCatalog | null>(null)
  const [products, setProducts] = useState<QuotationCatalogProduct[]>([])
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const [step, setStep] = useState<'products' | 'details' | 'review'>('products')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unavailableImages, setUnavailableImages] = useState<Set<string>>(() => new Set())
  const exportLock = useRef(false)
  const selectedSource = useRef(new Map<string, QuotationCatalogProduct>())
  const catalogScope = useRef<string | null>(null)
  const mounted = useRef(true)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [form, setForm] = useState<QuotationInput>(() => {
    const now = new Date()
    const date = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    const expiry = new Date(now)
    expiry.setDate(expiry.getDate() + 7)
    return {
      number: `BG-${date(now).replaceAll('-', '')}-${String(now.getTime()).slice(-4)}`,
      issuedAt: date(now),
      validUntil: date(expiry),
      seller: { name: '', phone: '', email: '', address: '' },
      customer: {
        name: customer?.name ?? '',
        phone: customer?.phone ?? '',
        email: customer?.email ?? '',
        address: customer?.location ?? '',
      },
      conversationId: conversation?.id ?? '',
      items: [],
      discount: 0,
      shippingFee: 0,
      notes: '',
      paymentTerms: '',
      deliveryTerms: '',
    }
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    setNeedsLogin(false)
    quotationCatalogService
      .load(warehouseId ? { warehouseId } : {})
      .then((data) => {
        if (!active) return
        if (
          expectedTenantId &&
          (data.tenant.id !== expectedTenantId || data.actor.userId !== expectedUserId)
        )
          throw new InventoryApiError(
            401,
            'SESSION_CHANGED',
            t(
              'Phiên doanh nghiệp đã thay đổi. Tải lại kho trước khi lập báo giá.',
              'Your business session changed. Reload inventory before preparing a quotation.',
            ),
          )
        const scope = JSON.stringify([data.tenant.id, data.actor.userId])
        const changedScope = catalogScope.current !== scope
        if (changedScope) selectedSource.current.clear()
        catalogScope.current = scope
        setCatalog(data)
        setProducts(data.products)
        setForm((current) => ({
          ...current,
          ...(changedScope
            ? { items: [], seller: { name: data.tenant.name, phone: '', email: '', address: '' } }
            : {}),
        }))
      })
      .catch((cause: unknown) => {
        if (!active) return
        setProducts([])
        setLoadError(operationsErrorMessage(cause, locale))
        if (cause instanceof InventoryApiError && [401, 403].includes(cause.status)) {
          setNeedsLogin(cause.status === 401)
          setCatalog(null)
          catalogScope.current = null
          setForm((current) => ({
            ...current,
            items: [],
            seller: { name: '', phone: '', email: '', address: '' },
          }))
          if (cause.status === 401) onSessionExpired?.()
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reload, locale, warehouseId, expectedTenantId, expectedUserId, onSessionExpired, t])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  const filtered = useMemo(
    () => filterQuotationProducts(products, search, category),
    [products, search, category],
  )
  const categories = useMemo(
    () =>
      [
        ...new Set(
          products
            .map((product) => product.category)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [products],
  )
  const selected = useMemo(() => new Set(form.items.map((item) => item.product.id)), [form.items])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totals = quotationTotals(form)
  const missingImages = form.items.filter(
    (item) => !item.product.imageUrl || unavailableImages.has(item.product.id),
  ).length
  const displayMoney = (value: number) => (Number.isFinite(value) ? money(value, locale) : '—')
  const markImageUnavailable = (id: string) =>
    setUnavailableImages((value) => (value.has(id) ? value : new Set([...value, id])))

  const toggleProduct = (
    product: QuotationCatalogProduct | QuotationInput['items'][number]['product'],
  ) => {
    setError('')
    if (!selected.has(product.id) && form.items.length >= 200) {
      setError(
        t(
          'Mỗi báo giá chọn tối đa 200 sản phẩm.',
          'Each quotation can include up to 200 products.',
        ),
      )
      return
    }
    if (selected.has(product.id)) selectedSource.current.delete(product.id)
    else
      selectedSource.current.set(product.id, {
        ...product,
        warrantyMonths: product.warrantyMonths ?? null,
      })
    setForm((value) => ({
      ...value,
      items: selected.has(product.id)
        ? value.items.filter((item) => item.product.id !== product.id)
        : [...value.items, { product: { ...product, price: product.price ?? NaN }, quantity: 1 }],
    }))
  }
  const updateParty = (
    party: 'seller' | 'customer',
    field: keyof QuotationParty,
    value: string,
  ) => {
    setForm((current) => ({ ...current, [party]: { ...current[party], [field]: value } }))
  }
  const review = () => {
    setError('')
    try {
      if (loading || loadError || !catalog)
        throw new Error(
          t(
            'Tải danh mục kho thành công trước khi lập báo giá.',
            'Load the inventory catalog before preparing a quotation.',
          ),
        )
      if (form.items.some(({ product }) => !Number.isFinite(product.price)))
        throw new Error(
          t(
            'Nhập giá báo cho các sản phẩm chưa có giá bán trước khi tiếp tục.',
            'Enter a quote price for products without a sale price before continuing.',
          ),
        )
      validateQuotation(form)
      setStep('review')
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    }
  }
  const exportPdf = async () => {
    if (exportLock.current) return
    setError('')
    try {
      if (loading || loadError || !catalog)
        throw new Error(
          t(
            'Tải danh mục kho thành công trước khi xuất PDF.',
            'Load the inventory catalog before exporting PDF.',
          ),
        )
      validateQuotation(form)
      exportLock.current = true
      setBusy(true)
      const current = await quotationCatalogService.load(warehouseId ? { warehouseId } : {})
      if (JSON.stringify([current.tenant.id, current.actor.userId]) !== catalogScope.current) {
        setProducts([])
        setCatalog(null)
        setForm((value) => ({ ...value, items: [] }))
        onSessionExpired?.()
        throw new Error(
          t(
            'Phiên doanh nghiệp đã thay đổi. Tải lại kho và chọn lại sản phẩm.',
            'Your business session changed. Reload the catalog and select products again.',
          ),
        )
      }
      if (
        form.items.some(({ product }) => !current.products.some((item) => item.id === product.id))
      )
        throw new Error(
          t(
            'Có SKU đã ngừng hoạt động hoặc không còn được phép báo giá. Tải lại danh mục để kiểm tra.',
            'Some SKUs are no longer active or available for quotation. Reload the catalog to review.',
          ),
        )
      const currentById = new Map(current.products.map((product) => [product.id, product]))
      const publicFields = [
        'sku',
        'name',
        'price',
        'unit',
        'category',
        'description',
        'imageUrl',
        'sourceUrl',
        'warrantyMonths',
        'specifications',
      ] as const
      const changed = form.items.some(({ product }) => {
        const previous = selectedSource.current.get(product.id)
        const next = currentById.get(product.id)!
        return (
          previous &&
          publicFields.some(
            (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
          )
        )
      })
      if (changed) {
        const updatedItems = form.items.map(({ product, quantity }) => {
          const previous = selectedSource.current.get(product.id)
          const next = currentById.get(product.id)!
          const quotePrice = product.price === previous?.price ? (next.price ?? NaN) : product.price
          selectedSource.current.set(product.id, next)
          return { product: { ...next, price: quotePrice }, quantity }
        })
        setCatalog(current)
        setProducts(current.products)
        setForm((value) => ({ ...value, items: updatedItems }))
        setStep('products')
        throw new Error(
          t(
            'Giá hoặc thông tin sản phẩm trong kho đã thay đổi. Kiểm tra lại sản phẩm và báo giá trước khi xuất PDF.',
            'Inventory prices or product details changed. Review the updated products and quotation before exporting PDF.',
          ),
        )
      }
      if (!mounted.current) return
      const result = await downloadQuotationPdf(form)
      if (mounted.current)
        onNotify(
          result.missingImageCount
            ? t(
                `Đã tải PDF báo giá. ${result.missingImageCount} sản phẩm chưa có ảnh, đã được ghi rõ trong file.`,
                `Quotation PDF downloaded. ${result.missingImageCount} products have no image and are labelled in the file.`,
              )
            : t('Đã tải file PDF báo giá.', 'Quotation PDF downloaded.'),
        )
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof InventoryApiError && cause.status === 401) {
          setProducts([])
          setCatalog(null)
          setNeedsLogin(true)
          setLoadError(operationsErrorMessage(cause, locale))
          setForm((value) => ({ ...value, items: [] }))
          onSessionExpired?.()
        }
        const message = operationsErrorMessage(cause, locale)
        setError(message)
        onNotify(message, 'error')
      }
    } finally {
      exportLock.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const partyFields = (party: 'seller' | 'customer') => (
    <section className="quotation-detail-card">
      <h3>
        {party === 'seller'
          ? t('Thông tin bên bán', 'Seller details')
          : t('Khách hàng nhận báo giá', 'Recipient details')}
      </h3>
      {party === 'seller' && (
        <p className="quotation-muted">
          {t(
            'Nhập thông tin liên hệ thực tế để khách phản hồi.',
            'Add your business contact so the customer can respond.',
          )}
        </p>
      )}
      <label className="quotation-field">
        <span>
          {t('Tên', 'Name')} <b>*</b>
        </span>
        <input
          required
          maxLength={160}
          value={form[party].name}
          onChange={(event) => updateParty(party, 'name', event.target.value)}
          aria-label={
            party === 'seller'
              ? t('Tên bên bán', 'Seller name')
              : t('Tên khách nhận báo giá', 'Recipient name')
          }
          placeholder={
            party === 'seller' ? t('Tên cửa hàng / doanh nghiệp', 'Store / company name') : ''
          }
        />
      </label>
      <div className="quotation-field-grid">
        <label className="quotation-field">
          <span>{t('Số điện thoại', 'Phone')}</span>
          <input
            type="tel"
            maxLength={50}
            value={form[party].phone}
            onChange={(event) => updateParty(party, 'phone', event.target.value)}
            aria-label={
              party === 'seller'
                ? t('Điện thoại bên bán', 'Seller phone')
                : t('Điện thoại khách nhận', 'Recipient phone')
            }
          />
        </label>
        <label className="quotation-field">
          <span>Email</span>
          <input
            type="email"
            maxLength={160}
            value={form[party].email}
            onChange={(event) => updateParty(party, 'email', event.target.value)}
            aria-label={
              party === 'seller'
                ? t('Email bên bán', 'Seller email')
                : t('Email khách nhận', 'Recipient email')
            }
          />
        </label>
      </div>
      <label className="quotation-field">
        <span>{t('Địa chỉ', 'Address')}</span>
        <textarea
          rows={2}
          maxLength={300}
          value={form[party].address}
          onChange={(event) => updateParty(party, 'address', event.target.value)}
          aria-label={
            party === 'seller'
              ? t('Địa chỉ bên bán', 'Seller address')
              : t('Địa chỉ khách nhận', 'Recipient address')
          }
        />
      </label>
    </section>
  )

  return (
    <Modal
      title={t('Tạo báo giá sản phẩm', 'Create product quotation')}
      wide
      onClose={() => {
        if (!exportLock.current) onClose()
      }}
    >
      <div className="quotation-builder">
        <div className="quotation-intro">
          <span className="quotation-heading-icon">
            <FileText size={22} />
          </span>
          <div>
            <strong>
              {customer?.name
                ? `${t('Báo giá dành riêng cho', 'A quotation for')} ${customer.name}`
                : t('Từ kho đến báo giá PDF', 'From inventory to quotation PDF')}
            </strong>
            <p>
              {t(
                'Chọn sản phẩm cần tư vấn, kiểm tra thông tin và tải PDF kèm ảnh.',
                'Select products, review the details, and download an illustrated PDF.',
              )}
            </p>
          </div>
        </div>
        <div className="quotation-inventory-source">
          <div>
            <strong>
              {catalog
                ? catalog.tenant.name
                : t('Dữ liệu từ kho doanh nghiệp', 'Business inventory data')}
            </strong>
            <p>
              {catalog
                ? t('Tồn khả dụng được cập nhật lúc', 'Available stock as of') +
                  ` ${new Date(catalog.asOf).toLocaleString(locale)}`
                : t(
                    'Kết nối phiên đăng nhập kho để tải SKU và giá bán.',
                    'Connect your inventory session to load SKUs and sale prices.',
                  )}
            </p>
          </div>
          {catalog && (
            <label>
              <span>{t('Kho báo giá', 'Quotation warehouse')}</span>
              <select
                aria-label={t('Kho báo giá', 'Quotation warehouse')}
                value={warehouseId}
                disabled={loading || busy}
                onChange={(event) => {
                  setWarehouseId(event.target.value)
                  setProducts([])
                  setForm((current) => ({ ...current, items: [] }))
                  setStep('products')
                  setPage(1)
                }}
              >
                <option value="">{t('Tất cả kho đang hoạt động', 'All active warehouses')}</option>
                {catalog.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} · {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <nav className="quotation-steps" aria-label={t('Các bước tạo báo giá', 'Quotation steps')}>
          {(['products', 'details', 'review'] as const).map((value, index) => (
            <button
              key={value}
              type="button"
              aria-current={step === value ? 'step' : undefined}
              disabled={
                busy ||
                loading ||
                (value !== 'products' && (!form.items.length || Boolean(loadError)))
              }
              onClick={() => {
                setError('')
                if (value === 'review') review()
                else setStep(value)
              }}
            >
              <span>{index + 1}</span>
              {value === 'products'
                ? t('Chọn sản phẩm', 'Choose products')
                : value === 'details'
                  ? t('Thông tin & điều khoản', 'Details & terms')
                  : t('Kiểm tra & xuất PDF', 'Review & export')}
            </button>
          ))}
        </nav>
        {error && (
          <p className="quotation-error" role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </p>
        )}

        {step === 'products' && (
          <div className="quotation-selection">
            <section
              className="quotation-catalog"
              aria-label={t('Kho sản phẩm', 'Product catalog')}
            >
              <div className="quotation-section-heading">
                <h3>
                  <Package size={17} />
                  {t('Kho sản phẩm', 'Product catalog')}
                </h3>
                <span>
                  {products.length.toLocaleString(locale)} {t('sản phẩm', 'products')}
                </span>
              </div>
              <div className="quotation-filters">
                <label className="quotation-search">
                  <Search size={16} />
                  <input
                    aria-label={t('Tìm sản phẩm báo giá', 'Search quotation products')}
                    placeholder={t('Tìm tên sản phẩm, mã SKU...', 'Search product name, SKU...')}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPage(1)
                    }}
                  />
                </label>
                <select
                  aria-label={t('Danh mục sản phẩm', 'Product category')}
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="all">{t('Tất cả danh mục', 'All categories')}</option>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              {loading ? (
                <div className="quotation-empty" role="status">
                  <LoaderCircle className="spin" size={26} />
                  {t('Đang tải kho sản phẩm...', 'Loading product catalog...')}
                </div>
              ) : loadError ? (
                <div className="quotation-empty">
                  <p role="alert">{loadError}</p>
                  {needsLogin && (
                    <Link
                      to="/inventory"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-primary"
                    >
                      {t('Mở kho để đăng nhập', 'Open inventory to sign in')}
                    </Link>
                  )}
                  <button
                    className="button button-secondary"
                    onClick={() => setReload((value) => value + 1)}
                  >
                    {t('Tải lại kho', 'Reload catalog')}
                  </button>
                </div>
              ) : !visible.length ? (
                <div className="quotation-empty">
                  <Search size={28} />
                  <strong>{t('Không tìm thấy sản phẩm', 'No products found')}</strong>
                  <p>
                    {t(
                      'Thử tên khác, mã SKU hoặc đổi danh mục.',
                      'Try another name, SKU, or category.',
                    )}
                  </p>
                </div>
              ) : (
                <div className="quotation-product-grid" data-testid="quotation-catalog-items">
                  {visible.map((product) => (
                    <button
                      type="button"
                      className={`quotation-product-card ${selected.has(product.id) ? 'is-selected' : ''}`}
                      key={product.id}
                      aria-pressed={selected.has(product.id)}
                      aria-label={`${selected.has(product.id) ? t('Bỏ chọn', 'Deselect') : t('Chọn', 'Select')} ${product.name}`}
                      onClick={() => toggleProduct(product)}
                    >
                      <ProductImage product={product} onUnavailable={markImageUnavailable} />
                      <span className="quotation-product-check">
                        {selected.has(product.id) && <Check size={13} />}
                      </span>
                      <span className="quotation-product-info">
                        <small>{product.sku}</small>
                        <strong>{product.name}</strong>
                        <b>
                          {product.price === null
                            ? t('Chưa có giá bán', 'Sale price not set')
                            : money(product.price, locale)}
                        </b>
                        {product.description && (
                          <span className="quotation-card-description">{product.description}</span>
                        )}
                        <span>
                          {t('Khả dụng', 'Available')}: {product.stock}
                          {product.unit ? ` ${product.unit}` : ''}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!loading && !loadError && filtered.length > 0 && (
                <div className="quotation-pagination">
                  <span>
                    {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filtered.length)} /{' '}
                    {filtered.length.toLocaleString(locale)}
                  </span>
                  <div>
                    <button
                      className="icon-button"
                      disabled={currentPage === 1}
                      aria-label={t('Trang sản phẩm trước', 'Previous product page')}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <span>
                      {currentPage} / {pageCount}
                    </span>
                    <button
                      className="icon-button"
                      disabled={currentPage === pageCount}
                      aria-label={t('Trang sản phẩm sau', 'Next product page')}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </section>
            <aside
              className="quotation-basket"
              aria-label={t('Sản phẩm đã chọn', 'Selected products')}
            >
              <div className="quotation-section-heading">
                <h3>
                  <ShoppingBag size={17} />
                  {t('Đã chọn', 'Selected')}
                </h3>
                <span className="quotation-count">{form.items.length} / 200</span>
              </div>
              {form.items.length ? (
                <div className="quotation-selected-list">
                  {form.items.map(({ product, quantity }) => (
                    <div className="quotation-selected-item" key={product.id}>
                      <ProductImage product={product} onUnavailable={markImageUnavailable} />
                      <div className="quotation-selected-info">
                        <strong>{product.name}</strong>
                        <small>{product.sku}</small>
                        <label className="quotation-line-price">
                          <span>{t('Giá báo (₫)', 'Quote price (₫)')}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            required
                            aria-label={`${t('Giá báo', 'Quote price')} ${product.name}`}
                            value={Number.isFinite(product.price) ? product.price : ''}
                            placeholder={t('Nhập giá bán', 'Enter sale price')}
                            onChange={(event) =>
                              setForm((value) => ({
                                ...value,
                                items: value.items.map((item) =>
                                  item.product.id === product.id
                                    ? {
                                        ...item,
                                        product: {
                                          ...item.product,
                                          price:
                                            event.target.value === ''
                                              ? NaN
                                              : Number(event.target.value),
                                        },
                                      }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <div className="quotation-quantity">
                          <label>
                            {t('Số lượng', 'Qty')}
                            <input
                              type="number"
                              min={1}
                              max={999}
                              step={1}
                              aria-label={`${t('Số lượng', 'Quantity')} ${product.name}`}
                              value={Number.isFinite(quantity) ? quantity : ''}
                              onChange={(event) =>
                                setForm((value) => ({
                                  ...value,
                                  items: value.items.map((item) =>
                                    item.product.id === product.id
                                      ? {
                                          ...item,
                                          quantity:
                                            event.target.value === ''
                                              ? NaN
                                              : Number(event.target.value),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`${t('Xóa', 'Remove')} ${product.name}`}
                            onClick={() => toggleProduct(product)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="quotation-basket-empty">
                  <ShoppingBag size={32} />
                  <strong>
                    {t('Chọn đúng sản phẩm khách cần', 'Choose what your customer needs')}
                  </strong>
                  <p>
                    {t(
                      'Sản phẩm đã chọn được giữ lại khi tìm kiếm hoặc chuyển trang.',
                      'Your selection stays when searching or changing pages.',
                    )}
                  </p>
                </div>
              )}
              <div className="quotation-basket-total">
                <span>{t('Tạm tính', 'Subtotal')}</span>
                <strong>{displayMoney(totals.subtotal)}</strong>
              </div>
              <p className="quotation-footnote">
                {t(
                  'Báo giá không giữ tồn kho. Số lượng có thể lớn hơn tồn kho hiện tại.',
                  'Quotations do not reserve stock. Quantities can exceed current stock.',
                )}
              </p>
            </aside>
          </div>
        )}

        {step === 'details' && (
          <fieldset className="quotation-details" disabled={busy}>
            <div className="quotation-detail-columns">
              {partyFields('seller')}
              {partyFields('customer')}
            </div>
            <section className="quotation-detail-card">
              <h3>{t('Thông tin báo giá', 'Quotation details')}</h3>
              <div className="quotation-field-grid quotation-field-grid-three">
                <label className="quotation-field">
                  <span>
                    {t('Mã báo giá', 'Quotation number')} <b>*</b>
                  </span>
                  <input
                    maxLength={60}
                    required
                    value={form.number}
                    onChange={(event) => setForm({ ...form, number: event.target.value })}
                  />
                </label>
                <label className="quotation-field">
                  <span>
                    {t('Ngày lập', 'Issue date')} <b>*</b>
                  </span>
                  <input
                    type="date"
                    required
                    value={form.issuedAt}
                    onChange={(event) => setForm({ ...form, issuedAt: event.target.value })}
                  />
                </label>
                <label className="quotation-field">
                  <span>
                    {t('Có hiệu lực đến', 'Valid until')} <b>*</b>
                  </span>
                  <input
                    type="date"
                    min={form.issuedAt}
                    required
                    value={form.validUntil}
                    onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
                  />
                </label>
              </div>
              <div className="quotation-field-grid">
                <label className="quotation-field">
                  <span>{t('Giảm giá (₫)', 'Discount (₫)')}</span>
                  <input
                    type="number"
                    min={0}
                    max={totals.subtotal}
                    step={1}
                    value={Number.isFinite(form.discount) ? form.discount : ''}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        discount: event.target.value === '' ? NaN : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="quotation-field">
                  <span>{t('Phí giao hàng (₫)', 'Shipping fee (₫)')}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isFinite(form.shippingFee) ? form.shippingFee : ''}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        shippingFee: event.target.value === '' ? NaN : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </section>
            <section className="quotation-detail-card">
              <h3>{t('Điều khoản & ghi chú', 'Terms & notes')}</h3>
              <div className="quotation-field-grid">
                <label className="quotation-field">
                  <span>{t('Thanh toán', 'Payment terms')}</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    placeholder={t(
                      'Phương thức thanh toán, tiền cọc...',
                      'Payment method, deposit...',
                    )}
                    value={form.paymentTerms}
                    onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })}
                  />
                </label>
                <label className="quotation-field">
                  <span>{t('Giao hàng', 'Delivery terms')}</span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    placeholder={t(
                      'Thời gian giao, điều kiện vận chuyển...',
                      'Delivery time, shipping conditions...',
                    )}
                    value={form.deliveryTerms}
                    onChange={(event) => setForm({ ...form, deliveryTerms: event.target.value })}
                  />
                </label>
              </div>
              <label className="quotation-field">
                <span>{t('Ghi chú cho khách hàng', 'Customer notes')}</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  placeholder={t(
                    'Thông tin bổ sung, bảo hành, thuế...',
                    'Additional details, warranty, taxes...',
                  )}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
            </section>
          </fieldset>
        )}

        {step === 'review' && (
          <div className="quotation-review">
            <div className="quotation-review-heading">
              <div>
                <span>{t('BẢN XEM TRƯỚC', 'PREVIEW')}</span>
                <h3>{t('BÁO GIÁ SẢN PHẨM', 'PRODUCT QUOTATION')}</h3>
                <p>
                  {form.number} · {form.issuedAt} → {form.validUntil}
                </p>
              </div>
              <FileText size={38} />
            </div>
            <div className="quotation-review-parties">
              {(['seller', 'customer'] as const).map((party) => (
                <section key={party}>
                  <span>
                    {party === 'seller' ? t('BÊN BÁN', 'SELLER') : t('KHÁCH HÀNG', 'CUSTOMER')}
                  </span>
                  <h4>{form[party].name}</h4>
                  {form[party].phone && <p>{form[party].phone}</p>}
                  {form[party].email && <p>{form[party].email}</p>}
                  {form[party].address && <p>{form[party].address}</p>}
                </section>
              ))}
            </div>
            {missingImages > 0 && (
              <p className="quotation-image-warning">
                <ImageOff size={16} />
                {t(
                  `${missingImages} sản phẩm chưa có ảnh. PDF sẽ ghi rõ “Chưa có ảnh”.`,
                  `${missingImages} products have no image. The PDF will label them “No image”.`,
                )}
              </p>
            )}
            <div className="quotation-review-table-wrap">
              <table className="quotation-review-table">
                <thead>
                  <tr>
                    <th>{t('Sản phẩm', 'Product')}</th>
                    <th>{t('SL', 'Qty')}</th>
                    <th>{t('Đơn giá', 'Unit price')}</th>
                    <th>{t('Thành tiền', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map(({ product, quantity }) => (
                    <tr key={product.id}>
                      <td>
                        <div className="quotation-review-product">
                          <ProductImage product={product} onUnavailable={markImageUnavailable} />
                          <div>
                            <strong>{product.name}</strong>
                            <small>
                              {product.sku}
                              {product.unit ? ` · ${product.unit}` : ''}
                            </small>
                            {product.description && <p>{product.description}</p>}
                            {product.specifications?.length ? (
                              <dl className="quotation-specifications">
                                {product.specifications.map((spec, index) => (
                                  <div key={`${spec.label}-${index}`}>
                                    <dt>{spec.label}</dt>
                                    <dd>{spec.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            ) : null}
                            {product.warrantyMonths !== null &&
                              product.warrantyMonths !== undefined && (
                                <p>
                                  {t('Bảo hành', 'Warranty')}: {product.warrantyMonths}{' '}
                                  {t('tháng', 'months')}
                                </p>
                              )}
                            {product.sourceUrl && (
                              <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer">
                                {t('Xem thông tin sản phẩm', 'View product information')}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{quantity}</td>
                      <td>{money(product.price, locale)}</td>
                      <td>{money(quantity * product.price, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="quotation-review-bottom">
              <div className="quotation-review-terms">
                {[
                  [t('Thanh toán', 'Payment'), form.paymentTerms],
                  [t('Giao hàng', 'Delivery'), form.deliveryTerms],
                  [t('Ghi chú', 'Notes'), form.notes],
                ]
                  .filter(([, value]) => value)
                  .map(([title, value]) => (
                    <section key={title}>
                      <strong>{title}</strong>
                      <p>{value}</p>
                    </section>
                  ))}
              </div>
              <dl className="quotation-totals">
                <div>
                  <dt>{t('Tiền hàng', 'Subtotal')}</dt>
                  <dd>{money(totals.subtotal, locale)}</dd>
                </div>
                <div>
                  <dt>{t('Giảm giá', 'Discount')}</dt>
                  <dd>−{money(totals.discount, locale)}</dd>
                </div>
                <div>
                  <dt>{t('Phí giao hàng', 'Shipping')}</dt>
                  <dd>{money(totals.shippingFee, locale)}</dd>
                </div>
                <div className="quotation-grand-total">
                  <dt>{t('Tổng báo giá', 'Quotation total')}</dt>
                  <dd>{money(totals.total, locale)}</dd>
                </div>
              </dl>
            </div>
            <p className="quotation-footnote">
              {t(
                'File PDF sẽ được tải về thiết bị để bạn kiểm tra và gửi cho khách hàng.',
                'The PDF downloads to your device for you to check and share with the customer.',
              )}
            </p>
          </div>
        )}

        <div className="quotation-actions">
          <div>
            {step === 'products' ? (
              <span className="quotation-action-count">
                {form.items.length} {t('sản phẩm đã chọn', 'products selected')}
              </span>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setStep(step === 'review' ? 'details' : 'products')
                }}
              >
                <ArrowLeft size={16} />
                {t('Quay lại', 'Back')}
              </button>
            )}
          </div>
          <div>
            <span className="quotation-footer-total">
              {t('Tổng', 'Total')}
              <strong>{displayMoney(totals.total)}</strong>
            </span>
            {step === 'products' ? (
              <button
                type="button"
                className="button button-primary"
                disabled={loading || !!loadError || !form.items.length}
                onClick={() => {
                  setError('')
                  setStep('details')
                }}
              >
                {t('Tiếp tục', 'Continue')}
                <ArrowRight size={16} />
              </button>
            ) : step === 'details' ? (
              <button type="button" className="button button-primary" onClick={review}>
                {t('Kiểm tra báo giá', 'Review quotation')}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() => void exportPdf()}
              >
                {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                {busy
                  ? t('Đang tạo PDF...', 'Creating PDF...')
                  : t('Tải báo giá PDF', 'Download quotation PDF')}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
