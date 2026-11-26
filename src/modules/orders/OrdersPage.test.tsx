// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import I18nProvider from '../../i18n/I18nProvider'
import InventoryAuthPage from '../inventory/InventoryAuthPage'
import { InventoryApiError, inventoryService } from '../inventory/service'
import type { InventorySnapshot } from '../inventory/types'
import { OperationsContext } from '../operations/context'
import type { OperationsContextValue } from '../operations/context'
import type { OperationsData, OperationsService } from '../operations/types'
import OrdersPage from './OrdersPage'

vi.mock('../../services/inboxService', () => ({ APP_MODE: 'live', inboxService: {} }))
vi.mock('../inventory/service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../inventory/service')>()
  return {
    ...original,
    inventoryService: {
      ...original.inventoryService,
      load: vi.fn(),
      command: vi.fn(),
    },
  }
})

const snapshot = (): InventorySnapshot => ({
  tenant: { id: 'tenant-a', name: 'Công ty A', config: {} },
  actor: { userId: 'owner-a', role: 'owner' },
  permissions: ['salesOrder.create', 'salesOrder.return'],
  warehouses: [{ id: 'warehouse-a', code: 'MAIN', name: 'Kho chính', address: '', active: true }],
  locations: [],
  suppliers: [],
  skus: [
    {
      id: 'sku-a',
      sku: 'REAL-001',
      name: 'Sản phẩm thật',
      category: 'Thiết bị',
      unit: 'Cái',
      serialTracked: false,
      reorderPoint: 1,
      maxStock: 20,
      leadTimeDays: 3,
      active: true,
      price: 250000,
      priceKnown: true,
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
      inventoryValue: 500000,
      averageCost: 100000,
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

const operationsContext = () => {
  const operations: OperationsData = {
    schemaVersion: 1,
    customerProfiles: [],
    products: [
      {
        id: 'sku-a',
        sku: 'REAL-001',
        name: 'Sản phẩm thật',
        price: 250000,
        stock: 4,
        active: true,
      },
    ],
    orders: [],
    shipments: [],
    tickets: [],
    auditEvents: [],
  }
  const service: OperationsService = {
    load: async () => operations,
    updateCustomerProfile: async () => operations,
    addCustomerNote: async () => operations,
    createOrder: async (input) => ({
      ...operations,
      orders: [
        {
          id: 'order-a',
          number: 'SO-001',
          customerId: input.customerId,
          clientRequestId: input.clientRequestId,
          items: input.items.map((item) => ({
            ...item,
            sku: 'REAL-001',
            name: 'Sản phẩm thật',
            unitPrice: 250000,
          })),
          status: 'draft',
          paymentStatus: 'unpaid',
          paymentMethod: input.paymentMethod,
          subtotal: 250000,
          discount: input.discount,
          shippingFee: input.shippingFee,
          total: 250000 - input.discount + input.shippingFee,
          shippingAddress: input.shippingAddress,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          note: input.note,
          createdAt: '2026-11-17T09:00:00Z',
          updatedAt: '2026-11-17T09:00:00Z',
        },
      ],
    }),
    changeOrderStatus: async () => operations,
    changePaymentStatus: async () => operations,
    createShipment: async () => operations,
    advanceShipment: async () => operations,
    createTicket: async () => operations,
    updateTicket: async () => operations,
    addTicketComment: async () => operations,
    reset: async () => operations,
  }
  const value: OperationsContextValue = {
    inbox: {
      customers: [
        {
          id: 'customer-a',
          name: 'Khách A',
          phone: '0901234567',
          email: 'khach@example.com',
          company: '',
          membership: 'Standard',
          location: '12 Nguyễn Trãi, Hà Nội',
          avatarColor: '#123456',
        },
      ],
      conversations: [],
      agents: [],
      teams: [],
    },
    data: operations,
    service,
    busy: false,
    run: async (action) => action(),
    saveCustomer: async () => {
      throw new Error('Not used in this test')
    },
    refresh: async () => {},
    notify: () => {},
  }
  return value
}

const renderOrdersPage = (initialEntries = ['/orders'], context = operationsContext()) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <I18nProvider>
        <OperationsContext.Provider value={context}>
          <Routes>
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/login" element={<InventoryAuthPage />} />
          </Routes>
        </OperationsContext.Provider>
      </I18nProvider>
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the Orders page separate while creating an order from inventory-priced SKUs', async () => {
  const value = snapshot()
  const context = operationsContext()
  const createOrder = vi.spyOn(context.service, 'createOrder')
  vi.mocked(inventoryService.load).mockResolvedValue(value)
  renderOrdersPage(['/orders'], context)

  const user = userEvent.setup()
  expect(await screen.findByRole('heading', { name: 'Đơn hàng' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Quản lý kho hàng' })).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Chức năng kho' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Tạo đơn hàng' }))
  const form = within(await screen.findByRole('dialog', { name: 'Tạo đơn hàng' }))
  await user.selectOptions(form.getByRole('combobox', { name: 'Khách hàng' }), 'customer-a')
  expect(form.getByRole('option', { name: /REAL-001 · Sản phẩm thật ·/ })).toBeInTheDocument()
  await user.selectOptions(form.getByRole('combobox', { name: 'Sản phẩm 1' }), 'sku-a')
  await user.click(form.getByRole('button', { name: 'Tạo đơn nháp' }))

  await waitFor(() =>
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-a',
        warehouseId: 'warehouse-a',
        items: [{ productId: 'sku-a', quantity: 1 }],
      }),
    ),
  )
})

it('opens a prefilled canonical order form from a customer profile link', async () => {
  vi.mocked(inventoryService.load).mockResolvedValue(snapshot())
  renderOrdersPage(['/orders?customer=customer-a&create=1'])

  const form = within(await screen.findByRole('dialog', { name: 'Tạo đơn hàng' }))
  expect(form.getByRole('combobox', { name: 'Khách hàng' })).toHaveValue('customer-a')
  expect(form.getByRole('textbox', { name: 'Tên người nhận' })).toHaveValue('Khách A')
  expect(form.getByRole('textbox', { name: 'Số điện thoại' })).toHaveValue('0901234567')
})

it('offers a prefilled restock request when confirming a sales order fails for insufficient stock', async () => {
  const value = snapshot()
  value.permissions.push('salesOrder.confirm', 'purchaseRequest.create')
  value.salesOrders = [
    {
      id: 'sales-a',
      number: 'SO-20261123-001',
      warehouseId: 'warehouse-a',
      customerReference: 'Khách A',
      reference: 'WEB-1',
      note: '',
      status: 'draft',
      fulfillmentDocumentId: null,
      createdAt: '2026-11-23T09:00:00Z',
      lines: [
        {
          id: 'sales-line-a',
          skuId: 'sku-a',
          sku: 'REAL-001',
          name: 'Sản phẩm thật',
          quantity: 6,
          unitPrice: 250000,
          locationId: 'default',
          reservationId: null,
          returnedQuantity: 0,
          returnableQuantity: 6,
        },
        {
          id: 'sales-line-b',
          skuId: 'sku-a',
          sku: 'REAL-001',
          name: 'Sản phẩm thật',
          quantity: 2,
          unitPrice: 250000,
          locationId: 'default',
          reservationId: null,
          returnedQuantity: 0,
          returnableQuantity: 2,
        },
      ],
    },
  ]
  vi.mocked(inventoryService.load).mockResolvedValue(value)
  vi.mocked(inventoryService.command).mockImplementation(async (action) => {
    if (action === 'salesOrder.confirm')
      throw new InventoryApiError(409, 'INSUFFICIENT_STOCK', 'Tồn khả dụng không đủ để giữ hàng.')
    return {
      ...value,
      purchaseRequests: [
        {
          id: 'request-a',
          number: 'RR-20261123-001',
          warehouseId: 'warehouse-a',
          status: 'open',
          sourceReference: 'SO-20261123-001',
          note: 'Phát sinh do đơn bán SO-20261123-001 không đủ tồn để giữ hàng.',
          createdBy: 'owner-a',
          createdAt: '2026-11-23T09:05:00Z',
          purchaseOrderId: null,
          purchaseOrderNumber: null,
          lines: [{ id: 'request-line-a', skuId: 'sku-a', requestedQuantity: 8 }],
        },
      ],
    }
  })
  renderOrdersPage()

  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Xác nhận' }))
  const confirmDialog = within(
    await screen.findByRole('dialog', { name: 'Xác nhận & giữ hàng · SO-20261123-001' }),
  )
  await user.click(confirmDialog.getByRole('button', { name: 'Xác nhận & giữ hàng' }))
  expect(await confirmDialog.findByText('Tồn khả dụng không đủ để giữ hàng.')).toBeInTheDocument()
  await user.click(confirmDialog.getByRole('button', { name: 'Tạo yêu cầu nhập hàng' }))

  const requestDialog = within(
    await screen.findByRole('dialog', { name: 'Tạo yêu cầu nhập hàng' }),
  )
  expect(requestDialog.getByRole('combobox', { name: 'Kho cần bổ sung' })).toHaveValue(
    'warehouse-a',
  )
  expect(requestDialog.getByRole('combobox', { name: 'Sản phẩm 1' })).toHaveValue('sku-a')
  expect(requestDialog.getByRole('spinbutton', { name: 'Tổng số lượng cần có' })).toHaveValue(8)
  await user.click(requestDialog.getByRole('button', { name: 'Tạo yêu cầu' }))
  await waitFor(() =>
    expect(inventoryService.command).toHaveBeenLastCalledWith('purchaseRequest.create', {
      warehouseId: 'warehouse-a',
      sourceReference: 'SO-20261123-001',
      note: 'Phát sinh do đơn bán SO-20261123-001 không đủ tồn để giữ hàng.',
      lines: [{ skuId: 'sku-a', requestedQuantity: 8 }],
    }),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('does not offer a restock request when the user lacks create permission', async () => {
  const value = snapshot()
  value.permissions.push('salesOrder.confirm')
  value.salesOrders = [
    {
      id: 'sales-a',
      number: 'SO-20261123-002',
      warehouseId: 'warehouse-a',
      customerReference: 'Khách A',
      reference: '',
      note: '',
      status: 'draft',
      fulfillmentDocumentId: null,
      createdAt: '2026-11-23T09:00:00Z',
      lines: [
        {
          id: 'sales-line-a',
          skuId: 'sku-a',
          sku: 'REAL-001',
          name: 'Sản phẩm thật',
          quantity: 6,
          unitPrice: 250000,
          locationId: 'default',
          reservationId: null,
          returnedQuantity: 0,
          returnableQuantity: 6,
        },
      ],
    },
  ]
  vi.mocked(inventoryService.load).mockResolvedValue(value)
  vi.mocked(inventoryService.command).mockRejectedValue(
    new InventoryApiError(409, 'INSUFFICIENT_STOCK', 'Tồn khả dụng không đủ để giữ hàng.'),
  )
  renderOrdersPage()

  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Xác nhận' }))
  const confirmDialog = within(
    await screen.findByRole('dialog', { name: 'Xác nhận & giữ hàng · SO-20261123-002' }),
  )
  await user.click(confirmDialog.getByRole('button', { name: 'Xác nhận & giữ hàng' }))
  expect(await confirmDialog.findByText('Tồn khả dụng không đủ để giữ hàng.')).toBeInTheDocument()
  expect(
    confirmDialog.queryByRole('button', { name: 'Tạo yêu cầu nhập hàng' }),
  ).not.toBeInTheDocument()
})

it('records a customer return against the fulfilled order and its remaining returnable quantity', async () => {
  const value = snapshot()
  value.salesOrders = [
    {
      id: 'sales-a',
      number: 'SO-20261117-001',
      warehouseId: 'warehouse-a',
      customerReference: 'Khách A',
      reference: 'WEB-1',
      note: '',
      status: 'fulfilled',
      fulfillmentDocumentId: 'issue-a',
      createdAt: '2026-11-17T09:00:00Z',
      lines: [
        {
          id: 'sales-line-a',
          skuId: 'sku-a',
          sku: 'REAL-001',
          name: 'Sản phẩm thật',
          quantity: 2,
          unitPrice: 250000,
          locationId: 'default',
          reservationId: null,
          returnedQuantity: 0,
          returnableQuantity: 2,
        },
      ],
    },
  ]
  vi.mocked(inventoryService.load).mockResolvedValue(value)
  vi.mocked(inventoryService.command).mockResolvedValue(value)
  renderOrdersPage()

  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Nhận trả hàng' }))
  const form = within(
    await screen.findByRole('dialog', { name: 'Nhận hàng trả · SO-20261117-001' }),
  )
  await user.clear(form.getByRole('spinbutton', { name: 'Số lượng trả · REAL-001' }))
  await user.type(form.getByRole('spinbutton', { name: 'Số lượng trả · REAL-001' }), '1')
  await user.type(form.getByRole('textbox', { name: 'Lý do *' }), 'Sản phẩm lỗi')
  await user.click(form.getByRole('button', { name: 'Nhận hàng trả' }))

  await waitFor(() =>
    expect(inventoryService.command).toHaveBeenCalledWith('salesOrder.return', {
      id: 'sales-a',
      reason: 'Sản phẩm lỗi',
      lines: [{ lineId: 'sales-line-a', quantity: 1, serialNumbers: [] }],
    }),
  )
})

it('fulfills a reserved serial-tracked order and shows its posted stock issue', async () => {
  const value = snapshot()
  value.permissions.push('salesOrder.fulfill')
  value.skus[0].serialTracked = true
  value.salesOrders = [
    {
      id: 'sales-a',
      number: 'SO-101',
      warehouseId: 'warehouse-a',
      customerReference: 'Khách hàng A',
      reference: '',
      note: '',
      status: 'confirmed',
      fulfillmentDocumentId: null,
      createdAt: '2026-11-17T00:00:00Z',
      lines: [
        {
          id: 'sales-line-a',
          skuId: 'sku-a',
          sku: 'A-1',
          name: 'Công tắc',
          quantity: 1,
          unitPrice: 100,
          locationId: 'location-a',
          reservationId: 'reservation-a',
          returnedQuantity: 0,
          returnableQuantity: 1,
        },
      ],
    },
  ]
  vi.mocked(inventoryService.load).mockResolvedValue(value)
  vi.mocked(inventoryService.command).mockImplementation(async (action) =>
    action === 'salesOrder.fulfill'
      ? {
          ...value,
          salesOrders: [
            { ...value.salesOrders[0], status: 'fulfilled', fulfillmentDocumentId: 'issue-a' },
          ],
          documents: [
            {
              id: 'issue-a',
              number: 'PX-SO-101',
              type: 'issue',
              status: 'posted',
              warehouseId: 'warehouse-a',
              targetWarehouseId: null,
              supplierId: null,
              reference: 'SO-101',
              reason: 'Xuất bán',
              createdAt: '2026-11-17T00:00:00Z',
              postedAt: '2026-11-17T00:00:00Z',
              lines: [],
            },
          ],
        }
      : value,
  )

  const user = userEvent.setup()
  renderOrdersPage()

  await user.click(await screen.findByRole('button', { name: 'Xuất kho' }))
  const form = within(await screen.findByRole('dialog', { name: 'Xuất kho đơn bán · SO-101' }))
  await user.type(form.getByLabelText('Serial · A-1'), 'DEVICE-001')
  await user.click(form.getByRole('button', { name: 'Xuất kho đơn bán' }))
  await waitFor(() =>
    expect(inventoryService.command).toHaveBeenCalledWith('salesOrder.fulfill', {
      id: 'sales-a',
      lines: [{ lineId: 'sales-line-a', serialNumbers: ['DEVICE-001'] }],
    }),
  )
  expect(await screen.findByText(/PX-SO-101/)).toBeInTheDocument()
})
