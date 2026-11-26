// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { inboxService } from '../../services/inboxService'
import { operationsService } from './service'

// Isolate persisted records before singleton adapters capture browser storage.
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

async function openModule(path: string, title: string) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: title, level: 1 })
  return { ...result, user: userEvent.setup() }
}

const dialog = (name: string) => within(screen.getByRole('dialog', { name }))
const detail = (name: string) => within(screen.getByRole('complementary', { name }))

describe('Connected sales operations', () => {
  it('creates a customer, reserves order stock and completes a Demo COD delivery across modules', async () => {
    const before = await operationsService.load()
    const product = before.products.find((item) => item.stock > 2)!
    const { user, unmount } = await openModule('/customers', 'Customers')
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    await user.type(
      dialog('Add customer').getByRole('textbox', { name: 'Full name' }),
      'Nguyễn Hải An',
    )
    await user.type(dialog('Add customer').getByRole('textbox', { name: 'Phone' }), '0909001122')
    await user.type(
      dialog('Add customer').getByRole('textbox', { name: 'Email' }),
      'hai.an@example.com',
    )
    await user.type(
      dialog('Add customer').getByRole('textbox', { name: 'Location' }),
      '12 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
    )
    await user.click(dialog('Add customer').getByRole('button', { name: 'Save customer' }))
    await screen.findByRole('complementary', { name: 'Nguyễn Hải An' })
    const customer = (await inboxService.load()).customers.find(
      (item) => item.name === 'Nguyễn Hải An',
    )!
    await user.click(detail(customer.name).getByRole('link', { name: 'Create order' }))
    await screen.findByRole('dialog', { name: 'Create order' })
    expect(dialog('Create order').getByRole('combobox', { name: 'Customer' })).toHaveValue(
      customer.id,
    )
    await user.selectOptions(
      dialog('Create order').getByRole('combobox', { name: 'Product 1' }),
      product.id,
    )
    await user.click(dialog('Create order').getByRole('button', { name: 'Create draft' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create order' })).not.toBeInTheDocument(),
    )
    const order = (await operationsService.load()).orders.find(
      (item) => item.customerId === customer.id,
    )!
    expect(order.status).toBe('draft')
    expect(
      (await operationsService.load()).products.find((item) => item.id === product.id)?.stock,
    ).toBe(product.stock)
    await user.click(detail(order.number).getByRole('button', { name: 'Confirm & reserve stock' }))
    await waitFor(() =>
      expect(detail(order.number).getByRole('button', { name: 'Start packing' })).toBeEnabled(),
    )
    expect(
      (await operationsService.load()).products.find((item) => item.id === product.id)?.stock,
    ).toBe(product.stock - 1)
    await user.click(detail(order.number).getByRole('button', { name: 'Start packing' }))
    await user.click(
      await within(screen.getByRole('complementary', { name: order.number })).findByRole('link', {
        name: 'Create shipment',
      }),
    )
    await screen.findByRole('dialog', { name: 'Create Demo shipment' })
    expect(
      dialog('Create Demo shipment').getByRole('combobox', { name: 'Order ready to ship' }),
    ).toHaveValue(order.id)
    await user.click(
      dialog('Create Demo shipment').getByRole('button', { name: 'Create Demo shipment' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const shipment = (await operationsService.load()).shipments.find(
      (item) => item.orderId === order.id,
    )!
    await user.click(
      detail(shipment.trackingNumber).getByRole('button', { name: 'Simulate pickup / retry' }),
    )
    await user.click(
      await detail(shipment.trackingNumber).findByRole('button', {
        name: 'Simulate successful delivery',
      }),
    )
    await user.click(
      dialog('Simulate successful delivery').getByRole('button', { name: 'Confirm simulation' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const completed = await operationsService.load()
    expect(completed.orders.find((item) => item.id === order.id)).toMatchObject({
      status: 'delivered',
      paymentStatus: 'paid',
    })
    expect(completed.shipments.find((item) => item.id === shipment.id)?.events).toHaveLength(3)
    await user.click(detail(shipment.trackingNumber).getByRole('link', { name: customer.name }))
    await screen.findByRole('heading', { name: 'Customers', level: 1 })
    expect(
      detail(customer.name).getByRole('link', { name: new RegExp(order.number) }),
    ).toBeInTheDocument()
    unmount()
    await openModule(`/orders?id=${order.id}`, 'Orders')
    expect(detail(order.number).getByText('Delivered')).toBeInTheDocument()
    expect(detail(order.number).getByText('Paid')).toBeInTheDocument()
  }, 30000)

  it('links a delivery ticket to its customer and order, enforces a resolution and persists internal notes', async () => {
    const order = (await operationsService.load()).orders[0]
    const { user } = await openModule(`/orders?id=${order.id}`, 'Orders')
    await user.click(detail(order.number).getByRole('link', { name: 'Create support ticket' }))
    await screen.findByRole('dialog', { name: 'Create support ticket' })
    const form = dialog('Create support ticket')
    expect(form.getByRole('combobox', { name: 'Customer' })).toHaveValue(order.customerId)
    expect(form.getByRole('combobox', { name: 'Related order' })).toHaveValue(order.id)
    await user.selectOptions(form.getByRole('combobox', { name: 'Category' }), 'delivery')
    await user.selectOptions(form.getByRole('combobox', { name: 'Priority' }), 'urgent')
    await user.type(form.getByRole('textbox', { name: 'Subject' }), 'Kiểm tra lịch giao hàng')
    await user.type(
      form.getByRole('textbox', { name: 'Description' }),
      'Khách cần giao hàng trước cuối tuần.',
    )
    await user.click(form.getByRole('button', { name: 'Create ticket' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const ticket = (await operationsService.load()).tickets.find(
      (item) => item.subject === 'Kiểm tra lịch giao hàng',
    )!
    expect(ticket).toMatchObject({
      customerId: order.customerId,
      orderId: order.id,
      category: 'delivery',
      priority: 'urgent',
    })
    await user.click(detail(ticket.number).getByRole('button', { name: 'Resolved' }))
    expect(detail(ticket.number).getByRole('alert')).toHaveTextContent('Enter a resolution')
    await user.type(
      detail(ticket.number).getByRole('textbox', { name: 'Support ticket note' }),
      'Đã nhờ kho ưu tiên đóng gói.',
    )
    await user.click(detail(ticket.number).getByRole('button', { name: 'Add note' }))
    await detail(ticket.number).findByText('Đã nhờ kho ưu tiên đóng gói.')
    await user.type(
      detail(ticket.number).getByRole('textbox', { name: 'Resolution' }),
      'Khách xác nhận lịch giao vào thứ Sáu.',
    )
    await user.click(detail(ticket.number).getByRole('button', { name: 'Resolved' }))
    await detail(ticket.number).findByText('SLA timer stopped')
    const saved = (await operationsService.load()).tickets.find((item) => item.id === ticket.id)!
    expect(saved.status).toBe('resolved')
    expect(saved.comments.at(-1)?.text).toBe('Đã nhờ kho ưu tiên đóng gói.')
    expect(saved.resolvedAt).toBeTruthy()
    expect(detail(ticket.number).getByRole('link', { name: order.number })).toHaveAttribute(
      'href',
      `/orders?id=${order.id}`,
    )
  }, 20000)

  it('combines accent-insensitive order search and status filters, with an actionable empty state', async () => {
    const data = await operationsService.load()
    const target = data.orders.find((item) => item.status === 'draft')!
    const customer = (await inboxService.load()).customers.find(
      (item) => item.id === target.customerId,
    )!
    const { user } = await openModule('/orders', 'Orders')
    const list = within(screen.getByRole('region', { name: 'Order list' }))
    const search = list.getByRole('textbox', { name: 'Search order, customer or phone…' })
    await user.type(
      search,
      customer.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd'),
    )
    await user.selectOptions(list.getByRole('combobox', { name: 'Filter order status' }), 'draft')
    expect(list.getByRole('button', { name: target.number })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'customer-does-not-exist')
    expect(list.getByRole('heading', { name: 'No matching orders' })).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Clear filters' }))
    expect(list.getByRole('combobox', { name: 'Filter order status' })).toHaveValue('all')
    expect(list.getAllByRole('row')).toHaveLength(data.orders.length + 1)
  })

  it('keeps the draft form open and reports service failures without inserting an order', async () => {
    const before = await operationsService.load()
    const customer = (await inboxService.load()).customers[0]
    const failure = vi
      .spyOn(operationsService, 'createOrder')
      .mockRejectedValueOnce(new Error('Service unavailable for this test'))
    const { user } = await openModule(`/orders?customer=${customer.id}&create=1`, 'Orders')
    await screen.findByRole('dialog', { name: 'Create order' })
    await user.selectOptions(
      dialog('Create order').getByRole('combobox', { name: 'Product 1' }),
      before.products[0].id,
    )
    const address = dialog('Create order').getByRole('textbox', { name: 'Shipping address' })
    await user.clear(address)
    await user.type(address, '12 Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh')
    await user.click(dialog('Create order').getByRole('button', { name: 'Create draft' }))
    await waitFor(() => expect(failure).toHaveBeenCalledTimes(1))
    expect(dialog('Create order').getByRole('alert')).toHaveTextContent(
      'Service unavailable for this test',
    )
    expect(dialog('Create order').getByRole('combobox', { name: 'Product 1' })).toHaveValue(
      before.products[0].id,
    )
    expect((await operationsService.load()).orders).toHaveLength(before.orders.length)
  })
})
