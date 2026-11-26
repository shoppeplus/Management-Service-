import { describe, expect, it } from 'vitest'
import { canAccessModule, getDefaultRoute } from './access'

describe('role-based module access', () => {
  it('limits warehouse roles to inventory and product functions', () => {
    const receiver = { role: 'receiver', permissions: ['sku.create', 'document.post'] }

    expect(canAccessModule('Inventory', receiver)).toBe(true)
    expect(canAccessModule('Products', receiver)).toBe(true)
    expect(canAccessModule('Dashboard', receiver)).toBe(false)
    expect(canAccessModule('Admin', receiver)).toBe(false)
    expect(getDefaultRoute(receiver)).toBe('/products')
  })

  it('keeps administration exclusive to owners and administrators with read access', () => {
    const manager = { role: 'manager', permissions: ['operations.read', 'inbox.read'] }
    const administrator = {
      role: 'admin',
      permissions: ['operations.read', 'inbox.read'],
    }

    expect(canAccessModule('Admin', manager)).toBe(false)
    expect(canAccessModule('Admin', administrator)).toBe(true)
    expect(
      canAccessModule('Admin', { ...administrator, permissions: ['operations.read'] }),
    ).toBe(false)
    expect(getDefaultRoute(administrator)).toBe('/dashboard')
  })

  it('requires module responsibilities in addition to shared read access', () => {
    const staff = {
      role: 'staff',
      permissions: ['operations.read', 'inbox.read', 'orders.manage'],
    }

    expect(canAccessModule('Orders', staff)).toBe(true)
    expect(canAccessModule('Logistics', staff)).toBe(false)
  })

  it('grants accounting reports through explicit read permission, not admin status', () => {
    const manager = {
      role: 'manager',
      permissions: ['operations.read', 'inbox.read', 'accounting.read'],
    }

    expect(canAccessModule('Reports', manager)).toBe(true)
    expect(
      canAccessModule('Reports', { ...manager, permissions: ['operations.read', 'inbox.read'] }),
    ).toBe(false)
  })

  it('routes accountants to a separate accounting workspace, not inventory', () => {
    const accountant = {
      role: 'accountant',
      permissions: ['purchaseOrder.approve', 'accounting.read'],
    }

    expect(canAccessModule('Accounting', accountant)).toBe(true)
    expect(canAccessModule('Inventory', accountant)).toBe(false)
    expect(canAccessModule('Reports', accountant)).toBe(false)
    expect(getDefaultRoute(accountant)).toBe('/accounting')
  })
})
