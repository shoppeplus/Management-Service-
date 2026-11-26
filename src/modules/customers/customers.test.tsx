// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { inboxService } from '../../services/inboxService'
import { operationsService } from '../operations/service'

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

async function openCustomers(path = '/customers') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Customers' })
  return userEvent.setup()
}

describe('Customer operations', () => {
  it('creates a canonical customer and passes their contact data into a new order', async () => {
    const user = await openCustomers()
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    const form = within(screen.getByRole('dialog', { name: 'Add customer' }))
    await user.type(form.getByLabelText('Full name'), 'Nguyễn Hoài An')
    await user.type(form.getByLabelText('Phone'), '0911222333')
    await user.type(form.getByLabelText('Email'), 'hoaian@example.com')
    await user.type(form.getByLabelText('Location'), '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh')
    await user.selectOptions(form.getByLabelText('Membership'), 'Gold')
    await user.click(form.getByRole('button', { name: 'Save customer' }))
    const drawer = within(await screen.findByRole('complementary', { name: 'Nguyễn Hoài An' }))
    const customer = (await inboxService.load()).customers.find(
      (item) => item.name === 'Nguyễn Hoài An',
    )!
    expect(customer.id).toBe('CUS-011')
    expect(
      (await operationsService.load()).customerProfiles.find(
        (item) => item.customerId === customer.id,
      )?.status,
    ).toBe('lead')

    await user.click(drawer.getByRole('link', { name: 'Create order' }))
    const order = within(await screen.findByRole('dialog', { name: 'Create order' }))
    expect(order.getByLabelText('Customer')).toHaveValue(customer.id)
    expect(order.getByLabelText('Recipient')).toHaveValue('Nguyễn Hoài An')
    expect(order.getByLabelText('Recipient phone')).toHaveValue('0911222333')
    expect(order.getByLabelText('Shipping address')).toHaveValue(customer.location)
  })

  it('reflects an edited CRM contact in the linked Inbox customer profile', async () => {
    const user = await openCustomers('/customers?id=CUS-001')
    const drawer = within(screen.getByRole('complementary', { name: 'Mai Anh Nguyen' }))
    await user.click(drawer.getByRole('button', { name: 'Edit customer' }))
    const form = within(screen.getByRole('dialog', { name: 'Edit customer' }))
    await user.clear(form.getByLabelText('Full name'))
    await user.type(form.getByLabelText('Full name'), 'Mai Anh CRM')
    await user.clear(form.getByLabelText('Phone'))
    await user.type(form.getByLabelText('Phone'), '0901234000')
    await user.click(form.getByRole('button', { name: 'Save customer' }))
    const updated = within(await screen.findByRole('complementary', { name: 'Mai Anh CRM' }))
    const conversationLink = updated
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/inbox?conversation=conv-001')!
    expect(conversationLink).toBeDefined()
    await user.click(conversationLink)
    const details = within(await screen.findByRole('complementary', { name: 'Customer details' }))
    expect(details.getByText('Mai Anh CRM')).toBeInTheDocument()
    expect(details.getByText('0901234000')).toBeInTheDocument()
    expect((await inboxService.load()).customers.find((item) => item.id === 'CUS-001')?.name).toBe(
      'Mai Anh CRM',
    )
  })

  it('preserves contact input on validation errors and persists customer notes and unique tags', async () => {
    const user = await openCustomers('/customers?id=CUS-001')
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    const form = within(screen.getByRole('dialog', { name: 'Add customer' }))
    await user.type(form.getByLabelText('Full name'), 'Duplicate Contact')
    await user.click(form.getByRole('button', { name: 'Save customer' }))
    expect(form.getByRole('alert')).toHaveTextContent('Enter a phone number or email address')
    await user.type(form.getByLabelText('Phone'), '0903456789')
    await user.click(form.getByRole('button', { name: 'Save customer' }))
    await waitFor(() => expect(form.getByRole('alert')).toHaveTextContent(/already exists/i))
    expect(form.getByLabelText('Full name')).toHaveValue('Duplicate Contact')
    expect((await inboxService.load()).customers).toHaveLength(10)
    await user.click(form.getByRole('button', { name: 'Cancel' }))

    const drawer = within(screen.getByRole('complementary', { name: 'Mai Anh Nguyen' }))
    await user.type(drawer.getByLabelText('New customer tag'), 'Follow-up')
    await user.click(drawer.getByRole('button', { name: 'Add' }))
    await drawer.findByRole('button', { name: 'Remove tag Follow-up' })
    await user.type(drawer.getByLabelText('New customer tag'), 'follow-up')
    await user.click(drawer.getByRole('button', { name: 'Add' }))
    expect(drawer.getByRole('alert')).toHaveTextContent('This tag already exists.')
    await user.type(drawer.getByLabelText('Customer note'), 'Call before delivering the gift set.')
    await user.click(drawer.getByRole('button', { name: 'Save note' }))
    await drawer.findByText('Call before delivering the gift set.')
    const profile = (await operationsService.load()).customerProfiles.find(
      (item) => item.customerId === 'CUS-001',
    )!
    expect(profile.tags.filter((tag) => tag.toLowerCase() === 'follow-up')).toHaveLength(1)
    expect(profile.notes.some((note) => note.text === 'Call before delivering the gift set.')).toBe(
      true,
    )
    await user.click(drawer.getByRole('button', { name: 'Remove tag Follow-up' }))
    await waitFor(() =>
      expect(
        drawer.queryByRole('button', { name: 'Remove tag Follow-up' }),
      ).not.toBeInTheDocument(),
    )
  })
})
