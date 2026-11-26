// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render as renderDom, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import InventoryPage from './InventoryPage'
import InventoryAuthPage from './InventoryAuthPage'
import { inventoryService, InventoryApiError } from './service'
import type { InventorySnapshot, PurchaseOrder } from './types'

vi.mock('./service', async (importOriginal) => {
  const original = await importOriginal<typeof import('./service')>()
  return {
    ...original,
    inventoryService: {
      load: vi.fn(),
      checkSession: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      command: vi.fn(),
    },
  }
})
const render = (ui: ReactNode) =>
  renderDom(
    <MemoryRouter initialEntries={['/inventory']}>
      <Routes>
        <Route path="/inventory" element={ui} />
        <Route path="/products" element={ui} />
        <Route path="/login" element={<InventoryAuthPage />} />
        <Route path="/register" element={<InventoryAuthPage />} />
      </Routes>
    </MemoryRouter>,
  )
const renderAuth = (path = '/login', from = '/inventory') =>
  renderDom(
    <MemoryRouter initialEntries={[{ pathname: path, state: { from } }]}>
      <Routes>
        <Route path="/login" element={<InventoryAuthPage />} />
        <Route path="/register" element={<InventoryAuthPage />} />
        <Route path="/inventory" element={<h1>Inventory opened</h1>} />
        <Route path="/products" element={<h1>Products opened</h1>} />
      </Routes>
    </MemoryRouter>,
  )
const renderProtected = (path: string) =>
  renderDom(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/products" element={<InventoryPage catalogOnly />} />
        <Route path="/login" element={<InventoryAuthPage />} />
        <Route path="/register" element={<InventoryAuthPage />} />
      </Routes>
    </MemoryRouter>,
  )

const snapshot = (): InventorySnapshot => ({
  tenant: { id: 'tenant-a', name: 'Công ty A', config: {} },
  actor: { userId: 'user-a', role: 'owner' },
  permissions: ['warehouse.create', 'document.create', 'document.approve', 'document.post'],
  warehouses: [{ id: 'warehouse-a', code: 'HN', name: 'Kho Hà Nội', address: '', active: true }],
  locations: [],
  suppliers: [],
  skus: [
    {
      id: 'sku-a',
      sku: 'A-1',
      name: 'Công tắc',
      category: 'Điện',
      unit: 'Cái',
      serialTracked: false,
      reorderPoint: 2,
      maxStock: 10,
      leadTimeDays: 7,
      active: true,
    },
  ],
  balances: [
    {
      warehouseId: 'warehouse-a',
      locationId: null,
      skuId: 'sku-a',
      onHand: 5,
      reserved: 1,
      damaged: 0,
      warranty: 0,
      available: 4,
      inventoryValue: 500,
      averageCost: 100,
      updatedAt: '2026-11-17T09:00:00Z',
    },
  ],
  documents: [],
  purchaseRequests: [],
  purchaseOrders: [],
  salesOrders: [],
  ledger: [],
  reservations: [],
  counts: [],
  serials: [],
  warranties: [],
  auditEvents: [],
  metrics: {},
})
const purchaseOrderFixture = (status: PurchaseOrder['status'] = 'draft'): PurchaseOrder => ({
  id: 'purchase-a',
  number: 'PO-1001',
  warehouseId: 'warehouse-a',
  supplierId: 'supplier-a',
  status,
  reference: 'WEB-1001',
  note: '',
  createdBy: 'user-a',
  approvedBy: status === 'draft' ? null : 'user-a',
  createdAt: '2026-11-17T00:00:00Z',
  approvedAt: status === 'draft' ? null : '2026-11-17T01:00:00Z',
  completedAt: status === 'received' ? '2026-11-17T03:00:00Z' : null,
  cancelledAt: status === 'cancelled' ? '2026-11-17T03:00:00Z' : null,
  lines: [
    {
      id: 'purchase-line-a',
      purchaseOrderId: 'purchase-a',
      skuId: 'sku-a',
      locationId: null,
      quantity: 5,
      unitCost: 250000,
      receivedQuantity: 0,
      outstandingQuantity: 5,
      pendingReceiptQuantity: 0,
    },
  ],
  receiptDocumentIds: [],
})
beforeEach(() => {
  vi.mocked(inventoryService.load).mockResolvedValue(snapshot())
  vi.mocked(inventoryService.checkSession).mockRejectedValue(
    new InventoryApiError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'),
  )
  vi.mocked(inventoryService.login).mockResolvedValue(undefined)
  vi.mocked(inventoryService.register).mockResolvedValue(undefined)
  vi.mocked(inventoryService.logout).mockResolvedValue(undefined)
  vi.mocked(inventoryService.command).mockResolvedValue(snapshot())
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('Inventory workspace', () => {
  it('shows the inventory-backed product catalog with stock and permissioned product actions', async () => {
    const value = snapshot()
    value.permissions.push('sku.create', 'sku.update')
    value.skus[0].price = 125000
    value.skus[0].priceKnown = true
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    const user = userEvent.setup()

    render(<InventoryPage catalogOnly />)

    await screen.findByRole('heading', { level: 1, name: 'Sản phẩm' })
    expect(screen.getByRole('heading', { name: 'Danh mục sản phẩm' })).toBeInTheDocument()
    expect(screen.getByText('Công tắc')).toBeInTheDocument()
    expect(screen.getByText('A-1')).toBeInTheDocument()
    expect(screen.getByText(/125\.000/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Thêm sản phẩm' }))
    expect(dialog.getByRole('heading', { name: 'Thông tin cơ bản' })).toBeInTheDocument()
    expect(dialog.getByRole('heading', { name: 'Quản lý tồn kho' })).toBeInTheDocument()
    await user.type(dialog.getByRole('textbox', { name: 'SKU *' }), 'SWITCH-02')
    await user.type(dialog.getByRole('textbox', { name: 'Tên sản phẩm *' }), 'Công tắc mới')
    await user.type(dialog.getByRole('spinbutton', { name: /Giá bán \(VND\)/ }), '150000')
    await user.type(dialog.getByRole('textbox', { name: /Thông số/ }), 'Chất liệu: Thép không gỉ')
    await user.click(dialog.getByRole('button', { name: 'Tạo sản phẩm' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'sku.create',
        expect.objectContaining({
          sku: 'SWITCH-02',
          name: 'Công tắc mới',
          price: 150000,
          specifications: [{ label: 'Chất liệu', value: 'Thép không gỉ' }],
        }),
      ),
    )
  })

  it('adds initial stock atomically with a new product through the receipt-backed import command', async () => {
    const value = snapshot()
    value.permissions.push('sku.create', 'sku.import')
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    const user = userEvent.setup()
    render(<InventoryPage catalogOnly />)
    await screen.findByRole('heading', { level: 1, name: 'Sản phẩm' })
    await user.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Thêm sản phẩm' }))
    await user.type(dialog.getByRole('textbox', { name: 'SKU *' }), 'SWITCH-03')
    await user.type(dialog.getByRole('textbox', { name: 'Tên sản phẩm *' }), 'Công tắc mới')
    await user.type(dialog.getByRole('spinbutton', { name: 'Số lượng ban đầu' }), '4')
    await user.type(dialog.getByRole('spinbutton', { name: 'Giá vốn / đơn vị (VND)' }), '50000')
    await user.click(dialog.getByRole('button', { name: 'Tạo sản phẩm' }))

    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'sku.import',
        expect.objectContaining({
          warehouseId: 'warehouse-a',
          rows: [
            expect.objectContaining({
              sku: 'SWITCH-03',
              name: 'Công tắc mới',
              quantity: 4,
              cost: 50000,
            }),
          ],
        }),
      ),
    )
  })

  it('imports multiple products from an Excel-compatible CSV template', async () => {
    const value = snapshot()
    value.permissions.push('sku.import')
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    vi.mocked(inventoryService.command).mockResolvedValue(value)
    const user = userEvent.setup()
    render(<InventoryPage catalogOnly />)
    await screen.findByRole('heading', { level: 1, name: 'Sản phẩm' })
    await user.click(screen.getByRole('button', { name: 'Nhập từ Excel' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Nhập nhiều sản phẩm từ Excel' }),
    )
    const csv = [
      'SKU *,Tên sản phẩm *,Đơn vị,Tồn đầu kỳ,Giá vốn (VND),Tồn tối thiểu',
      'BULK-01,Đèn bàn,Cái,4,50000,2',
      'BULK-02,Quạt bàn,Cái,0,,3',
    ].join('\r\n')
    await user.upload(
      dialog.getByLabelText('Chọn file Excel (.xlsx hoặc .csv) *'),
      new File([csv], 'san-pham.csv', { type: 'text/csv' }),
    )
    expect(await dialog.findByText(/Đã kiểm tra 2 sản phẩm/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Nhập 2 sản phẩm' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('sku.import', {
        warehouseId: 'warehouse-a',
        rows: [
          expect.objectContaining({
            sku: 'BULK-01',
            name: 'Đèn bàn',
            quantity: 4,
            cost: 50000,
            reorderPoint: 2,
          }),
          expect.objectContaining({ sku: 'BULK-02', name: 'Quạt bàn', quantity: 0 }),
        ],
      }),
    )
  })

  it.each([
    { catalogOnly: false, page: 'kho' },
    { catalogOnly: true, page: 'sản phẩm' },
  ])('keeps quotation and sign-out actions out of the $page page', async ({ catalogOnly }) => {
    render(<InventoryPage catalogOnly={catalogOnly} />)
    await screen.findByText('Công ty A')
    expect(screen.queryByRole('button', { name: /báo giá/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /đăng xuất|sign out/i })).not.toBeInTheDocument()
  })

  it('signs in with an employee account and reports invalid credentials without losing the email', async () => {
    vi.mocked(inventoryService.login)
      .mockRejectedValueOnce(
        new InventoryApiError(401, 'INVALID_CREDENTIALS', 'Thông tin không đúng'),
      )
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderAuth('/login', '/products')
    const email = await screen.findByLabelText('Email')
    const password = screen.getByLabelText('Mật khẩu')
    await user.type(email, 'staff@example.com')
    await user.type(password, 'short')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('10 đến 128')
    expect(inventoryService.login).not.toHaveBeenCalled()
    await user.clear(password)
    await user.type(password, 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.keyboard('{Enter}')
    expect(inventoryService.login).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng')
    expect(email).toHaveValue('staff@example.com')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(await screen.findByRole('heading', { name: 'Products opened' })).toBeInTheDocument()
    expect(inventoryService.login).toHaveBeenLastCalledWith(
      'staff@example.com',
      'correct-horse-battery',
    )
  })

  it('registers a business owner account without an administrator token', async () => {
    vi.mocked(inventoryService.register).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAuth()
    await screen.findByLabelText('Email')
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản doanh nghiệp' }))
    await screen.findByLabelText('Tên doanh nghiệp')
    await user.type(screen.getByLabelText('Tên doanh nghiệp'), 'Cửa hàng Demo')
    await user.type(screen.getByLabelText('Họ tên chủ tài khoản'), 'Chủ cửa hàng')
    await user.type(screen.getByLabelText('Email'), 'owner@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'secure-password-123')
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản doanh nghiệp' }))
    expect(await screen.findByRole('heading', { name: 'Inventory opened' })).toBeInTheDocument()
    expect(inventoryService.register).toHaveBeenCalledWith({
      companyName: 'Cửa hàng Demo',
      name: 'Chủ cửa hàng',
      email: 'owner@example.com',
      password: 'secure-password-123',
    })
  })

  it('restores a cookie session from the sign-in route and opens inventory without another login', async () => {
    vi.mocked(inventoryService.checkSession).mockResolvedValue({
      actor: { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' },
      user: { id: 'user-a', name: 'Owner', email: 'owner@example.com', role: 'owner' },
      tenant: { id: 'tenant-a', name: 'Công ty A' },
      permissions: ['account.users.manage'],
    })
    renderAuth()
    expect(await screen.findByRole('heading', { name: 'Inventory opened' })).toBeInTheDocument()
    expect(inventoryService.login).not.toHaveBeenCalled()
  })

  it('keeps an account sign-in retry when the session check fails to connect', async () => {
    vi.mocked(inventoryService.checkSession)
      .mockRejectedValueOnce(
        new InventoryApiError(0, 'CONNECTION_ERROR', 'Không kết nối được máy chủ kho'),
      )
      .mockResolvedValueOnce({
        actor: { userId: 'user-a', tenantId: 'tenant-a', role: 'owner' },
        user: { id: 'user-a', name: 'Owner', email: 'owner@example.com', role: 'owner' },
        tenant: { id: 'tenant-a', name: 'Công ty A' },
        permissions: ['account.users.manage'],
      })
    const user = userEvent.setup()
    renderAuth()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được')
    await user.click(screen.getByRole('button', { name: 'Thử kết nối lại' }))
    expect(await screen.findByRole('heading', { name: 'Inventory opened' })).toBeInTheDocument()
    expect(inventoryService.login).not.toHaveBeenCalled()
  })

  it.each(['/inventory', '/products'])(
    'redirects unauthenticated visits to %s to the separate sign-in page',
    async (path) => {
      vi.mocked(inventoryService.load)
        .mockRejectedValueOnce(new InventoryApiError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'))
        .mockRejectedValueOnce(new InventoryApiError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'))
      renderProtected(path)
      expect(await screen.findByRole('heading', { name: 'Đăng Nhập' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Sản phẩm' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Quản lý kho hàng' })).not.toBeInTheDocument()
    },
  )

  it('removes stale stock and an open mutation form when a session expires during a command', async () => {
    vi.mocked(inventoryService.command).mockRejectedValueOnce(
      new InventoryApiError(401, 'UNAUTHENTICATED', 'Phiên hết hạn'),
    )
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Tạo chứng từ' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.selectOptions(dialog.getByLabelText('SKU 1'), 'sku-a')
    await user.type(dialog.getByRole('spinbutton', { name: 'Giá vốn / đơn vị (VND) 1' }), '100')
    await user.click(dialog.getByRole('button', { name: 'Tạo phiếu nháp' }))
    expect(await screen.findByRole('heading', { name: 'Đăng Nhập' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Công ty A')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Email')).toBeEnabled()
  })

  it('shows serial coverage and the coverage recorded when warranty was received', async () => {
    const value = snapshot()
    value.serials = [
      {
        id: 'serial-a',
        serialNumber: 'DEVICE-001',
        skuId: 'sku-a',
        warehouseId: 'warehouse-a',
        status: 'issued',
        warrantyMonths: 24,
        warrantyStartAt: '2025-11-17T00:00:00Z',
        warrantyEndAt: '2027-11-17T00:00:00Z',
      },
    ]
    value.warranties = [
      {
        id: 'warranty-a',
        serialId: 'serial-a',
        customerName: 'Khách hàng A',
        issue: 'Không kết nối',
        status: 'received',
        warrantyValidAtIntake: true,
        warrantyEndsAt: '2027-11-17T00:00:00Z',
      },
    ]
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Serial & bảo hành' }))
    expect(screen.getByText('Còn hạn khi tiếp nhận')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Bảo hành từ ngày xuất' })).toBeInTheDocument()
    expect(screen.getAllByText(/2027/)).toHaveLength(2)
  })

  it.each([390, 1440])('supports modal keyboard navigation at %ipx viewport', async (width) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    const trigger = screen.getByRole('button', { name: 'Tạo chứng từ' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Tạo chứng từ kho' })
    expect(dialog).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Tạo phiếu nháp' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Đóng hộp thoại' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('shows a normal sign-in prompt for an absent server session without inventing stock', async () => {
    vi.mocked(inventoryService.load).mockRejectedValue(
      new InventoryApiError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'),
    )
    render(<InventoryPage />)
    expect(await screen.findByRole('heading', { name: 'Đăng Nhập' })).toBeInTheDocument()
    await screen.findByLabelText('Email')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Tồn theo SKU · kho · vị trí' }),
    ).not.toBeInTheDocument()
  })

  it('creates a receipt draft and leaves approval/posting separate', async () => {
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    expect(screen.queryByRole('button', { name: 'Đơn bán liên kết kho' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nhập thêm hàng' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo chứng từ kho' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: 'SKU 1' }), 'sku-a')
    await user.type(dialog.getByRole('spinbutton', { name: 'Giá vốn / đơn vị (VND) 1' }), '100')
    await user.click(dialog.getByRole('button', { name: 'Tạo phiếu nháp' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'document.create',
        expect.objectContaining({
          type: 'receipt',
          warehouseId: 'warehouse-a',
          lines: [{ skuId: 'sku-a', quantity: 1, unitCost: 100 }],
        }),
      ),
    )
    expect(inventoryService.command).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Máy chủ đã xác nhận')
  })

  it('does not offer standalone purchase receipts to warehouse managers', async () => {
    const data = snapshot()
    data.actor.role = 'manager'
    data.permissions.push('purchaseOrder.receive')
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    const user = userEvent.setup()

    render(<InventoryPage />)
    await screen.findByText('Công ty A')

    expect(screen.queryByRole('button', { name: 'Nhập thêm hàng' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tạo chứng từ' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo chứng từ kho' }))
    const type = dialog.getByRole('combobox', { name: 'Loại chứng từ' })
    expect(type).toHaveValue('issue')

    await user.selectOptions(type, 'receipt')
    expect(dialog.getByRole('combobox', { name: 'Phiếu xuất gốc đã ghi sổ' })).toBeRequired()
    expect(dialog.getByText(/chỉ dùng cho hàng khách trả/)).toBeInTheDocument()
    expect(dialog.queryByRole('combobox', { name: 'Nhà cung cấp' })).not.toBeInTheDocument()
  })

  it('reserves stock at the selected warehouse location', async () => {
    const data = snapshot()
    data.permissions.push('reservation.create')
    data.locations = [{ id: 'shelf-a', warehouseId: 'warehouse-a', code: 'A-1', name: 'Kệ A' }]
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Giữ chỗ' }))
    await user.click(screen.getAllByRole('button', { name: 'Giữ chỗ' }).at(-1)!)
    const dialog = within(screen.getByRole('dialog', { name: 'Giữ chỗ tồn kho' }))
    await user.selectOptions(dialog.getByLabelText('Kho *'), 'warehouse-a')
    await user.selectOptions(dialog.getByLabelText('Vị trí giữ hàng'), 'shelf-a')
    await user.selectOptions(dialog.getByLabelText('Hàng hóa *'), 'sku-a')
    await user.type(dialog.getByLabelText('Mã đơn / tham chiếu *'), 'ORDER-1')
    await user.click(dialog.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('reservation.create', {
        warehouseId: 'warehouse-a',
        locationId: 'shelf-a',
        skuId: 'sku-a',
        quantity: 1,
        reference: 'ORDER-1',
      }),
    )
  })

  it('requires an original posted issue and derives return cost from its remaining carrying value', async () => {
    const data = snapshot()
    data.documents.push({
      id: 'issue-a',
      number: 'PX-1',
      type: 'issue',
      status: 'posted',
      warehouseId: 'warehouse-a',
      targetWarehouseId: null,
      supplierId: null,
      reference: 'ORDER-1',
      reason: '',
      createdAt: '2026-11-17T00:00:00Z',
      postedAt: '2026-11-17T00:00:00Z',
      lines: [
        {
          id: 'line-a',
          skuId: 'sku-a',
          locationId: null,
          targetLocationId: null,
          quantity: 3,
          unitCost: 0,
          inventoryValue: 100,
          serialNumbers: [],
        },
      ],
    })
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Tạo chứng từ' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo chứng từ kho' }))
    await user.click(dialog.getByRole('checkbox', { name: 'Nhập lại hàng đã xuất / khách trả' }))
    await user.selectOptions(dialog.getByLabelText('Phiếu xuất gốc đã ghi sổ'), 'issue-a')
    await user.selectOptions(dialog.getByLabelText('SKU 1'), 'sku-a')
    expect(dialog.getByRole('spinbutton', { name: 'Giá vốn / đơn vị (VND) 1' })).toHaveValue(33)
    await user.type(dialog.getByLabelText('Lý do nghiệp vụ *'), 'Khách trả hàng')
    await user.click(dialog.getByRole('button', { name: 'Tạo phiếu nháp' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'document.create',
        expect.objectContaining({
          sourceDocumentId: 'issue-a',
          returnToStock: true,
          lines: [{ skuId: 'sku-a', quantity: 1, unitCost: 33 }],
        }),
      ),
    )
  })

  it('keeps the document form and error visible when posting the draft fails', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.command).mockRejectedValue(
      new InventoryApiError(409, 'INSUFFICIENT_STOCK', 'Không đủ tồn'),
    )
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Tạo chứng từ' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo chứng từ kho' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Loại chứng từ' }), 'issue')
    await user.selectOptions(dialog.getByRole('combobox', { name: 'SKU 1' }), 'sku-a')
    await user.click(dialog.getByRole('button', { name: 'Tạo phiếu nháp' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Không đủ tồn')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      screen.queryByText('Máy chủ đã xác nhận thao tác và lưu nhật ký.'),
    ).not.toBeInTheDocument()
  })

  it('hides mutations from viewers and filters Vietnamese search without accents', async () => {
    const value = snapshot()
    value.permissions = []
    value.actor.role = 'viewer'
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    expect(screen.queryByRole('button', { name: 'Tạo chứng từ' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Tìm tên hàng hoặc SKU' }), 'cong tac')
    expect(screen.getByText('Công tắc')).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Tìm tên hàng hoặc SKU' }))
    await user.type(screen.getByRole('textbox', { name: 'Tìm tên hàng hoặc SKU' }), 'khong co')
    expect(screen.getByText('Chưa có dữ liệu phù hợp.')).toBeInTheDocument()
  })

  it('updates an existing warehouse through the permissioned command API', async () => {
    const value = snapshot()
    value.permissions.push('warehouse.update')
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Kho & danh mục' }))
    await user.click(screen.getByRole('button', { name: 'Sửa kho' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Chỉnh sửa kho' }))
    expect(dialog.getByRole('textbox', { name: 'Tên kho *' })).toHaveValue('Kho Hà Nội')
    await user.clear(dialog.getByRole('textbox', { name: 'Tên kho *' }))
    await user.type(dialog.getByRole('textbox', { name: 'Tên kho *' }), 'Kho miền Bắc')
    await user.click(dialog.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'warehouse.update',
        expect.objectContaining({ id: 'warehouse-a', name: 'Kho miền Bắc', active: true }),
      ),
    )
  })

  it('edits supplier and SKU records only when the corresponding server permission is present', async () => {
    const value = snapshot()
    value.permissions.push('supplier.update', 'sku.update')
    value.suppliers.push({
      id: 'supplier-a',
      code: 'LUMI',
      name: 'Lumi',
      phone: '0900',
      email: 'ops@example.com',
      address: 'HN',
      active: true,
    })
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    vi.mocked(inventoryService.command).mockResolvedValue(value)
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Kho & danh mục' }))
    await user.click(screen.getByRole('button', { name: 'Sửa SKU' }))
    const skuDialog = within(screen.getByRole('dialog', { name: 'Chỉnh sửa sản phẩm' }))
    expect(skuDialog.getByRole('spinbutton', { name: 'Mức tồn tối thiểu *' })).toHaveValue(2)
    await user.clear(skuDialog.getByRole('spinbutton', { name: 'Mức tồn tối thiểu *' }))
    await user.type(skuDialog.getByRole('spinbutton', { name: 'Mức tồn tối thiểu *' }), '4')
    await user.click(skuDialog.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'sku.update',
        expect.objectContaining({
          id: 'sku-a',
          reorderPoint: 4,
          active: true,
          serialTracked: false,
        }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Sửa nhà cung cấp' }))
    const supplierDialog = within(screen.getByRole('dialog', { name: 'Chỉnh sửa nhà cung cấp' }))
    await user.clear(supplierDialog.getByRole('textbox', { name: 'Tên nhà cung cấp *' }))
    await user.type(
      supplierDialog.getByRole('textbox', { name: 'Tên nhà cung cấp *' }),
      'Lumi Việt Nam',
    )
    await user.click(supplierDialog.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'supplier.update',
        expect.objectContaining({ id: 'supplier-a', name: 'Lumi Việt Nam', active: true }),
      ),
    )
  })

  it('updates tenant inventory configuration and disables inventory actions when the module is off', async () => {
    const data = snapshot()
    data.permissions.push('config.update')
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    vi.mocked(inventoryService.command).mockImplementation(async (action, input) => ({
      ...data,
      tenant: {
        ...data.tenant,
        config: action === 'config.update' ? (input.config as Record<string, unknown>) : {},
      },
    }))
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Kho & danh mục' }))
    await user.click(screen.getByRole('button', { name: 'Chỉnh cấu hình kho' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Cấu hình phân hệ kho' }))
    await user.click(dialog.getByRole('checkbox', { name: 'Bật phân hệ quản lý kho' }))
    await user.clear(
      dialog.getByRole('spinbutton', {
        name: 'Số ngày không biến động để cảnh báo hàng tồn lâu *',
      }),
    )
    await user.type(
      dialog.getByRole('spinbutton', {
        name: 'Số ngày không biến động để cảnh báo hàng tồn lâu *',
      }),
      '120',
    )
    await user.click(dialog.getByRole('button', { name: 'Lưu' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('config.update', {
        config: { inventoryEnabled: false, multiWarehouseEnabled: true, staleDays: 120 },
      }),
    )
    expect(screen.getByRole('button', { name: 'Tạo kho' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Tồn kho' }))
    expect(screen.getByRole('button', { name: 'Tạo chứng từ' })).toBeDisabled()
  })

  it('creates a purchase order draft with tenant SKU and supplier references', async () => {
    const data = snapshot()
    data.permissions.push('purchaseOrder.create')
    data.suppliers.push({ id: 'supplier-a', code: 'SUP-1', name: 'Lumi Supply', active: true })
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    vi.mocked(inventoryService.command).mockResolvedValue({
      ...data,
      purchaseOrders: [purchaseOrderFixture()],
    })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    await user.click(screen.getByRole('button', { name: 'Tạo đơn mua' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo đơn mua hàng' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Kho nhận' }), 'warehouse-a')
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Nhà cung cấp' }), 'supplier-a')
    await user.selectOptions(dialog.getByRole('combobox', { name: 'SKU 1' }), 'sku-a')
    await user.clear(dialog.getByRole('spinbutton', { name: 'Số lượng đặt' }))
    await user.type(dialog.getByRole('spinbutton', { name: 'Số lượng đặt' }), '8')
    await user.type(dialog.getByRole('spinbutton', { name: 'Giá vốn / đơn vị (VND)' }), '250000')
    await user.type(dialog.getByRole('textbox', { name: 'Mã tham chiếu' }), 'WEB-1001')
    await user.click(dialog.getByRole('button', { name: 'Tạo đơn nháp' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('purchaseOrder.create', {
        warehouseId: 'warehouse-a',
        supplierId: 'supplier-a',
        reference: 'WEB-1001',
        lines: [{ skuId: 'sku-a', quantity: 8, unitCost: 250000 }],
      }),
    )
    expect(await screen.findByText('PO-1001')).toBeInTheDocument()
  })

  it('creates a restock request directly from the warehouse purchase tab', async () => {
    const data = snapshot()
    data.permissions.push('purchaseRequest.create', 'purchaseRequest.read')
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    vi.mocked(inventoryService.command).mockResolvedValue({
      ...data,
      purchaseRequests: [
        {
          id: 'request-new',
          number: 'RR-20261117-002',
          warehouseId: 'warehouse-a',
          status: 'open',
          sourceReference: '',
          note: 'Tồn kho sắp hết',
          createdBy: 'user-a',
          createdAt: '2026-11-17T09:00:00Z',
          purchaseOrderId: null,
          purchaseOrderNumber: null,
          lines: [{ id: 'request-line-new', skuId: 'sku-a', requestedQuantity: 8 }],
        },
      ],
    })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    await user.click(screen.getByRole('button', { name: 'Tạo yêu cầu nhập hàng' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo yêu cầu nhập hàng' }))
    await dialog.findByRole('combobox', { name: 'Kho cần bổ sung' })
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Kho cần bổ sung' }), 'warehouse-a')
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Sản phẩm 1' }), 'sku-a')
    await user.clear(dialog.getByRole('spinbutton', { name: 'Tổng số lượng cần có' }))
    await user.type(dialog.getByRole('spinbutton', { name: 'Tổng số lượng cần có' }), '8')
    await user.type(dialog.getByRole('textbox', { name: 'Ghi chú' }), 'Tồn kho sắp hết')
    await user.click(dialog.getByRole('button', { name: 'Tạo yêu cầu' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('purchaseRequest.create', {
        warehouseId: 'warehouse-a',
        sourceReference: '',
        note: 'Tồn kho sắp hết',
        lines: [{ skuId: 'sku-a', requestedQuantity: 8 }],
      }),
    )
    expect(await screen.findByText('RR-20261117-002')).toBeInTheDocument()
  })

  it('lets a manager create a purchase proposal from a restock request', async () => {
    const data = snapshot()
    data.permissions.push(
      'purchaseRequest.read',
      'purchaseRequest.manage',
      'purchaseOrder.create',
    )
    data.suppliers.push({ id: 'supplier-a', code: 'SUP-1', name: 'Lumi Supply', active: true })
    data.purchaseRequests = [
      {
        id: 'request-a',
        number: 'RR-20261117-001',
        warehouseId: 'warehouse-a',
        status: 'open',
        sourceReference: 'conversation:conv-1',
        note: '',
        createdBy: 'staff-a',
        createdAt: '2026-11-17T09:00:00Z',
        purchaseOrderId: null,
        purchaseOrderNumber: null,
        lines: [{ id: 'request-line-a', skuId: 'sku-a', requestedQuantity: 4 }],
      },
    ]
    vi.mocked(inventoryService.load).mockResolvedValue(data)
    vi.mocked(inventoryService.command).mockResolvedValue({
      ...data,
      purchaseOrders: [purchaseOrderFixture()],
    })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    await user.click(screen.getByRole('button', { name: 'Lập đề xuất mua' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo đơn mua hàng' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Nhà cung cấp' }), 'supplier-a')
    expect(dialog.getByRole('spinbutton', { name: 'Số lượng đặt' })).toHaveValue(4)
    await user.type(dialog.getByRole('spinbutton', { name: 'Giá vốn / đơn vị (VND)' }), '250000')
    await user.click(dialog.getByRole('button', { name: 'Tạo đơn nháp' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith(
        'purchaseOrder.create',
        expect.objectContaining({
          warehouseId: 'warehouse-a',
          supplierId: 'supplier-a',
          restockRequestId: 'request-a',
          lines: [{ skuId: 'sku-a', quantity: 4, unitCost: 250000 }],
        }),
      ),
    )
  })

  it('approves and cancels purchase orders through permissioned commands', async () => {
    let value = snapshot()
    value.permissions.push('purchaseOrder.approve', 'purchaseOrder.cancel')
    const draft = purchaseOrderFixture()
    value.purchaseOrders = [draft]
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    vi.mocked(inventoryService.command).mockImplementation(async (action) => {
      const status = action === 'purchaseOrder.approve' ? 'approved' : 'cancelled'
      value = {
        ...value,
        purchaseOrders: [
          { ...draft, status, approvedBy: 'user-a', approvedAt: '2026-11-17T01:00:00Z' },
        ],
      }
      return value
    })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    await user.click(screen.getByRole('button', { name: 'Duyệt đơn' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('purchaseOrder.approve', {
        id: 'purchase-a',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Hủy đơn' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenLastCalledWith('purchaseOrder.cancel', {
        id: 'purchase-a',
      }),
    )
  })

  it('tracks partial receipts only after the linked receiving document is posted', async () => {
    const approved = purchaseOrderFixture('approved')
    let value: InventorySnapshot = {
      ...snapshot(),
      permissions: ['purchaseOrder.receive', 'document.approve', 'document.post'],
      purchaseOrders: [approved],
    }
    vi.mocked(inventoryService.load).mockResolvedValue(value)
    vi.mocked(inventoryService.command).mockImplementation(async (action) => {
      if (action === 'purchaseOrder.receive') {
        const receivedDraft = {
          id: 'receiving-a',
          number: 'PN-1001',
          type: 'receipt' as const,
          status: 'draft' as const,
          warehouseId: 'warehouse-a',
          targetWarehouseId: null,
          supplierId: 'supplier-a',
          reference: 'PO-1001',
          reason: '',
          createdAt: '2026-11-17T02:00:00Z',
          postedAt: null,
          purchaseOrderId: 'purchase-a',
          lines: [
            {
              id: 'receiving-line-a',
              skuId: 'sku-a',
              locationId: null,
              targetLocationId: null,
              quantity: 2,
              unitCost: 250000,
              inventoryValue: null,
              serialNumbers: [],
              purchaseOrderLineId: 'purchase-line-a',
            },
          ],
        }
        value = {
          ...value,
          documents: [receivedDraft],
          purchaseOrders: [
            {
              ...approved,
              receiptDocumentIds: ['receiving-a'],
              lines: [{ ...approved.lines[0], pendingReceiptQuantity: 2 }],
            },
          ],
          result: { id: 'receiving-a', number: 'PN-1001', purchaseOrderId: 'purchase-a' },
        }
      } else if (action === 'document.approve') {
        value = {
          ...value,
          documents: value.documents.map((document) => ({ ...document, status: 'approved' })),
        }
      } else if (action === 'document.post') {
        value = {
          ...value,
          documents: value.documents.map((document) => ({
            ...document,
            status: 'posted',
            postedAt: '2026-11-17T03:00:00Z',
          })),
          purchaseOrders: [
            {
              ...approved,
              status: 'partial',
              receiptDocumentIds: ['receiving-a'],
              lines: [
                {
                  ...approved.lines[0],
                  receivedQuantity: 2,
                  outstandingQuantity: 3,
                  pendingReceiptQuantity: 0,
                },
              ],
            },
          ],
        }
      }
      return value
    })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    await user.click(screen.getByRole('button', { name: 'Nhận theo đơn' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Nhận hàng · PO-1001' }))
    await user.clear(dialog.getByRole('spinbutton', { name: 'Số lượng nhận' }))
    await user.type(dialog.getByRole('spinbutton', { name: 'Số lượng nhận' }), '2')
    await user.click(dialog.getByRole('button', { name: 'Tạo phiếu nhận nháp' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenCalledWith('purchaseOrder.receive', {
        id: 'purchase-a',
        lines: [{ purchaseOrderLineId: 'purchase-line-a', quantity: 2 }],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    expect(screen.getByText(/5 \/ 0 \/ 2 \/ 5/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chứng từ' }))
    await user.click(await screen.findByRole('button', { name: 'Duyệt' }))
    await user.click(await screen.findByRole('button', { name: 'Ghi sổ' }))
    await waitFor(() =>
      expect(inventoryService.command).toHaveBeenLastCalledWith('document.post', {
        id: 'receiving-a',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Đơn mua hàng' }))
    expect(screen.getByText('Nhận một phần')).toBeInTheDocument()
    expect(screen.getByText(/5 \/ 2 \/ 0 \/ 3/)).toBeInTheDocument()
  })

  it('loads and merges older ledger pages without duplicating existing entries', async () => {
    const data = snapshot()
    data.ledger = Array.from({ length: 200 }, (_, index) => ({
      id: `ledger-${200 - index}`,
      sequence: 200 - index,
      warehouseId: 'warehouse-a',
      locationId: null,
      skuId: 'sku-a',
      documentId: null,
      countId: null,
      kind: 'receipt',
      quantity: 1,
      valueChange: 100,
      onHandAfter: 200 - index,
      valueAfter: (200 - index) * 100,
      createdAt: `2026-11-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    data.pagination = { ledgerLimit: 200, nextBeforeSequence: 1 }
    vi.mocked(inventoryService.load)
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce({
        ...snapshot(),
        ledger: [
          {
            ...data.ledger[0],
            id: 'ledger-1',
            sequence: 1,
            onHandAfter: 1,
            valueAfter: 100,
            createdAt: '2026-10-31T00:00:00Z',
          },
        ],
        pagination: { ledgerLimit: 200, nextBeforeSequence: null },
      })
    const user = userEvent.setup()
    render(<InventoryPage />)
    await screen.findByText('Công ty A')
    await user.click(screen.getByRole('button', { name: 'Sổ kho & nhật ký' }))
    await user.click(screen.getByRole('button', { name: 'Tải biến động cũ hơn' }))
    await waitFor(() =>
      expect(inventoryService.load).toHaveBeenLastCalledWith({
        ledgerLimit: 200,
        beforeSequence: 1,
      }),
    )
    expect(screen.queryByRole('button', { name: 'Tải biến động cũ hơn' })).not.toBeInTheDocument()
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('row')).toHaveLength(201)
  })
})
