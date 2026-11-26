// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { inboxService } from '../../services/inboxService'
import { operationsService } from './service'

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
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('smartsales.locale', 'en')
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
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
})

function open(path: string, width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Operations keyboard and recovery behavior', () => {
  it('navigates desktop modules through the main sidebar without a duplicate horizontal navigation bar', async () => {
    const user = open('/customers', 1440)
    await screen.findByRole('heading', { level: 1, name: 'Customers' })
    expect(screen.queryByRole('navigation', { name: 'Operations modules' })).not.toBeInTheDocument()
    const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    await user.click(sidebar.getByRole('link', { name: 'Orders' }))
    await screen.findByRole('heading', { level: 1, name: 'Orders' })
    await user.click(sidebar.getByRole('link', { name: 'Logistics' }))
    await screen.findByRole('heading', { level: 1, name: 'Logistics' })
    await user.click(sidebar.getByRole('link', { name: 'CRM' }))
    await screen.findByRole('heading', { level: 1, name: 'Customers' })
    expect(screen.queryByRole('navigation', { name: 'Operations modules' })).not.toBeInTheDocument()
  })

  it('focuses and contains keyboard navigation in a narrow drawer and restores its trigger on Escape', async () => {
    const user = open('/customers', 720)
    const trigger = await screen.findByRole('button', { name: /Mai Anh Nguyen CUS-001/ })
    trigger.focus()
    await user.keyboard('{Enter}')
    const drawer = within(await screen.findByRole('complementary', { name: 'Mai Anh Nguyen' }))
    const close = drawer.getByRole('button', { name: 'Close details' })
    await waitFor(() => expect(close).toHaveFocus())
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    const last = document.activeElement
    expect(last).not.toBe(close)
    expect(screen.getByRole('complementary', { name: 'Mai Anh Nguyen' })).toContainElement(
      last as HTMLElement,
    )
    await user.keyboard('{Tab}')
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Mai Anh Nguyen' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('exposes mobile Settings and Help, reports expansion, and closes navigation with Escape', async () => {
    const user = open('/customers', 390)
    await screen.findByRole('heading', { level: 1, name: 'Customers' })
    const toggle = screen.getByRole('button', { name: 'Open navigation' })
    expect(screen.queryByRole('navigation', { name: 'Operations modules' })).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const nav = screen.getByRole('navigation', { name: 'Operations modules' })
    expect(toggle).toHaveAttribute('aria-controls', nav.id)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(within(nav).getByRole('button', { name: 'Settings' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(nav).not.toBeInTheDocument()
    const settings = within(await screen.findByRole('dialog', { name: 'Operations settings' }))
    expect(
      settings.getByRole('heading', { name: 'API and service connections' }),
    ).toBeInTheDocument()
    expect(settings.getByRole('button', { name: 'Restore Demo operations' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(toggle)
    await user.click(
      within(screen.getByRole('navigation', { name: 'Operations modules' })).getByRole('button', {
        name: 'Help',
      }),
    )
    expect(await screen.findByRole('dialog', { name: 'SmartSales modules' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(toggle)
    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Operations modules' })).not.toBeInTheDocument()
  })

  it('opens integration settings instead of the market-intelligence dialog from its route', async () => {
    const user = open('/market-intelligence', 1440)
    await screen.findByRole('heading', { level: 1, name: 'AI market intelligence' })
    await user.click(screen.getByRole('button', { name: 'Settings' }))

    const settings = within(await screen.findByRole('dialog', { name: 'Operations settings' }))
    expect(
      settings.getByRole('heading', { name: 'API and service connections' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'AI market intelligence' })).not.toBeInTheDocument()
  })

  it('resets Inbox conversations while preserving canonical CRM contacts and linked operations', async () => {
    const customer = await inboxService.createCustomer({
      name: 'Customer to preserve',
      phone: '0909111222',
      email: 'preserve@example.com',
      company: 'Preserved business',
      membership: 'Gold',
      location: '22 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
    })
    await inboxService.updateCustomer('CUS-001', { name: 'Updated CRM contact' })
    const before = await operationsService.load()
    await operationsService.updateCustomerProfile(customer.id, {
      tags: ['Keep this tag'],
      status: 'active',
    })
    await operationsService.addCustomerNote(customer.id, 'Keep this customer note.')
    const withOrder = await operationsService.createOrder({
      customerId: customer.id,
      items: [{ productId: before.products[0].id, quantity: 1 }],
      discount: 0,
      shippingFee: 30000,
      paymentMethod: 'cod',
      recipientName: customer.name,
      recipientPhone: customer.phone,
      shippingAddress: customer.location,
      note: 'Keep this order.',
    })
    const order = withOrder.orders.find((item) => item.customerId === customer.id)!
    await operationsService.createTicket({
      customerId: customer.id,
      orderId: order.id,
      conversationId: null,
      subject: 'Keep this request',
      description: 'Follow up with this customer after the Inbox reset.',
      category: 'other',
      priority: 'high',
      assigneeId: null,
    })
    const operations = await operationsService.load()
    await inboxService.sendMessage('conv-001', {
      type: 'outgoing',
      text: 'Conversation message to reset.',
    })

    const user = open('/inbox', 1440)
    await screen.findByRole('main', { name: 'Conversation workspace' })
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Workspace settings' })).getByRole('button', {
        name: 'Reset Demo data',
      }),
    )
    const confirmation = within(screen.getByRole('dialog', { name: 'Reset Demo workspace?' }))
    expect(
      confirmation.getByText(/Customer profiles, orders, shipments and tickets are preserved/),
    ).toBeInTheDocument()
    await user.click(confirmation.getByRole('button', { name: 'Reset Demo data' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const inbox = await inboxService.load()
    expect(inbox.customers).toContainEqual(customer)
    expect(inbox.customers.find((item) => item.id === 'CUS-001')?.name).toBe('Updated CRM contact')
    expect(
      inbox.conversations
        .find((item) => item.id === 'conv-001')
        ?.messages.some((message) => message.text === 'Conversation message to reset.'),
    ).toBe(false)
    expect(await operationsService.load()).toEqual(operations)
  })
})
