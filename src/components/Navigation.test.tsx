// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nContext } from '../i18n/context'
import { AppAccessContext, DEMO_ACCESS } from '../modules/operations/access'
import OperationsLayout from '../modules/operations/OperationsLayout'
import { MainSidebar } from './Navigation'

afterEach(() => {
  cleanup()
})

function renderSidebar(
  onModule = vi.fn(),
  activeModule = 'Inbox',
  access = DEMO_ACCESS,
  adminMode = false,
  initialPath = '/inbox',
  topbarNavigation = false,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <I18nContext.Provider
        value={{
          locale: 'en',
          setLocale: vi.fn(),
          t: (_vi, en) => en,
          label: (name) => name,
        }}
      >
        <AppAccessContext.Provider value={access}>
          <MainSidebar
            onModule={onModule}
            onHelp={vi.fn()}
            mode="demo"
            activeModule={activeModule}
            adminMode={adminMode}
            topbarNavigation={topbarNavigation}
          />
        </AppAccessContext.Provider>
      </I18nContext.Provider>
    </MemoryRouter>,
  )
}

describe('MainSidebar', () => {
  it('shows each authorized workspace as a separate link', () => {
    renderSidebar()

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getByRole('link', { name: 'Inbox' })).toHaveAttribute('title', 'Inbox')
    expect(navigation.getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/inbox')
    expect(navigation.getByRole('link', { name: 'CRM' })).toHaveAttribute('title', 'CRM')
    expect(navigation.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/customers')
    expect(navigation.getByRole('link', { name: 'Customer Care' })).toHaveAttribute('href', '/care')
    expect(navigation.queryByRole('group')).not.toBeInTheDocument()
  })

  it('only shows assigned modules for an admin with management-only defaults', () => {
    renderSidebar(
      vi.fn(),
      'Dashboard',
      {
        role: 'admin',
        permissions: ['operations.read', 'inbox.read', 'accounting.read'],
      },
      false,
      '/dashboard',
    )

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(navigation.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports')
    expect(navigation.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument()
  })

  it('shows individual administration pages in the admin sidebar', () => {
    renderSidebar(vi.fn(), 'Admin', DEMO_ACCESS, true, '/admin/sales')

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getByRole('link', { name: 'Admin overview' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(navigation.getByRole('link', { name: 'Sales reports' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(navigation.getByRole('link', { name: 'Messages & care' })).toHaveAttribute(
      'href',
      '/admin/care',
    )
    expect(navigation.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('moves Reports and Admin out of the sidebar when topbar navigation is enabled', () => {
    renderSidebar(vi.fn(), 'Dashboard', DEMO_ACCESS, false, '/dashboard', true)

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows only individually assigned modules to a warehouse role', () => {
    renderSidebar(vi.fn(), 'Inventory', {
      role: 'receiver',
      permissions: ['sku.create', 'document.post'],
    })

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Products' })).toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Inventory' })).toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument()
  })

  it('shows accountants a separate accounting workspace without warehouse navigation', () => {
    renderSidebar(
      vi.fn(),
      'Accounting',
      {
        role: 'accountant',
        permissions: ['purchaseOrder.approve', 'accounting.read'],
      },
      false,
      '/accounting',
    )

    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getByRole('link', { name: 'Accounting' })).toHaveAttribute(
      'href',
      '/accounting',
    )
    expect(navigation.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('redirects an employee away from an unassigned module when opening its URL directly', async () => {
    render(
      <MemoryRouter initialEntries={['/orders']}>
        <I18nContext.Provider
          value={{
            locale: 'en',
            setLocale: vi.fn(),
            t: (_vi, en) => en,
            label: (name) => name,
          }}
        >
          <AppAccessContext.Provider
            value={{ role: 'receiver', permissions: ['sku.create', 'document.post'] }}
          >
            <Routes>
              <Route element={<OperationsLayout />}>
                <Route path="/orders" element={<h1>Orders workspace</h1>} />
                <Route path="/products" element={<h1>Products workspace</h1>} />
              </Route>
            </Routes>
          </AppAccessContext.Provider>
        </I18nContext.Provider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Products workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Orders workspace' })).not.toBeInTheDocument()
  })

  it('shows authorized Reports and Admin links in the operations topbar', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <I18nContext.Provider
          value={{
            locale: 'en',
            setLocale: vi.fn(),
            t: (_vi, en) => en,
            label: (name) => name,
          }}
        >
          <AppAccessContext.Provider value={DEMO_ACCESS}>
            <Routes>
              <Route element={<OperationsLayout />}>
                <Route path="/dashboard" element={<h1>Dashboard workspace</h1>} />
              </Route>
            </Routes>
          </AppAccessContext.Provider>
        </I18nContext.Provider>
      </MemoryRouter>,
    )

    const quickNavigation = within(screen.getByRole('navigation', { name: 'Quick navigation' }))
    expect(quickNavigation.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/reports',
    )
    expect(quickNavigation.getByRole('link', { name: 'Administration' })).toHaveAttribute(
      'href',
      '/admin',
    )
  })
})
