import { normalizeSearch } from '../modules/operations/domain'
import type { QuotationInput, QuotationTotals } from '../types/quotation'

export function filterQuotationProducts<T extends { name: string; sku: string; description?: string; category?: string }>(products: T[], search: string, category = 'all') {
  const query = normalizeSearch(search.trim())
  return products.filter(
    (product) =>
      (category === 'all' || product.category === category) &&
      (!query ||
        normalizeSearch(`${product.name} ${product.sku} ${product.description ?? ''}`).includes(
          query,
        )),
  )
}
export function quotationTotals(
  input: Pick<QuotationInput, 'items' | 'discount' | 'shippingFee'>,
): QuotationTotals {
  const subtotal = input.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  return {
    subtotal,
    discount: input.discount,
    shippingFee: input.shippingFee,
    total: subtotal - input.discount + input.shippingFee,
    quantity: input.items.reduce((sum, item) => sum + item.quantity, 0),
  }
}
export function validateQuotation(input: QuotationInput) {
  const fail = (message: string): never => {
    throw new Error(message)
  }
  const text = (value: unknown, min: number, max: number) =>
    typeof value === 'string' && value.trim().length >= min && value.length <= max
  if (!text(input.number, 1, 60))
    fail('Nhập mã báo giá (tối đa 60 ký tự). / Enter a quotation number (up to 60 characters).')
  const date = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!date(input.issuedAt) || !date(input.validUntil) || input.validUntil < input.issuedAt)
    fail(
      'Ngày hiệu lực phải bằng hoặc sau ngày lập báo giá. / Valid until must be on or after the issue date.',
    )
  if (!text(input.seller.name, 2, 160) || !text(input.customer.name, 2, 160))
    fail('Nhập tên bên bán và khách hàng. / Enter seller and customer names.')
  if (!text(input.seller.phone, 1, 50) && !text(input.seller.email, 1, 160))
    fail('Nhập số điện thoại hoặc email liên hệ bên bán. / Enter a seller phone or email.')
  for (const party of [input.seller, input.customer]) {
    if (!text(party.address, 0, 300) || !text(party.phone, 0, 50) || !text(party.email, 0, 160))
      fail('Thông tin liên hệ quá dài hoặc không hợp lệ. / Invalid contact information.')
    if (party.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(party.email))
      fail('Email liên hệ chưa hợp lệ. / Invalid contact email.')
  }
  if (!input.items.length || input.items.length > 200)
    fail('Chọn từ 1 đến 200 sản phẩm cho mỗi báo giá. / Select 1 to 200 products per quotation.')
  if (new Set(input.items.map((item) => item.product.id)).size !== input.items.length)
    fail('Sản phẩm bị trùng trong báo giá. / Duplicate quotation products.')
  for (const { product, quantity } of input.items) {
    if (
      !text(product.name, 1, 200) ||
      !text(product.sku, 1, 50) ||
      !Number.isSafeInteger(product.price) ||
      product.price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    )
      fail(
        'Kiểm tra sản phẩm và số lượng từ 1 đến 999. / Check products and quantities from 1 to 999.',
      )
  }
  const totals = quotationTotals(input)
  if (
    ![input.discount, input.shippingFee, totals.subtotal, totals.total].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    input.discount > totals.subtotal
  )
    fail(
      'Kiểm tra phí giao hàng và giảm giá; giảm giá không vượt tiền hàng. / Check shipping and discount; discount cannot exceed subtotal.',
    )
  for (const value of [input.notes, input.paymentTerms, input.deliveryTerms])
    if (!text(value, 0, 2000))
      fail(
        'Điều khoản báo giá tối đa 2.000 ký tự. / Quotation terms are limited to 2,000 characters.',
      )
}
