// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { inboxService } from './services/inboxService'
import { operationsService } from './modules/operations/service'
import { inventoryService } from './modules/inventory/service'
import type { InventorySnapshot } from './modules/inventory/types'
import type { Product } from './modules/operations/types'
import { clearDrafts, draftNamespace, readDraft, saveDraft } from './lib/drafts'

// Node 25 may expose an incomplete native localStorage to jsdom. Install isolated
// browser-compatible stores before the service singleton captures its storage.
vi.hoisted(() => {
  const createStorage = (): Storage => {
    const values = new Map<string, string>()
    return {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => {
        values.delete(key)
      },
      setItem: (key, value) => {
        values.set(key, String(value))
      },
    }
  }
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const value = createStorage()
    Object.defineProperty(window, name, { configurable: true, value })
    Object.defineProperty(globalThis, name, { configurable: true, value })
  }
})

beforeEach(async () => {
  window.localStorage.clear()
  window.localStorage.setItem('smartsales.locale', 'en')
  window.sessionStorage.clear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  await inboxService.reset()
  await operationsService.reset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

async function openInbox() {
  const result = render(
    <MemoryRouter initialEntries={['/inbox']}>
      <App />
    </MemoryRouter>,
  )
  await screen.findByRole('main', { name: 'Conversation workspace' })
  return { ...result, user: userEvent.setup() }
}

const workspace = () => within(screen.getByRole('main', { name: 'Conversation workspace' }))
const conversations = () => within(screen.getByRole('region', { name: 'Conversations' }))
const details = () => within(screen.getByRole('complementary', { name: 'Customer details' }))
const history = () => within(screen.getByRole('log', { name: 'Message history' }))
const savedConversation = async () =>
  (await inboxService.load()).conversations.find((item) => item.id === 'conv-001')!

const inventorySnapshot = (products: Product[] = []): InventorySnapshot => ({
  tenant: { id: 'tenant-a', name: 'Công ty A', config: {} },
  actor: { userId: 'owner-a', role: 'owner' },
  permissions: ['salesOrder.create'],
  warehouses: [{ id: 'warehouse-a', code: 'MAIN', name: 'Kho chính', address: '', active: true }],
  locations: [
    { id: 'location-a', warehouseId: 'warehouse-a', code: 'DEFAULT', name: 'Vị trí mặc định' },
  ],
  suppliers: [],
  skus: products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category ?? '',
    unit: product.unit ?? 'Cái',
    serialTracked: false,
    reorderPoint: 1,
    maxStock: 20,
    leadTimeDays: 3,
    active: true,
    price: product.price,
    priceKnown: true,
    metadata: {
      imageUrl: product.imageUrl,
      description: product.description,
    },
  })),
  balances: products.map((product) => ({
    warehouseId: 'warehouse-a',
    locationId: 'location-a',
    skuId: product.id,
    onHand: product.stock,
    reserved: 0,
    damaged: 0,
    warranty: 0,
    available: product.stock,
    inventoryValue: 0,
    averageCost: 0,
    updatedAt: '2026-11-17T09:00:00Z',
  })),
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

function messageArticle(text: string) {
  const article = history()
    .getAllByRole('article')
    .find((item) => within(item).queryByText(text))
  expect(article).toBeDefined()
  return within(article!)
}

describe('Omnichannel Inbox integration', () => {
  it('opens a separate read-only admin overview with cross-department reporting', async () => {
    const user = userEvent.setup()
    vi.spyOn(inventoryService, 'checkSession').mockResolvedValue({
      actor: { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' },
      user: {
        id: 'owner-a',
        name: 'Business Owner',
        email: 'owner@example.com',
        role: 'owner',
      },
      tenant: { id: 'tenant-a', name: 'Công ty A' },
      permissions: ['operations.read', 'inbox.read'],
    })
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('main', { name: 'Admin overview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Business administration/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Messaging & customer care' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create order' })).not.toBeInTheDocument()
    const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(sidebar.queryByRole('link', { name: 'Customers' })).not.toBeInTheDocument()
    expect(sidebar.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Inbox' })).not.toBeInTheDocument()

    await user.click(sidebar.getByRole('link', { name: 'Sales reports' }))
    expect(
      await screen.findByRole('heading', { name: /Sales reports|Báo cáo bán hàng/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Orders' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create order' })).not.toBeInTheDocument()
    await user.click(sidebar.getByRole('link', { name: 'Messages & care' }))
    expect(
      await screen.findByRole('heading', { name: /Conversation monitoring|Theo dõi hội thoại/ }),
    ).toBeInTheDocument()
    await user.click(sidebar.getByRole('link', { name: 'Work & staffing' }))
    expect(
      await screen.findByRole('heading', { name: /Staff workload|Tải công việc theo nhân viên/ }),
    ).toBeInTheDocument()
  })

  it('opens account sign-in and registration from the sidebar profile avatar', async () => {
    const { user } = await openInbox()
    const accountLink = screen.getByRole('link', { name: 'Sign in or create an account' })
    expect(accountLink).toHaveAttribute('href', '/login')
    await user.click(accountLink)
    expect(await screen.findByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Create a business account' }),
    ).toBeInTheDocument()
  })

  it('shows the signed-in user profile and granted permissions from the sidebar avatar', async () => {
    vi.spyOn(inventoryService, 'checkSession').mockResolvedValue({
      actor: { userId: 'user-a', tenantId: 'tenant-a', role: 'receiver' },
      user: {
        id: 'user-a',
        name: 'Mai Anh Nguyen',
        email: 'mai@example.com',
        role: 'receiver',
      },
      tenant: { id: 'tenant-a', name: 'Công ty Ánh Dương' },
      permissions: ['sku.create', 'document.post'],
    })
    const { user } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Account for Mai Anh Nguyen' }))
    const profile = await screen.findByRole('dialog', { name: 'Account information' })
    expect(profile).toHaveTextContent('Mai Anh Nguyen')
    expect(profile).toHaveTextContent('mai@example.com')
    expect(profile).toHaveTextContent('Công ty Ánh Dương')
    await user.click(within(profile).getByText('Assigned permissions (2)'))
    expect(profile).toHaveTextContent('Add products')
    expect(profile).toHaveTextContent('Post stock documents')
  })

  it('lets the signed-in user change their password from the account menu', async () => {
    vi.spyOn(inventoryService, 'checkSession').mockResolvedValue({
      actor: { userId: 'user-a', tenantId: 'tenant-a', role: 'receiver' },
      user: {
        id: 'user-a',
        name: 'Mai Anh Nguyen',
        email: 'mai@example.com',
        role: 'receiver',
      },
      tenant: { id: 'tenant-a', name: 'Công ty Ánh Dương' },
      permissions: ['sku.create'],
    })
    const changePassword = vi
      .spyOn(inventoryService, 'changePassword')
      .mockResolvedValue({ changed: true })
    const { user } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Account for Mai Anh Nguyen' }))
    const profile = await screen.findByRole('dialog', { name: 'Account information' })
    await user.click(within(profile).getByRole('button', { name: 'Change password' }))
    await user.type(within(profile).getByLabelText('Current password'), 'old-password-1234')
    await user.type(within(profile).getByLabelText('New password'), 'new-password-5678')
    await user.type(within(profile).getByLabelText('Confirm new password'), 'new-password-5678')
    await user.click(within(profile).getByRole('button', { name: 'Save new password' }))

    expect(changePassword).toHaveBeenCalledWith('old-password-1234', 'new-password-5678')
    expect(await within(profile).findByRole('status')).toHaveTextContent(
      'Password changed. Other signed-in sessions have been revoked.',
    )
  })

  it('opens a quotation for the active customer from the toolbar and restores focus on Escape', async () => {
    const { user } = await openInbox()
    const quoteButton = workspace().getByRole('button', { name: 'Create PDF quotation' })
    await user.click(quoteButton)
    const dialog = await screen.findByRole('dialog', { name: 'Create product quotation' })
    expect(within(dialog).getByText('A quotation for Mai Anh Nguyen')).toBeInTheDocument()
    await within(dialog).findByRole('button', { name: 'Select Bộ bình gốm Nordic' })
    await user.click(within(dialog).getByRole('button', { name: 'Select Bộ bình gốm Nordic' }))
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(within(dialog).getByRole('textbox', { name: 'Recipient name' })).toHaveValue(
      'Mai Anh Nguyen',
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(quoteButton).toHaveFocus()
  })

  it('keeps AI and quick order behind toolbar icons and returns focus after closing their dialogs', async () => {
    vi.spyOn(inventoryService, 'load').mockResolvedValue(inventorySnapshot())
    const { user } = await openInbox()
    const quickReplies = workspace().getByRole('button', { name: 'Quick replies' })
    const ai = workspace().getByRole('button', { name: 'AI Copilot' })
    const quickOrder = workspace().getByRole('button', { name: 'Quick order' })
    expect(quickReplies.parentElement?.nextElementSibling).toBe(ai)
    expect(workspace().queryByText('Demo · rule-based sample analysis')).not.toBeInTheDocument()
    expect(workspace().queryByText('Find products in messages')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(workspace().getByRole('button', { name: 'Create PDF quotation' })).toBeInTheDocument()

    await user.click(ai)
    const aiDialog = screen.getByRole('dialog', { name: 'AI Copilot' })
    expect(aiDialog).toHaveFocus()
    expect(within(aiDialog).getByText('Demo · rule-based sample analysis')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ai).toHaveFocus()

    await user.click(ai)
    await user.click(
      within(screen.getByRole('dialog', { name: 'AI Copilot' })).getByRole('button', {
        name: 'Use suggested reply',
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).not.toHaveValue('')
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveFocus()

    await user.click(quickOrder)
    const salesDialog = within(screen.getByRole('dialog', { name: 'Quick order' }))
    await user.click(await salesDialog.findByRole('button', { name: 'Create order manually' }))
    await screen.findByRole('dialog', { name: 'Create order' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Quick order' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(quickOrder).toHaveFocus()
  })

  it('matches customer message keywords without offering restock requests and creates a linked draft order', async () => {
    const inventory = inventorySnapshot([
      {
        id: 'sku-cup',
        sku: 'CUP-001',
        name: 'Cốc gốm màu kem',
        price: 250000,
        stock: 0,
      },
      {
        id: 'sku-candle',
        sku: 'CANDLE-001',
        name: 'Nến thơm Santal',
        price: 180000,
        stock: 5,
      },
    ])
    vi.spyOn(inventoryService, 'load').mockResolvedValue(inventory)
    vi.spyOn(inventoryService, 'command').mockImplementation(async (_action, input) => {
      const id = 'sales-conversation-1'
      const lines = input.lines as { skuId: string; quantity: number }[]
      const created = {
        id,
        number: 'SO-20261117-001',
        warehouseId: 'warehouse-a',
        customerReference: String(input.customerReference),
        reference: String(input.reference),
        note: String(input.note),
        status: 'draft' as const,
        fulfillmentDocumentId: null,
        createdAt: '2026-11-17T09:00:00Z',
        lines: lines.map((line, index) => {
          const sku = inventory.skus.find((item) => item.id === line.skuId)!
          return {
            id: `sales-line-${index}`,
            skuId: sku.id,
            sku: sku.sku,
            name: sku.name,
            quantity: line.quantity,
            unitPrice: sku.price ?? 0,
            locationId: 'location-a',
            reservationId: null,
            returnedQuantity: 0,
            returnableQuantity: line.quantity,
          }
        }),
      }
      return {
        ...inventory,
        salesOrders: [created],
        result: { id, number: created.number },
      }
    })
    const { user } = await openInbox()
    await user.click(screen.getByRole('button', { name: 'Manage message sources' }))
    const connections = within(
      await screen.findByRole('dialog', { name: 'Message sources & connections' }),
    )
    expect(await connections.findByRole('heading', { name: 'Marketplaces' })).toBeInTheDocument()
    await user.click(connections.getAllByRole('button', { name: 'Import samples' })[0])
    await waitFor(async () => {
      expect(
        (await inboxService.load()).conversations.some((item) => item.id === 'conv-demo-shopee'),
      ).toBe(true)
    })
    await user.keyboard('{Escape}')
    const list = conversations()
    await user.click(
      list.getByRole('button', { name: /^Trần Minh Quân, Đặt cốc gốm và nến thơm qua Shopee/ }),
    )
    await waitFor(() =>
      expect(workspace().getByRole('heading', { name: 'Trần Minh Quân' })).toBeInTheDocument(),
    )
    await user.click(workspace().getByRole('button', { name: 'Quick order' }))
    const sales = within(screen.getByRole('dialog', { name: 'Quick order' }))
    await user.click(await sales.findByRole('button', { name: 'Find products in messages' }))
    expect(await sales.findByText('Cốc gốm màu kem')).toBeInTheDocument()
    expect(sales.getByText('Nến thơm Santal')).toBeInTheDocument()
    expect(sales.queryByRole('button', { name: 'Request missing stock' })).not.toBeInTheDocument()
    const updatedSales = within(screen.getByRole('dialog', { name: 'Quick order' }))
    await user.click(updatedSales.getByRole('button', { name: 'Fill order from suggestions' }))
    const orderDialog = within(
      await screen.findByRole('dialog', { name: 'Create order' }),
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(orderDialog.getAllByRole('spinbutton', { name: /Line quantity/ })[0]).toHaveValue(2)
    expect(orderDialog.getByRole('textbox', { name: 'Note' })).toHaveValue(
      'Phone: 0912345678\nShipping address: 12 Cầu Giấy, Hà Nội',
    )
    expect(orderDialog.getByRole('textbox', { name: 'External order reference' })).toHaveValue(
      'conversation:conv-demo-shopee',
    )
    await user.click(orderDialog.getByRole('button', { name: 'Save draft order' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Create order' }),
      ).not.toBeInTheDocument(),
    )
    expect(inventoryService.command).toHaveBeenCalledWith(
      'salesOrder.create',
      expect.objectContaining({
        warehouseId: 'warehouse-a',
        customerReference: expect.stringContaining('CUS-002'),
        reference: 'conversation:conv-demo-shopee',
        lines: [
          { skuId: 'sku-cup', quantity: 2 },
          { skuId: 'sku-candle', quantity: 1 },
        ],
      }),
    )
    expect(await workspace().findByRole('link', { name: /SO-20261117-001/ })).toHaveAttribute(
      'href',
      '/orders',
    )
  })
  it('sends distinct replies and internal notes, persisting both without claiming provider delivery', async () => {
    const { user, unmount } = await openInbox()
    const reply = 'Em đã kiểm tra đơn hàng và sẽ cập nhật cho chị.'
    const note = 'Nhờ nhóm kho kiểm tra lịch giao quà tặng.'

    await user.type(workspace().getByRole('textbox', { name: 'Reply message' }), reply)
    await user.click(workspace().getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(messageArticle(reply).getByTitle('sent')).toBeInTheDocument())
    expect(messageArticle(reply).queryByText(/Internal note/)).not.toBeInTheDocument()
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue('')

    await user.click(workspace().getByRole('button', { name: 'Note' }))
    await user.type(workspace().getByRole('textbox', { name: 'Internal note' }), note)
    await user.click(workspace().getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(messageArticle(note).getByText(/Internal note/)).toBeInTheDocument())
    expect(messageArticle(note).queryByTitle('sent')).not.toBeInTheDocument()

    const saved = await savedConversation()
    expect(saved.messages.slice(-2)).toMatchObject([
      { text: reply, type: 'outgoing', delivery: 'sent' },
      { text: note, type: 'note' },
    ])
    unmount()
    await openInbox()
    expect(messageArticle(reply).getByText(reply)).toBeInTheDocument()
    expect(messageArticle(note).getByText(/Internal note/)).toBeInTheDocument()
  })

  it('combines customer search, status, channel and assignee filters and recovers from an empty result', async () => {
    const { user } = await openInbox()
    const activeCount = (await inboxService.load()).conversations.filter(
      (item) => item.status !== 'closed',
    ).length
    await user.click(conversations().getByRole('button', { name: 'Conversation filters' }))
    await user.type(
      conversations().getByRole('textbox', { name: 'Search conversations' }),
      'mai anh',
    )
    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by status' }),
      'open',
    )
    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by channel' }),
      'instagram',
    )
    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by assignee' }),
      'agent-linh',
    )
    expect(conversations().getByText('1 conversations')).toBeInTheDocument()
    expect(conversations().getByRole('button', { name: /^Mai Anh Nguyen,/ })).toBeInTheDocument()

    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by assignee' }),
      'agent-minh',
    )
    expect(
      conversations().getByRole('heading', { name: 'No conversations found' }),
    ).toBeInTheDocument()
    expect(
      conversations().queryByRole('button', { name: /^Mai Anh Nguyen,/ }),
    ).not.toBeInTheDocument()
    await user.click(conversations().getByRole('button', { name: 'Clear filters' }))
    expect(conversations().getByText(`${activeCount} conversations`)).toBeInTheDocument()
    expect(conversations().getByRole('textbox', { name: 'Search conversations' })).toHaveValue('')
    expect(conversations().getByRole('combobox', { name: 'Filter by channel' })).toHaveValue('all')
    expect(conversations().getByRole('combobox', { name: 'Filter by assignee' })).toHaveValue('all')
    expect(conversations().getByRole('combobox', { name: 'Filter by status' })).toHaveValue('all')
  })

  it('keeps assignment, team, priority and lifecycle changes synchronized across panels', async () => {
    const { user } = await openInbox()
    await user.selectOptions(
      workspace().getByRole('combobox', { name: 'Assign conversation' }),
      'agent-minh',
    )
    await waitFor(() =>
      expect(details().getByRole('combobox', { name: 'Assignee' })).toHaveValue('agent-minh'),
    )
    await user.selectOptions(
      workspace().getByRole('combobox', { name: 'Assign team' }),
      'team-sales',
    )
    await waitFor(() =>
      expect(details().getByRole('combobox', { name: 'Team' })).toHaveValue('team-sales'),
    )
    await user.selectOptions(details().getByRole('combobox', { name: 'Priority' }), 'urgent')
    await waitFor(() =>
      expect(details().getByRole('combobox', { name: 'Priority' })).toHaveValue('urgent'),
    )
    await user.selectOptions(
      workspace().getByRole('combobox', { name: 'Change conversation status' }),
      'resolved',
    )
    await waitFor(() =>
      expect(details().getByRole('combobox', { name: 'Status' })).toHaveValue('resolved'),
    )
    expect(details().getByText('SLA completed')).toBeInTheDocument()
    expect(await savedConversation()).toMatchObject({
      assigneeId: 'agent-minh',
      teamId: 'team-sales',
      priority: 'urgent',
      status: 'resolved',
    })

    await user.selectOptions(
      workspace().getByRole('combobox', { name: 'Change conversation status' }),
      'closed',
    )
    await waitFor(() =>
      expect(workspace().getByRole('textbox', { name: 'Reply message' })).toBeDisabled(),
    )
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    expect(workspace().getByRole('textbox', { name: 'Internal note' })).toBeEnabled()
    await user.selectOptions(
      workspace().getByRole('combobox', { name: 'Change conversation status' }),
      'open',
    )
    await user.click(workspace().getByRole('button', { name: 'Reply' }))
    await waitFor(() =>
      expect(workspace().getByRole('textbox', { name: 'Reply message' })).toBeEnabled(),
    )
  })

  it('edits the customer profile, adds and removes tags, and rejects duplicate tags', async () => {
    const { user } = await openInbox()
    await user.click(details().getByRole('button', { name: 'Edit customer profile' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit customer details' }))
    await user.clear(dialog.getByRole('textbox', { name: 'Full name' }))
    await user.type(dialog.getByRole('textbox', { name: 'Full name' }), 'Mai Anh QA')
    await user.clear(dialog.getByRole('textbox', { name: 'Email' }))
    await user.type(dialog.getByRole('textbox', { name: 'Email' }), 'maianh.qa@example.com')
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Membership' }), 'Platinum')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit customer details' }),
      ).not.toBeInTheDocument(),
    )
    expect(details().getByText('Mai Anh QA')).toBeInTheDocument()
    expect(details().getByRole('link', { name: 'maianh.qa@example.com' })).toBeInTheDocument()
    expect(conversations().getByRole('button', { name: /^Mai Anh QA,/ })).toBeInTheDocument()
    const savedCustomer = (await inboxService.load()).customers.find(
      (item) => item.id === 'CUS-001',
    )!
    expect(savedCustomer).toMatchObject({
      name: 'Mai Anh QA',
      email: 'maianh.qa@example.com',
      membership: 'Platinum',
    })

    await user.type(details().getByRole('textbox', { name: 'New tag' }), 'QA Followup')
    await user.click(details().getByRole('button', { name: 'Add tag' }))
    await waitFor(() =>
      expect(details().getByRole('button', { name: 'Remove tag QA Followup' })).toBeInTheDocument(),
    )
    await user.type(details().getByRole('textbox', { name: 'New tag' }), 'qa followup')
    await user.click(details().getByRole('button', { name: 'Add tag' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This tag already exists.')
    expect(
      (await savedConversation()).tags.filter((tag) => tag.toLowerCase() === 'qa followup'),
    ).toHaveLength(1)
    await user.click(details().getByRole('button', { name: 'Remove tag QA Followup' }))
    await waitFor(() =>
      expect(
        details().queryByRole('button', { name: 'Remove tag QA Followup' }),
      ).not.toBeInTheDocument(),
    )
    expect((await savedConversation()).tags).not.toContain('QA Followup')
  })

  it('preserves separate Reply and Note drafts when navigating between conversations', async () => {
    const { user } = await openInbox()
    const replyDraft = 'Nội dung phản hồi dành riêng cho khách.'
    const noteDraft = 'Ghi chú riêng cho nhân viên, không gửi ra ngoài.'
    await user.type(workspace().getByRole('textbox', { name: 'Reply message' }), replyDraft)
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    expect(workspace().getByRole('textbox', { name: 'Internal note' })).toHaveValue('')
    await user.type(workspace().getByRole('textbox', { name: 'Internal note' }), noteDraft)
    await user.click(conversations().getAllByRole('button', { name: /^Trần Minh Quân,/ })[0])
    await waitFor(() =>
      expect(workspace().getByRole('heading', { name: 'Trần Minh Quân' })).toBeInTheDocument(),
    )
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue('')
    await user.click(conversations().getByRole('button', { name: /^Mai Anh Nguyen,/ }))
    await waitFor(() =>
      expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue(replyDraft),
    )
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    expect(workspace().getByRole('textbox', { name: 'Internal note' })).toHaveValue(noteDraft)
    await user.click(workspace().getByRole('button', { name: 'Add note' }))
    await waitFor(() =>
      expect(messageArticle(noteDraft).getByText(/Internal note/)).toBeInTheDocument(),
    )
    await user.click(workspace().getByRole('button', { name: 'Reply' }))
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue(replyDraft)
    expect((await savedConversation()).messages.at(-1)).toMatchObject({
      text: noteDraft,
      type: 'note',
    })
  })

  it('shows a send error without losing the draft, then persists a successful retry', async () => {
    const { user } = await openInbox()
    const draft = 'Tin nhắn cần giữ lại nếu thao tác lưu thất bại.'
    const before = (await savedConversation()).messages.length
    const sendSpy = vi
      .spyOn(inboxService, 'sendMessage')
      .mockRejectedValueOnce(new Error('Không thể lưu Demo trong lần thử này.'))
    await user.type(workspace().getByRole('textbox', { name: 'Reply message' }), draft)
    await user.click(workspace().getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể lưu Demo trong lần thử này.',
    )
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue(draft)
    expect((await savedConversation()).messages).toHaveLength(before)
    expect(history().queryByText(draft)).not.toBeInTheDocument()
    await user.click(workspace().getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(messageArticle(draft).getByText(draft)).toBeInTheDocument())
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue('')
    expect((await savedConversation()).messages.at(-1)).toMatchObject({
      text: draft,
      type: 'outgoing',
    })
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })

  it('resets current Demo drafts and remounts the composer without clearing Live drafts', async () => {
    const { user } = await openInbox()
    const demoNamespace = draftNamespace('demo', import.meta.env.VITE_API_BASE_URL)
    const liveKey = `${draftNamespace('live', 'https://api.example.com/api')}conv-001:outgoing`
    saveDraft(liveKey, 'Live draft must survive a Demo reset')
    await user.type(
      workspace().getByRole('textbox', { name: 'Reply message' }),
      'Reply to discard on reset',
    )
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    await user.type(
      workspace().getByRole('textbox', { name: 'Internal note' }),
      'Internal draft to discard',
    )
    expect(readDraft(`${demoNamespace}conv-001:outgoing`)).toBe('Reply to discard on reset')
    expect(readDraft(`${demoNamespace}conv-001:note`)).toBe('Internal draft to discard')
    const previousComposerInput = workspace().getByRole('textbox', { name: 'Internal note' })

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Workspace settings' })).getByRole('button', {
        name: 'Reset Demo data',
      }),
    )
    await user.click(
      within(screen.getByRole('dialog', { name: 'Reset Demo workspace?' })).getByRole('button', {
        name: 'Reset Demo data',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(previousComposerInput).not.toBeInTheDocument()
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue('')
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    expect(workspace().getByRole('textbox', { name: 'Internal note' })).toHaveValue('')
    expect(readDraft(`${demoNamespace}conv-001:outgoing`)).toBe('')
    expect(readDraft(`${demoNamespace}conv-001:note`)).toBe('')
    expect(readDraft(liveKey)).toBe('Live draft must survive a Demo reset')
  })

  it('keeps modal focus through edits, blocks global search shortcuts in dialogs and restores focus on close', async () => {
    const { user } = await openInbox()
    const editButton = details().getByRole('button', { name: 'Edit customer profile' })
    await user.click(editButton)
    const editDialog = within(screen.getByRole('dialog', { name: 'Edit customer details' }))
    const fullName = editDialog.getByRole('textbox', { name: 'Full name' })
    expect(fullName).toHaveFocus()
    await user.keyboard('{End}/QA')
    expect(fullName).toHaveFocus()
    expect(fullName).toHaveValue('Mai Anh Nguyen/QA')
    const company = editDialog.getByRole('textbox', { name: 'Company' })
    await user.click(company)
    await user.keyboard('{End} / showroom')
    expect(company).toHaveFocus()
    expect(company).toHaveValue('Mây Studio / showroom')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editButton).toHaveFocus()

    const settingsButton = screen.getByRole('button', { name: 'Settings' })
    await user.click(settingsButton)
    const settingsDialog = screen.getByRole('dialog', { name: 'Workspace settings' })
    expect(settingsDialog).toHaveFocus()
    await user.keyboard('/')
    expect(settingsDialog).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(within(settingsDialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(settingsButton).toHaveFocus()
    await user.keyboard('/')
    expect(conversations().getByRole('textbox', { name: 'Search conversations' })).toHaveFocus()
  })

  it('isolates drafts by Demo/Live mode, API base URL, conversation and message type', () => {
    const demo = draftNamespace('demo')
    const firstApi = draftNamespace('live', 'https://one.example.com/api')
    const secondApi = draftNamespace('live', 'https://two.example.com/api')
    const unconfiguredApi = draftNamespace('live')
    expect(new Set([demo, firstApi, secondApi, unconfiguredApi]).size).toBe(4)
    expect(draftNamespace('demo', 'https://ignored.example.com/api')).toBe(demo)
    const entries = [
      [`${demo}conv-001:outgoing`, 'Demo reply'],
      [`${demo}conv-001:note`, 'Demo note'],
      [`${demo}conv-002:outgoing`, 'Another customer'],
      [`${firstApi}conv-001:outgoing`, 'First API reply'],
      [`${secondApi}conv-001:outgoing`, 'Second API reply'],
      [`${unconfiguredApi}conv-001:outgoing`, 'Unconfigured API reply'],
    ]
    entries.forEach(([key, value]) => saveDraft(key, value))
    entries.forEach(([key, value]) => expect(readDraft(key)).toBe(value))
    clearDrafts(demo)
    entries.slice(0, 3).forEach(([key]) => expect(readDraft(key)).toBe(''))
    entries.slice(3).forEach(([key, value]) => expect(readDraft(key)).toBe(value))
  })

  it('defaults to Vietnamese across the Inbox, customer profile and composer when no language is saved', async () => {
    window.localStorage.removeItem('smartsales.locale')
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <App />
      </MemoryRouter>,
    )
    const vietnameseWorkspace = within(
      await screen.findByRole('main', { name: 'Không gian hội thoại' }),
    )
    const vietnameseDetails = within(
      screen.getByRole('complementary', { name: 'Thông tin khách hàng' }),
    )
    const vietnameseList = within(screen.getByRole('region', { name: 'Danh sách hội thoại' }))
    expect(document.documentElement).toHaveAttribute('lang', 'vi')
    expect(document.title).toBe('Hộp thư · SmartSales Suite')
    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(vietnameseList.getByRole('heading', { name: 'Tất cả hội thoại' })).toBeInTheDocument()
    expect(vietnameseList.getByRole('textbox', { name: 'Tìm kiếm hội thoại' })).toBeInTheDocument()
    expect(vietnameseWorkspace.getByRole('button', { name: 'Gửi' })).toBeDisabled()
    expect(
      vietnameseWorkspace.getByRole('textbox', { name: 'Tin nhắn trả lời' }),
    ).toBeInTheDocument()
    expect(vietnameseDetails.getByRole('combobox', { name: 'Trạng thái' })).toHaveDisplayValue(
      'Đang mở',
    )
    expect(vietnameseDetails.getByRole('combobox', { name: 'Ưu tiên' })).toHaveDisplayValue('Cao')
    expect(vietnameseDetails.getByRole('heading', { name: 'Hồ sơ khách hàng' })).toBeInTheDocument()
    expect(vietnameseWorkspace.getByRole('heading', { name: 'Mai Anh Nguyen' })).toBeInTheDocument()
  })

  it('persists English and Vietnamese preferences across application remounts', async () => {
    window.localStorage.removeItem('smartsales.locale')
    const user = userEvent.setup()
    const first = render(
      <MemoryRouter initialEntries={['/inbox']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('main', { name: 'Không gian hội thoại' })
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.title).toBe('Inbox · SmartSales Suite')
    expect(window.localStorage.getItem('smartsales.locale')).toBe('en')
    first.unmount()

    const second = await openInbox()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(workspace().getByRole('button', { name: 'Send' })).toBeInTheDocument()
    await second.user.click(screen.getByRole('button', { name: 'Tiếng Việt' }))
    expect(document.documentElement).toHaveAttribute('lang', 'vi')
    expect(window.localStorage.getItem('smartsales.locale')).toBe('vi')
    second.unmount()

    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('main', { name: 'Không gian hội thoại' })
    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.title).toBe('Hộp thư · SmartSales Suite')
    expect(screen.getByRole('region', { name: 'Danh sách hội thoại' })).toBeInTheDocument()
  })

  it('preserves selected conversation, filters, customer messages and separate unsent drafts while changing language', async () => {
    const { user } = await openInbox()
    await user.click(conversations().getAllByRole('button', { name: /^Trần Minh Quân,/ })[0])
    await waitFor(() =>
      expect(workspace().getByRole('heading', { name: 'Trần Minh Quân' })).toBeInTheDocument(),
    )
    const selectedConversation = (await inboxService.load()).conversations.find(
      (item) => item.id === 'conv-002',
    )!
    const incomingText = selectedConversation.messages.find(
      (message) => message.type === 'incoming',
    )!.text
    const replyDraft = 'Bản nháp trả lời / Reply draft'
    const noteDraft = 'Ghi chú riêng / Internal draft'
    await user.type(workspace().getByRole('textbox', { name: 'Reply message' }), replyDraft)
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    await user.type(workspace().getByRole('textbox', { name: 'Internal note' }), noteDraft)
    await user.click(conversations().getByRole('button', { name: 'Conversation filters' }))
    await user.type(
      conversations().getByRole('textbox', { name: 'Search conversations' }),
      'minh quan',
    )
    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by channel' }),
      'whatsapp',
    )
    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by status' }),
      'open',
    )
    await user.selectOptions(
      conversations().getByRole('combobox', { name: 'Filter by assignee' }),
      'agent-linh',
    )

    await user.click(screen.getByRole('button', { name: 'Tiếng Việt' }))
    const vietnameseWorkspace = within(screen.getByRole('main', { name: 'Không gian hội thoại' }))
    const vietnameseList = within(screen.getByRole('region', { name: 'Danh sách hội thoại' }))
    expect(vietnameseWorkspace.getByRole('heading', { name: 'Trần Minh Quân' })).toBeInTheDocument()
    expect(vietnameseWorkspace.getByRole('textbox', { name: 'Ghi chú nội bộ' })).toHaveValue(
      noteDraft,
    )
    expect(vietnameseList.getByRole('textbox', { name: 'Tìm kiếm hội thoại' })).toHaveValue(
      'minh quan',
    )
    expect(vietnameseList.getByRole('combobox', { name: 'Lọc theo kênh' })).toHaveValue('whatsapp')
    expect(vietnameseList.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toHaveValue(
      'open',
    )
    expect(vietnameseList.getByRole('combobox', { name: 'Lọc theo nhân viên' })).toHaveValue(
      'agent-linh',
    )
    expect(vietnameseList.getByText('1 hội thoại')).toBeInTheDocument()
    expect(
      within(screen.getByRole('log', { name: 'Lịch sử tin nhắn' })).getByText(incomingText),
    ).toBeInTheDocument()
    await user.click(vietnameseWorkspace.getByRole('button', { name: 'Trả lời' }))
    expect(vietnameseWorkspace.getByRole('textbox', { name: 'Tin nhắn trả lời' })).toHaveValue(
      replyDraft,
    )

    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(workspace().getByRole('heading', { name: 'Trần Minh Quân' })).toBeInTheDocument()
    expect(workspace().getByRole('textbox', { name: 'Reply message' })).toHaveValue(replyDraft)
    expect(conversations().getByRole('textbox', { name: 'Search conversations' })).toHaveValue(
      'minh quan',
    )
    expect(conversations().getByRole('combobox', { name: 'Filter by channel' })).toHaveValue(
      'whatsapp',
    )
    expect(history().getByText(incomingText)).toBeInTheDocument()
    await user.click(workspace().getByRole('button', { name: 'Note' }))
    expect(workspace().getByRole('textbox', { name: 'Internal note' })).toHaveValue(noteDraft)
    expect(
      (await inboxService.load()).conversations.find((item) => item.id === 'conv-002')!.messages,
    ).toEqual(selectedConversation.messages)
  })
})
