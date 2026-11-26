// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { inboxService } from '../../services/inboxService'
import { OPERATIONS_STORAGE_KEY, operationsService } from '../operations/service'

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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T12:00:00'))
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
  vi.useRealTimers()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

function open(path = '/dashboard', width = 1440) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Business overview integration', () => {
  const mainNavigation = () =>
    within(
      screen.getByRole('navigation', { name: /Main navigation|Điều hướng chính/ }),
    )

  it.each(['/', '/unknown-page'])('opens the overview as the landing page for %s', async (path) => {
    open(path)
    await screen.findByRole('main', { name: 'Business overview' })
    expect(
      mainNavigation().getByRole('link', { name: /Dashboard|Tổng quan/ }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('shows an initial load failure and retries the same service instead of inserting fallback data', async () => {
    const load = vi
      .spyOn(operationsService, 'load')
      .mockRejectedValueOnce(new Error('Overview data unavailable'))
    const user = open()
    await screen.findByRole('heading', { name: 'Unable to load module' })
    expect(screen.getByText('Overview data unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('main', { name: 'Business overview' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('main', { name: 'Business overview' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('opens the overview through the Inbox sidebar and keeps VI/EN navigation consistent', async () => {
    const user = open('/inbox')
    await screen.findByRole('main', { name: 'Conversation workspace' })
    const nav = mainNavigation()
    await user.click(nav.getByRole('link', { name: 'Dashboard' }))
    await screen.findByRole('main', { name: 'Business overview' })
    expect(mainNavigation().getByRole('link', { name: /Dashboard|Tổng quan/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(document.title).toBe('Dashboard · SmartSales Suite')
    await user.click(screen.getByRole('button', { name: 'Tiếng Việt' }))
    await screen.findByRole('main', { name: 'Tổng quan kinh doanh' })
    expect(screen.getByRole('heading', { name: /^Tổng quan/, level: 1 })).toBeInTheDocument()
    expect(
      mainNavigation().getByRole('link', { name: /Tổng quan|Dashboard/ }),
    ).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Tổng quan · SmartSales Suite')
  })

  it('opens the mobile overview navigation and uses the existing create-order form', async () => {
    const user = open('/dashboard', 390)
    await screen.findByRole('main', { name: 'Business overview' })
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const nav = within(screen.getByRole('navigation', { name: 'Operations modules' }))
    expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Operations modules' })).not.toBeInTheDocument()
    const main = within(screen.getByRole('main', { name: 'Business overview' }))
    await user.click(main.getByRole('link', { name: 'Create order' }))
    await screen.findByRole('dialog', { name: 'Create order' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('opens a priority conversation visibly from the overview on narrow screens', async () => {
    const user = open('/dashboard', 390)
    const main = within(await screen.findByRole('main', { name: 'Business overview' }))
    const priority = within(main.getByRole('region', { name: 'Needs your attention' }))
    const conversationLink = priority
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.startsWith('/inbox?conversation='))!
    expect(conversationLink).toBeDefined()
    const conversationId = new URL(
      conversationLink.getAttribute('href')!,
      'http://localhost',
    ).searchParams.get('conversation')
    const inbox = await inboxService.load()
    const conversation = inbox.conversations.find((item) => item.id === conversationId)!
    const customer = inbox.customers.find((item) => item.id === conversation.customerId)!
    await user.click(conversationLink)
    const workspace = await screen.findByRole('main', { name: 'Conversation workspace' })
    expect(within(workspace).getByRole('heading', { name: customer.name })).toBeInTheDocument()
    expect(workspace.closest('.app-shell')).toHaveClass('show-mobile-chat')
  })

  it('opens the overview using keyboard navigation from the narrow Inbox menu', async () => {
    const user = open('/inbox', 390)
    await screen.findByRole('main', { name: 'Conversation workspace' })
    await user.click(screen.getByRole('button', { name: 'Open inbox navigation' }))
    const inboxNavigation = within(screen.getByLabelText('Inbox navigation'))
    const link = await inboxNavigation.findByRole('link', { name: 'Dashboard' })
    expect(link).toHaveAttribute('href', '/dashboard')
    link.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('main', { name: 'Business overview' })
    expect(
      mainNavigation().getByRole('link', { name: /Dashboard|Tổng quan/ }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('opens the exact order selected from the recent-order list', async () => {
    const user = open()
    const main = within(await screen.findByRole('main', { name: 'Business overview' }))
    const records = await operationsService.load()
    const recent = [...records.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const orderLink = main.getByRole('link', { name: recent.number })
    expect(orderLink).toHaveAttribute('href', `/orders?id=${recent.id}`)
    await user.click(orderLink)
    const detail = await screen.findByRole('complementary', { name: recent.number })
    expect(within(detail).getByText(recent.number)).toBeInTheDocument()
  })

  it('filters order activity by period while retaining current outstanding work', async () => {
    const records = await operationsService.load()
    const draft = records.orders.find((order) => order.status === 'draft')!
    const old = {
      ...structuredClone(draft),
      id: 'order-period-20d',
      number: 'SS-PERIOD-20D',
      createdAt: new Date('2026-10-28T09:00:00').toISOString(),
    }
    records.orders.push(old)
    localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(records))
    const user = open()
    const main = within(await screen.findByRole('main', { name: 'Business overview' }))
    const periods = within(main.getByRole('group', { name: 'Overview period' }))
    const metrics = within(main.getByRole('region', { name: 'Period metrics' }))
    const orderMetric = within(metrics.getByText('Orders created').closest('article')!)
    const currentWork = within(main.getByRole('region', { name: 'Current workload' }))
    const currentOrders = within(currentWork.getByRole('link', { name: /Orders to process/ }))
    expect(periods.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(orderMetric.getByText('13')).toBeInTheDocument()
    expect(currentOrders.getByText('7')).toBeInTheDocument()
    await user.click(main.getByRole('button', { name: 'View data' }))
    expect(
      within(main.getByRole('table', { name: 'Daily activity data' })).getAllByRole('row'),
    ).toHaveLength(31)

    await user.click(periods.getByRole('button', { name: '7 days' }))
    expect(periods.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(orderMetric.getByText('12')).toBeInTheDocument()
    expect(currentOrders.getByText('7')).toBeInTheDocument()
    expect(
      within(main.getByRole('table', { name: 'Daily activity data' })).getAllByRole('row'),
    ).toHaveLength(8)

    await user.click(periods.getByRole('button', { name: '90 days' }))
    expect(orderMetric.getByText('13')).toBeInTheDocument()
    expect(currentOrders.getByText('7')).toBeInTheDocument()
    expect(
      within(main.getByRole('table', { name: 'Daily activity data' })).getAllByRole('row'),
    ).toHaveLength(91)
  })

  it('reports refresh failure without replacing the previously displayed data', async () => {
    const user = open()
    const main = within(await screen.findByRole('main', { name: 'Business overview' }))
    const firstOrder = main
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.startsWith('/orders?id='))!
    const previousText = firstOrder.textContent!
    vi.spyOn(operationsService, 'load').mockRejectedValueOnce(new Error('Dashboard refresh failed'))
    await user.click(main.getByRole('button', { name: 'Refresh' }))
    await main.findByText('Unable to refresh data')
    expect(main.getByText(/Showing the last successfully loaded data/)).toBeInTheDocument()
    expect(main.getByRole('link', { name: previousText })).toBeInTheDocument()
    await user.click(main.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('Overview updated.')
    expect(main.queryByText('Unable to refresh data')).not.toBeInTheDocument()
  })

  it('refreshes persisted changes and reports successful completion', async () => {
    const user = open()
    const main = within(await screen.findByRole('main', { name: 'Business overview' }))
    const records = await operationsService.load()
    const draft = records.orders.find((order) => order.status === 'draft')!
    records.orders.push({
      ...structuredClone(draft),
      id: 'order-refreshed',
      number: 'SS-REFRESHED',
      createdAt: new Date().toISOString(),
    })
    localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(records))
    expect(main.queryByRole('link', { name: 'SS-REFRESHED' })).not.toBeInTheDocument()
    await user.click(main.getByRole('button', { name: 'Refresh' }))
    expect(await main.findByRole('link', { name: 'SS-REFRESHED' })).toHaveAttribute(
      'href',
      '/orders?id=order-refreshed',
    )
    await screen.findByText('Overview updated.')
  })
})
