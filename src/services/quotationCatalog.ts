import { InventoryApiError } from '../modules/inventory/service'
import type { Product } from '../modules/operations/types'

export interface QuotationCatalogProduct extends Omit<Product, 'price'> {
  price: number | null
  specifications?: { label: string; value: string }[]
  sourceUrl?: string
  warrantyMonths: number | null
}
export interface QuotationCatalog {
  tenant: { id: string; name: string }
  actor: { userId: string; role: string }
  warehouses: { id: string; code: string; name: string }[]
  warehouseId: string | null
  asOf: string
  products: QuotationCatalogProduct[]
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, min = 0, max = 2000): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
const safeUrl = (value: unknown, rootRelative = false) => {
  if (!text(value, 1, 2048) || /[\s\\]/.test(value) || /%(?![a-f\d]{2})/i.test(value)) return false
  const relative = value.startsWith('/') && !value.startsWith('//')
  if (!(rootRelative && relative) && !/^https?:\/\/[^/]/i.test(value)) return false
  try {
    const url = new URL(value, 'https://catalog.invalid')
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!relative || url.origin === 'https://catalog.invalid')
    )
  } catch {
    return false
  }
}
export function assertQuotationCatalog(value: unknown): asserts value is QuotationCatalog {
  const fail = () => {
    throw new InventoryApiError(
      502,
      'INVALID_RESPONSE',
      'Dữ liệu danh mục báo giá không hợp lệ. / Invalid quotation catalog response.',
    )
  }
  if (
    !isRecord(value) ||
    !isRecord(value.tenant) ||
    !text(value.tenant.id, 1, 200) ||
    !text(value.tenant.name, 1, 200) ||
    !isRecord(value.actor) ||
    !text(value.actor.userId, 1, 200) ||
    !text(value.actor.role, 1, 50) ||
    !text(value.asOf, 1, 50) ||
    !Number.isFinite(Date.parse(value.asOf)) ||
    !(value.warehouseId === null || text(value.warehouseId, 1, 200)) ||
    !Array.isArray(value.warehouses) ||
    !value.warehouses.every(
      (warehouse) =>
        isRecord(warehouse) && ['id', 'code', 'name'].every((key) => text(warehouse[key], 1, 200)),
    ) ||
    !Array.isArray(value.products)
  )
    return fail()
  if (
    value.warehouseId !== null &&
    !value.warehouses.some((warehouse) => warehouse.id === value.warehouseId)
  )
    return fail()
  const ids = new Set<string>()
  for (const item of value.products) {
    if (
      !isRecord(item) ||
      !text(item.id, 1, 200) ||
      ids.has(item.id) ||
      !text(item.sku, 1, 50) ||
      !text(item.name, 1, 200) ||
      !text(item.unit, 1, 200) ||
      !text(item.category, 0, 200) ||
      !(item.price === null || nonnegative(item.price)) ||
      !nonnegative(item.stock) ||
      !(
        item.warrantyMonths === null ||
        (nonnegative(item.warrantyMonths) && Number(item.warrantyMonths) <= 1200)
      ) ||
      (item.imageUrl !== undefined && !safeUrl(item.imageUrl, true)) ||
      (item.description !== undefined && !text(item.description, 1, 2000)) ||
      (item.sourceUrl !== undefined && !safeUrl(item.sourceUrl)) ||
      (item.specifications !== undefined &&
        (!Array.isArray(item.specifications) ||
          item.specifications.length > 12 ||
          !item.specifications.every(
            (spec) => isRecord(spec) && text(spec.label, 1, 80) && text(spec.value, 1, 240),
          )))
    )
      return fail()
    ids.add(item.id)
  }
}

export function createQuotationCatalogService(baseUrl = '') {
  return {
    async load(filters: { warehouseId?: string } = {}): Promise<QuotationCatalog> {
      const query = new URLSearchParams()
      if (filters.warehouseId) query.set('warehouseId', filters.warehouseId)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch(
          `${baseUrl.replace(/\/$/, '')}/api/v1/inventory/quotation-catalog${query.size ? `?${query}` : ''}`,
          {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        )
        let value: unknown
        try {
          value = await response.json()
        } catch {
          throw new InventoryApiError(
            502,
            'INVALID_RESPONSE',
            'API danh mục báo giá trả JSON không hợp lệ. / Invalid quotation catalog JSON.',
          )
        }
        if (!response.ok) {
          const error = isRecord(value) && isRecord(value.error) ? value.error : {}
          throw new InventoryApiError(
            response.status,
            typeof error.code === 'string' ? error.code : 'API_ERROR',
            typeof error.message === 'string'
              ? error.message
              : `Quotation catalog API: ${response.status}`,
          )
        }
        assertQuotationCatalog(value)
        if (value.warehouseId !== (filters.warehouseId || null))
          throw new InventoryApiError(
            502,
            'INVALID_RESPONSE',
            'Kho phản hồi không khớp kho đã chọn. / The returned warehouse does not match the selection.',
          )
        return value
      } catch (error) {
        if (error instanceof InventoryApiError) throw error
        throw new InventoryApiError(
          0,
          'CONNECTION_ERROR',
          'Không thể kết nối danh mục kho. Dữ liệu báo giá chưa được tải. / Cannot connect to the inventory catalog. Quotation data was not loaded.',
        )
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export const quotationCatalogService = createQuotationCatalogService(
  import.meta.env.VITE_INVENTORY_API_BASE_URL || '',
)
