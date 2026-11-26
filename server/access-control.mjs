export const SALES_ACTIONS = [
  'salesOrder.create',
  'salesOrder.confirm',
  'salesOrder.cancel',
  'salesOrder.fulfill',
  'salesOrder.return',
]

const inventoryActions = [
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
const basicActions = [
  'document.create',
  'reservation.create',
  'reservation.release',
  'count.create',
  'count.record',
  'warranty.create',
  'warranty.transition',
  'purchaseRequest.create',
  'purchaseRequest.read',
]
const salesManagerActions = [...SALES_ACTIONS]
const salesOperationalActions = ['salesOrder.create', 'salesOrder.confirm', 'salesOrder.cancel']
const businessActions = [
  'operations.read',
  'inbox.read',
  'inbox.manage',
  'inbox.message',
  'customers.manage',
  'crm.manage',
  'orders.manage',
  'logistics.manage',
  'care.manage',
]
const accountingActions = ['accounting.read', 'accounting.post']

export const ALL_PERMISSIONS = [
  ...inventoryActions,
  ...SALES_ACTIONS,
  ...businessActions,
  ...accountingActions,
]
export const DEFAULT_ROLE_PERMISSIONS = {
  owner: ALL_PERMISSIONS,
  admin: ['operations.read', 'inbox.read', 'accounting.read'],
  manager: ALL_PERMISSIONS.filter(
    (permission) =>
      !['config.update', 'accounting.post', 'purchaseOrder.approve'].includes(permission),
  ),
  accountant: ['purchaseOrder.approve', 'accounting.read'],
  receiver: [
    'sku.create',
    'sku.update',
    'sku.import',
    'document.transfer_receive',
    'warranty.create',
    'warranty.transition',
  ],
  staff: basicActions,
  issuer: salesOperationalActions,
  counter: ['count.create', 'count.record'],
  approver: [
    'document.approve',
    'document.post',
    'document.cancel',
    'document.transfer_receive',
    'count.approve',
  ],
  viewer: [],
}
DEFAULT_ROLE_PERMISSIONS.owner = [...DEFAULT_ROLE_PERMISSIONS.owner, ...businessActions]
DEFAULT_ROLE_PERMISSIONS.manager = [...DEFAULT_ROLE_PERMISSIONS.manager, ...businessActions]
DEFAULT_ROLE_PERMISSIONS.staff = [
  ...DEFAULT_ROLE_PERMISSIONS.staff,
  'operations.read',
  'inbox.read',
  'inbox.manage',
  'inbox.message',
  'customers.manage',
  'crm.manage',
  'orders.manage',
  'care.manage',
]
DEFAULT_ROLE_PERMISSIONS.issuer = [
  ...DEFAULT_ROLE_PERMISSIONS.issuer,
  'document.create',
  'reservation.create',
  'reservation.release',
]
DEFAULT_ROLE_PERMISSIONS.manager = [...salesManagerActions, ...DEFAULT_ROLE_PERMISSIONS.manager]
DEFAULT_ROLE_PERMISSIONS.staff = [...salesOperationalActions, ...DEFAULT_ROLE_PERMISSIONS.staff]
for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS))
  DEFAULT_ROLE_PERMISSIONS[role] = [...new Set(DEFAULT_ROLE_PERMISSIONS[role])]

export function permissionsForUser(db, tenantId, userId, role) {
  const permissions = new Set(DEFAULT_ROLE_PERMISSIONS[role] ?? [])
  const overrides = db
    .prepare(
      'SELECT permission,granted FROM user_permission_overrides WHERE tenant_id=? AND user_id=?',
    )
    .all(tenantId, userId)
  for (const override of overrides) {
    if (override.granted) permissions.add(override.permission)
    else permissions.delete(override.permission)
  }
  return [...permissions]
}

export function hasPermission(db, tenantId, userId, role, permission) {
  return permissionsForUser(db, tenantId, userId, role).includes(permission)
}
