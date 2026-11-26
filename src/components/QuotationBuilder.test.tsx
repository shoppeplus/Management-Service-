// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import I18nProvider from '../i18n/I18nProvider'
import type { Customer, Conversation } from '../types/inbox'
import type { QuotationCatalog, QuotationCatalogProduct } from '../services/quotationCatalog'
import { InventoryApiError } from '../modules/inventory/service'

const load = vi.fn()
const downloadQuotationPdf = vi.fn()
vi.hoisted(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {} },
  })
})
vi.mock('../modules/operations/service', () => ({
  operationsErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))
vi.mock('../services/quotationCatalog', () => ({ quotationCatalogService: { load } }))
vi.mock('../services/quotationPdf', () => ({ downloadQuotationPdf }))

const customer: Customer = {
  id: 'customer-1',
  name: 'Nguyễn An',
  phone: '0900000000',
  email: 'an@example.com',
  company: 'An Co',
  membership: 'Gold',
  location: 'Hà Nội',
  avatarColor: '#b99bea',
}
const conversation: Conversation = {
  id: 'conversation-1',
  customerId: customer.id,
  channel: 'messenger',
  status: 'open',
  priority: 'normal',
  assigneeId: null,
  teamId: null,
  subject: 'Hỏi sản phẩm',
  unread: 0,
  lastMessageAt: '2026-11-17T00:00:00Z',
  dueAt: '2026-11-17T00:00:00Z',
  sourceUrl: null,
  tags: [],
  mentioned: false,
  bot: false,
  messages: [],
}
const products = (count: number): QuotationCatalogProduct[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `product-${index + 1}`,
    sku: `SKU-${String(index + 1).padStart(4, '0')}`,
    name: `Sản phẩm ${index + 1}`,
    price: 100000 + index * 1000,
    stock: 30,
    unit: 'Cái',
    warrantyMonths: null,
    category: index % 2 ? 'Decor' : 'Ceramic',
    description: index === 777 ? 'Bình hoa xanh' : '',
    imageUrl: index % 3 === 0 ? `/product-${index + 1}.svg` : undefined,
  }))
const catalog = (count: number, patch: Partial<QuotationCatalog> = {}): QuotationCatalog => ({
  tenant: { id: 'tenant-1', name: 'Mây Home' },
  actor: { userId: 'owner-1', role: 'owner' },
  warehouses: [{ id: 'warehouse-1', code: 'HN', name: 'Kho Hà Nội' }],
  warehouseId: null,
  asOf: '2026-11-18T08:00:00.000Z',
  products: products(count),
  ...patch,
})
const renderBuilder = async () => {
  const QuotationBuilder = (await import('./QuotationBuilder')).default
  return render(
    <MemoryRouter>
      <I18nProvider>
        <QuotationBuilder
          customer={customer}
          conversation={conversation}
          onClose={vi.fn()}
          onNotify={vi.fn()}
        />
      </I18nProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('searches a large catalog, paginates 24 items, and preserves selected products', async () => {
  load.mockResolvedValue(catalog(1000))
  const user = userEvent.setup()
  await renderBuilder()
  expect(await screen.findByText('Sản phẩm 1')).toBeInTheDocument()
  expect(within(screen.getByTestId('quotation-catalog-items')).getAllByRole('button')).toHaveLength(
    24,
  )
  await user.click(screen.getByRole('button', { name: /^Chọn Sản phẩm 1$/i }))
  await user.click(screen.getByRole('button', { name: /Trang sản phẩm sau/i }))
  expect(screen.getByText('25–48 / 1.000')).toBeInTheDocument()
  expect(screen.getByText('Sản phẩm 1')).toBeInTheDocument()
  const search = screen.getByRole('textbox', { name: /Tìm sản phẩm báo giá/i })
  await user.clear(search)
  await user.type(search, 'binh hoa xanh')
  expect(await screen.findByText('Sản phẩm 778')).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: /Danh mục sản phẩm/i }), 'Ceramic')
  expect(screen.getByText('Không tìm thấy sản phẩm')).toBeInTheDocument()
  await user.selectOptions(screen.getByRole('combobox', { name: /Danh mục sản phẩm/i }), 'all')
  await user.clear(search)
  await user.type(search, 'sku-1000')
  expect(await screen.findByText('Sản phẩm 1000')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /^Chọn Sản phẩm 1000$/i }))
  expect(screen.getByText('2 / 200')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Xóa Sản phẩm 1000/i }))
  expect(screen.getByText('1 / 200')).toBeInTheDocument()
})

it('requires seller contact before export and exports once after valid review', async () => {
  load.mockResolvedValue(catalog(1))
  let finishExport: (() => void) | undefined
  downloadQuotationPdf.mockImplementation(
    () =>
      new Promise<{ missingImageCount: number }>((resolve) => {
        finishExport = () => resolve({ missingImageCount: 1 })
      }),
  )
  const user = userEvent.setup()
  const onNotify = vi.fn()
  const QuotationBuilder = (await import('./QuotationBuilder')).default
  render(
    <MemoryRouter>
      <I18nProvider>
        <QuotationBuilder
          customer={customer}
          conversation={conversation}
          onClose={vi.fn()}
          onNotify={onNotify}
        />
      </I18nProvider>
    </MemoryRouter>,
  )
  await user.click(await screen.findByRole('button', { name: /Chọn Sản phẩm 1/i }))
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(/seller|bên bán/i)
  const sellerName = screen.getByRole('textbox', { name: /Tên bên bán/i })
  const sellerPhone = screen.getByRole('textbox', { name: /Điện thoại bên bán/i })
  await user.clear(sellerName)
  await user.type(sellerName, 'Mây Home')
  await user.type(sellerPhone, '0901234567')
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  expect(screen.getByRole('heading', { name: /^BÁO GIÁ SẢN PHẨM$/i })).toBeInTheDocument()
  const download = screen.getByRole('button', { name: /Tải báo giá PDF/i })
  await user.dblClick(download)
  expect(downloadQuotationPdf).toHaveBeenCalledTimes(1)
  expect(download).toBeDisabled()
  const input = downloadQuotationPdf.mock.calls[0][0]
  expect(input).toMatchObject({
    conversationId: conversation.id,
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.location,
    },
    seller: { name: 'Mây Home', phone: '0901234567' },
    items: [{ product: { id: 'product-1' }, quantity: 1 }],
  })
  await act(async () => {
    finishExport?.()
  })
  expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/1 sản phẩm chưa có ảnh/))
})

it('keeps invalid quantities editable and allows a failed export to be retried', async () => {
  load.mockResolvedValue(catalog(1))
  downloadQuotationPdf
    .mockRejectedValueOnce(new Error('PDF failed'))
    .mockResolvedValueOnce({ missingImageCount: 0 })
  const user = userEvent.setup()
  await renderBuilder()
  await user.click(await screen.findByRole('button', { name: /^Chọn Sản phẩm 1$/i }))
  const quantity = screen.getByRole('spinbutton', { name: /Số lượng Sản phẩm 1/i })
  await user.clear(quantity)
  await user.type(quantity, '1000')
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.clear(screen.getByRole('textbox', { name: /Tên bên bán/i }))
  await user.type(screen.getByRole('textbox', { name: /Tên bên bán/i }), 'Mây Home')
  await user.type(screen.getByRole('textbox', { name: /Điện thoại bên bán/i }), '0901234567')
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(/999/)
  expect(downloadQuotationPdf).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: /Quay lại/i }))
  const validQuantity = screen.getByRole('spinbutton', { name: /Số lượng Sản phẩm 1/i })
  await user.clear(validQuantity)
  await user.type(validQuantity, '2')
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  await user.click(screen.getByRole('button', { name: /Tải báo giá PDF/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('PDF failed')
  await user.click(screen.getByRole('button', { name: /Tải báo giá PDF/i }))
  expect(downloadQuotationPdf).toHaveBeenCalledTimes(2)
})

it('shows a retry action when catalog loading fails', async () => {
  load.mockRejectedValueOnce(new Error('Catalog unavailable')).mockResolvedValueOnce(catalog(2))
  const user = userEvent.setup()
  await renderBuilder()
  expect(await screen.findByRole('alert')).toHaveTextContent('Catalog unavailable')
  await user.click(screen.getByRole('button', { name: /Tải lại kho/i }))
  expect(await screen.findByText('Sản phẩm 1')).toBeInTheDocument()
})

it('opens from inventory without a conversation and requires an explicit quote price for unknown prices', async () => {
  const data = catalog(1)
  data.products[0].price = null
  data.products[0].stock = 0
  data.products[0].specifications = [{ label: 'Điện áp', value: '220 V' }]
  data.products[0].warrantyMonths = 24
  load.mockResolvedValue(data)
  downloadQuotationPdf.mockResolvedValue({ missingImageCount: 1 })
  const QuotationBuilder = (await import('./QuotationBuilder')).default
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <I18nProvider>
        <QuotationBuilder
          initialWarehouseId="warehouse-1"
          expectedScope={{ tenantId: 'tenant-1', userId: 'owner-1' }}
          onClose={vi.fn()}
          onNotify={vi.fn()}
        />
      </I18nProvider>
    </MemoryRouter>,
  )
  expect(await screen.findByText('Từ kho đến báo giá PDF')).toBeInTheDocument()
  expect(load).toHaveBeenCalledWith({ warehouseId: 'warehouse-1' })
  expect(screen.getByText('Chưa có giá bán')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /^Chọn Sản phẩm 1$/i }))
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.type(screen.getByRole('textbox', { name: /Điện thoại bên bán/i }), '0901234567')
  await user.type(screen.getByRole('textbox', { name: /Tên khách nhận báo giá/i }), 'Khách mới')
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập giá báo')
  await user.click(screen.getByRole('button', { name: /Quay lại/i }))
  await user.type(screen.getByRole('spinbutton', { name: /Giá báo Sản phẩm 1/i }), '0')
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  await user.click(screen.getByRole('button', { name: /Tải báo giá PDF/i }))
  expect(downloadQuotationPdf).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: '',
      customer: expect.objectContaining({ name: 'Khách mới' }),
      items: [
        expect.objectContaining({
          product: expect.objectContaining({
            price: 0,
            stock: 0,
            warrantyMonths: 24,
            specifications: [{ label: 'Điện áp', value: '220 V' }],
          }),
        }),
      ],
    }),
  )
})

it('requires review again when inventory prices or public product details change', async () => {
  const original = catalog(1)
  const updated = catalog(1)
  updated.products[0].price = 220000
  updated.products[0].description = 'Thông tin mới'
  load.mockResolvedValueOnce(original).mockResolvedValue(updated)
  downloadQuotationPdf.mockResolvedValue({ missingImageCount: 1 })
  const user = userEvent.setup()
  await renderBuilder()
  await user.click(await screen.findByRole('button', { name: /^Chọn Sản phẩm 1$/i }))
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.type(screen.getByRole('textbox', { name: /Điện thoại bên bán/i }), '0901234567')
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  await user.click(screen.getByRole('button', { name: /Tải báo giá PDF/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Giá hoặc thông tin sản phẩm trong kho đã thay đổi',
  )
  expect(downloadQuotationPdf).not.toHaveBeenCalled()
  expect(screen.getByRole('spinbutton', { name: /Giá báo Sản phẩm 1/i })).toHaveValue(220000)
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  await user.click(screen.getByRole('button', { name: /Tải báo giá PDF/i }))
  expect(downloadQuotationPdf).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [
        expect.objectContaining({
          product: expect.objectContaining({ price: 220000, description: 'Thông tin mới' }),
        }),
      ],
    }),
  )
})

it('clears selected products and prevents PDF export when the server session expires', async () => {
  load
    .mockResolvedValueOnce(catalog(1))
    .mockRejectedValue(new InventoryApiError(401, 'UNAUTHENTICATED', 'Phiên đã hết hạn'))
  const onSessionExpired = vi.fn()
  const QuotationBuilder = (await import('./QuotationBuilder')).default
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <I18nProvider>
        <QuotationBuilder
          customer={customer}
          onSessionExpired={onSessionExpired}
          onClose={vi.fn()}
          onNotify={vi.fn()}
        />
      </I18nProvider>
    </MemoryRouter>,
  )
  await user.click(await screen.findByRole('button', { name: /^Chọn Sản phẩm 1$/i }))
  await user.click(screen.getByRole('button', { name: /Tiếp tục/i }))
  await user.type(screen.getByRole('textbox', { name: /Điện thoại bên bán/i }), '0901234567')
  await user.click(screen.getByRole('button', { name: /Kiểm tra báo giá/i }))
  await user.click(screen.getByRole('button', { name: /Tải báo giá PDF/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đã hết hạn')
  expect(onSessionExpired).toHaveBeenCalledOnce()
  expect(downloadQuotationPdf).not.toHaveBeenCalled()
})

it('rejects a different inventory identity before showing its catalog', async () => {
  load.mockResolvedValue(catalog(1, { tenant: { id: 'another-tenant', name: 'Khác' } }))
  const onSessionExpired = vi.fn()
  const QuotationBuilder = (await import('./QuotationBuilder')).default
  render(
    <MemoryRouter>
      <I18nProvider>
        <QuotationBuilder
          expectedScope={{ tenantId: 'tenant-1', userId: 'owner-1' }}
          onSessionExpired={onSessionExpired}
          onClose={vi.fn()}
          onNotify={vi.fn()}
        />
      </I18nProvider>
    </MemoryRouter>,
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Phiên doanh nghiệp đã thay đổi')
  expect(screen.queryByText('Sản phẩm 1')).not.toBeInTheDocument()
  expect(onSessionExpired).toHaveBeenCalledOnce()
})
