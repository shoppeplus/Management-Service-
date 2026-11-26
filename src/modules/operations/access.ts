import { createContext, useContext } from 'react'

export interface AppAccess {
  role: string
  permissions: string[]
}

export const DEMO_ACCESS: AppAccess = {
  role: 'owner',
  permissions: [
    'operations.read',
    'inbox.read',
    'inbox.manage',
    'inbox.message',
    'customers.manage',
    'crm.manage',
    'orders.manage',
    'logistics.manage',
    'care.manage',
    'warehouse.create',
    'warehouse.update',
    'location.create',
    'supplier.create',
    'supplier.update',
    'sku.create',
    'sku.update',
    'sku.import',
    'document.create',
    'document.approve',
    'document.post',
    'document.cancel',
    'document.transfer_receive',
    'reservation.create',
    'reservation.release',
    'purchaseRequest.create',
    'purchaseRequest.read',
    'purchaseRequest.manage',
    'purchaseOrder.create',
    'purchaseOrder.approve',
    'purchaseOrder.cancel',
    'purchaseOrder.receive',
    'count.create',
    'count.record',
    'count.approve',
    'warranty.create',
    'warranty.transition',
    'quality.reclassify',
    'config.update',
    'salesOrder.create',
    'salesOrder.confirm',
    'salesOrder.cancel',
    'salesOrder.fulfill',
    'salesOrder.return',
    'accounting.read',
    'accounting.post',
  ],
}

export const AppAccessContext = createContext<AppAccess>(DEMO_ACCESS)

const inventoryPermissions = [
  'warehouse.create',
  'warehouse.update',
  'location.create',
  'supplier.create',
  'supplier.update',
  'sku.create',
  'sku.update',
  'sku.import',
  'document.create',
  'document.approve',
  'document.post',
  'document.cancel',
  'document.transfer_receive',
  'reservation.create',
  'reservation.release',
  'purchaseRequest.create',
  'purchaseRequest.read',
  'purchaseRequest.manage',
  'purchaseOrder.create',
  'purchaseOrder.approve',
  'purchaseOrder.cancel',
  'purchaseOrder.receive',
  'count.create',
  'count.record',
  'count.approve',
  'warranty.create',
  'warranty.transition',
  'quality.reclassify',
  'config.update',
]

const moduleRules: Record<string, { all?: string[]; any?: string[]; admin?: boolean }> = {
  Admin: { all: ['operations.read', 'inbox.read'], admin: true },
  Inbox: { all: ['inbox.read'] },
  Dashboard: { all: ['operations.read', 'inbox.read'] },
  CRM: { all: ['operations.read', 'inbox.read', 'customers.manage', 'crm.manage'] },
  'Customer Care': { all: ['operations.read', 'inbox.read', 'care.manage'] },
  Orders: { all: ['operations.read', 'inbox.read', 'orders.manage'] },
  Logistics: { all: ['operations.read', 'inbox.read', 'logistics.manage'] },
  Inventory: { any: inventoryPermissions },
  Products: {
    any: [
      'sku.create',
      'sku.update',
      'sku.import',
      'document.create',
      'document.approve',
      'document.post',
      'document.transfer_receive',
      'purchaseOrder.receive',
      'salesOrder.create',
      'salesOrder.fulfill',
      'salesOrder.return',
    ],
  },
  'Market Intelligence': { all: ['operations.read', 'inbox.read'], admin: true },
  Reports: { all: ['operations.read', 'inbox.read', 'accounting.read'] },
  Accounting: { any: ['accounting.read', 'purchaseOrder.approve'] },
}

export const isAdministrator = (access: AppAccess) => ['owner', 'admin'].includes(access.role)

export function canAccessModule(name: string, access: AppAccess) {
  if (name === 'Inventory' && access.role === 'accountant') return false
  const rule = moduleRules[name]
  if (!rule) return false
  if (rule.admin && !isAdministrator(access)) return false
  const permissions = new Set(access.permissions)
  return (
    (!rule.all || rule.all.every((permission) => permissions.has(permission))) &&
    (!rule.any || rule.any.some((permission) => permissions.has(permission)))
  )
}

export function getDefaultRoute(access: AppAccess) {
  const destinations =
    access.role === 'accountant'
      ? ['Accounting']
      : isAdministrator(access)
        ? ['Dashboard', 'Admin', 'Inbox', 'CRM', 'Customer Care', 'Orders', 'Logistics', 'Inventory']
        : [
            'Inbox',
            'Dashboard',
            'CRM',
            'Customer Care',
            'Orders',
            'Logistics',
            'Products',
            'Inventory',
          ]
  const routes: Record<string, string> = {
    Admin: '/admin',
    Inbox: '/inbox',
    Dashboard: '/dashboard',
    CRM: '/customers',
    'Customer Care': '/care',
    Orders: '/orders',
    Logistics: '/logistics',
    Products: '/products',
    Inventory: '/inventory',
    Accounting: '/accounting',
  }
  const destination = destinations.find((name) => canAccessModule(name, access))
  return destination ? routes[destination] : '/access-denied'
}

export function useAppAccess() {
  return useContext(AppAccessContext)
}
