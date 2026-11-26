// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppAccessContext } from '../operations/access'
import type { InventorySnapshot, PurchaseOrder } from '../inventory/types'
import { inventoryService } from '../inventory/service'
import { I18nContext } from '../../i18n/context'
import AccountantWorkspace from './AccountantWorkspace'

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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const makeOrder = (status: PurchaseOrder['status']): PurchaseOrder => ({
  id: 'po-1',
  number: 'PO-2026-001',
  warehouseId: 'wh-1',
  supplierId: 'supplier-1',
  status,
  reference: 'RESTOCK-01',
  note: 'Urgent replenishment',
  createdBy: 'manager-1',
  approvedBy: status === 'draft' ? null : 'accountant-1',
  createdAt: '2026-06-10T09:00:00.000Z',
  approvedAt: status === 'draft' ? null : '2026-06-10T10:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  lines: [
    {
      id: 'line-1',
      purchaseOrderId: 'po-1',
      skuId: 'sku-1',
      locationId: null,
      quantity: 3,
      unitCost: 125000,
      receivedQuantity: 0,
      outstandingQuantity: 3,
      pendingReceiptQuantity: 0,
    },
  ],
  receiptDocumentIds: [],
})

const makeSnapshot = (status: PurchaseOrder['status']): InventorySnapshot =>
  ({
    tenant: { id: 'tenant-1', name: 'SmartSales', config: {} },
    actor: { userId: 'accountant-1', role: 'accountant' },
    permissions: ['purchaseOrder.approve', 'accounting.read'],
    warehouses: [{ id: 'wh-1', code: 'WH1', name: 'Main warehouse', address: '', active: true }],
    locations: [],
    suppliers: [
      {
        id: 'supplier-1',
        code: 'SUP-1',
        name: 'Reliable Supplier',
      },
    ],
    skus: [
      {
        id: 'sku-1',
        sku: 'SKU-1',
        name: 'Coffee beans',
        category: 'Grocery',
        unit: 'bag',
        serialTracked: false,
        reorderPoint: 0,
        maxStock: 10,
        leadTimeDays: 2,
        active: true,
      },
    ],
    balances: [],
    documents: [],
    purchaseRequests: [],
    purchaseOrders: [makeOrder(status)],
    salesOrders: [],
    ledger: [],
    reservations: [],
    counts: [],
    serials: [],
    warranties: [],
    auditEvents: [],
    metrics: {} as InventorySnapshot['metrics'],
  }) as InventorySnapshot

function renderWorkspace(permissions = ['purchaseOrder.approve', 'accounting.read']) {
  return render(
    <I18nContext.Provider
      value={{
        locale: 'en',
        setLocale: vi.fn(),
        t: (_vi, en) => en,
        label: (name) => name,
      }}
    >
      <AppAccessContext.Provider
        value={{
          role: 'accountant',
          permissions,
        }}
      >
        <AccountantWorkspace />
      </AppAccessContext.Provider>
    </I18nContext.Provider>,
  )
}

describe('Accountant workspace', () => {
  it('groups available accounting tasks in a dedicated menu', async () => {
    vi.mocked(inventoryService.load).mockResolvedValue(makeSnapshot('draft'))
    renderWorkspace()

    expect(await screen.findByRole('heading', { name: 'Accounting tasks' })).toBeInTheDocument()
    const menu = within(screen.getByRole('navigation', { name: 'Accounting tasks' }))
    expect(menu.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(menu.getByRole('button', { name: /Purchase approvals/ })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Trial balance' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Journal' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Chart of accounts' })).toBeInTheDocument()
  })

  it('hides ledger tasks when the user only has purchase approval access', async () => {
    vi.mocked(inventoryService.load).mockResolvedValue(makeSnapshot('draft'))
    renderWorkspace(['purchaseOrder.approve'])

    const menu = within(await screen.findByRole('navigation', { name: 'Accounting tasks' }))
    expect(menu.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: /Purchase approvals/ })).toBeInTheDocument()
    expect(menu.queryByRole('button', { name: 'Trial balance' })).not.toBeInTheDocument()
    expect(menu.queryByRole('button', { name: 'Journal' })).not.toBeInTheDocument()
    expect(menu.queryByRole('button', { name: 'Chart of accounts' })).not.toBeInTheDocument()
  })

  it('lets accountants inspect line items and approve a purchase order', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.load).mockResolvedValue(makeSnapshot('draft'))
    vi.mocked(inventoryService.command).mockResolvedValue(makeSnapshot('approved'))
    renderWorkspace()
    await user.click(
      within(screen.getByRole('navigation', { name: 'Accounting tasks' })).getByRole('button', {
        name: /Purchase approvals/,
      }),
    )

    const details = await screen.findByText('PO-2026-001')
    expect(details).toBeInTheDocument()
    expect(screen.getByText('Reliable Supplier')).toBeInTheDocument()
    expect(screen.getAllByText('₫375,000')).toHaveLength(2)

    await user.click(screen.getByText('Review line-item details'))
    expect(screen.getByText('Coffee beans')).toBeInTheDocument()
    expect(screen.getByText(/₫125,000\s*×\s*3/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Approve order' }))
    expect(inventoryService.command).toHaveBeenCalledWith('purchaseOrder.approve', { id: 'po-1' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Order PO-2026-001 approved.',
    )
    expect(screen.getByText('No purchase orders need review')).toBeInTheDocument()
  })

  it('surfaces loading failures and offers an explicit retry', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.load)
      .mockRejectedValueOnce(new Error('Inventory API unavailable'))
      .mockResolvedValueOnce(makeSnapshot('draft'))
    renderWorkspace()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Inventory API unavailable')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await user.click(
      within(screen.getByRole('navigation', { name: 'Accounting tasks' })).getByRole('button', {
        name: /Purchase approvals/,
      }),
    )
    expect(await screen.findByText('PO-2026-001')).toBeInTheDocument()
    expect(inventoryService.load).toHaveBeenCalledTimes(2)
  })

  it('explains why an unlinked draft receipt is not in the purchase approval queue', async () => {
    const snapshot = makeSnapshot('draft')
    snapshot.purchaseOrders = []
    snapshot.documents.push({
      id: 'receipt-1',
      number: 'PN-20261123-6C39E849',
      type: 'receipt',
      status: 'draft',
      warehouseId: 'wh-1',
      targetWarehouseId: null,
      supplierId: null,
      reference: '',
      reason: '',
      createdAt: '2026-11-23T12:29:00.000Z',
      postedAt: null,
      lines: [],
    })
    vi.mocked(inventoryService.load).mockResolvedValue(snapshot)
    renderWorkspace()
    const user = userEvent.setup()
    await user.click(
      within(screen.getByRole('navigation', { name: 'Accounting tasks' })).getByRole('button', {
        name: /Purchase approvals/,
      }),
    )

    const warning = await screen.findByRole('note')
    expect(warning).toHaveTextContent('PN-20261123-6C39E849')
    expect(warning).toHaveTextContent(
      'A PN receipt is a stock document, not a purchase order for accounting approval.',
    )
    expect(screen.getByText('No purchase orders need review')).toBeInTheDocument()
  })
})
