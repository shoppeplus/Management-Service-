import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  Ban,
  Check,
  Clock3,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserRoundPlus,
} from 'lucide-react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import { InventoryApiError, inventoryService } from './service'
import type { InventoryAccountActivity, InventoryAccountUser, InventoryLoginEvent } from './service'

const roles = [
  'admin',
  'manager',
  'accountant',
  'staff',
  'receiver',
  'issuer',
  'counter',
  'approver',
  'viewer',
]

type PermissionGroupKey =
  | 'warehouse'
  | 'catalog'
  | 'documents'
  | 'reservations'
  | 'purchasing'
  | 'stocktake'
  | 'afterSales'
  | 'sales'
  | 'business'
  | 'accounting'
  | 'other'

const permissionGroups: {
  key: PermissionGroupKey
  vi: string
  en: string
}[] = [
  { key: 'warehouse', vi: 'Kho và vị trí', en: 'Warehouses and locations' },
  { key: 'catalog', vi: 'Sản phẩm và nhà cung cấp', en: 'Products and suppliers' },
  { key: 'documents', vi: 'Chứng từ kho', en: 'Inventory documents' },
  { key: 'reservations', vi: 'Giữ hàng', en: 'Stock reservations' },
  { key: 'purchasing', vi: 'Yêu cầu nhập và đơn mua', en: 'Restock requests and purchase orders' },
  { key: 'stocktake', vi: 'Kiểm kê', en: 'Stocktakes' },
  { key: 'afterSales', vi: 'Bảo hành và chất lượng', en: 'Warranty and quality' },
  { key: 'sales', vi: 'Đơn bán hàng', en: 'Sales orders' },
  { key: 'business', vi: 'Vận hành và chăm sóc khách hàng', en: 'Operations and customer care' },
  { key: 'accounting', vi: 'Kế toán', en: 'Accounting' },
  { key: 'other', vi: 'Quyền khác', en: 'Other permissions' },
]

const permissionLabels: Record<string, { group: PermissionGroupKey; vi: string; en: string }> = {
  'warehouse.create': { group: 'warehouse', vi: 'Tạo kho mới', en: 'Create a warehouse' },
  'warehouse.update': {
    group: 'warehouse',
    vi: 'Chỉnh sửa thông tin kho',
    en: 'Edit warehouse details',
  },
  'location.create': {
    group: 'warehouse',
    vi: 'Tạo vị trí lưu trữ trong kho',
    en: 'Create a storage location',
  },
  'config.update': {
    group: 'warehouse',
    vi: 'Thay đổi cấu hình kho',
    en: 'Change warehouse settings',
  },
  'supplier.create': {
    group: 'catalog',
    vi: 'Thêm nhà cung cấp',
    en: 'Add a supplier',
  },
  'supplier.update': {
    group: 'catalog',
    vi: 'Chỉnh sửa thông tin nhà cung cấp',
    en: 'Edit supplier details',
  },
  'sku.create': { group: 'catalog', vi: 'Thêm sản phẩm', en: 'Add a product' },
  'sku.update': {
    group: 'catalog',
    vi: 'Chỉnh sửa thông tin sản phẩm',
    en: 'Edit product details',
  },
  'sku.import': {
    group: 'catalog',
    vi: 'Nhập danh sách sản phẩm từ tệp',
    en: 'Import products from a file',
  },
  'document.create': {
    group: 'documents',
    vi: 'Lập chứng từ kho',
    en: 'Create an inventory document',
  },
  'document.approve': {
    group: 'documents',
    vi: 'Phê duyệt chứng từ kho',
    en: 'Approve inventory documents',
  },
  'document.post': {
    group: 'documents',
    vi: 'Ghi sổ chứng từ kho',
    en: 'Post inventory documents',
  },
  'document.cancel': {
    group: 'documents',
    vi: 'Hủy chứng từ kho',
    en: 'Cancel inventory documents',
  },
  'document.transfer_receive': {
    group: 'documents',
    vi: 'Xác nhận nhận hàng chuyển từ kho khác',
    en: 'Confirm receipt of an inter-warehouse transfer',
  },
  'reservation.create': {
    group: 'reservations',
    vi: 'Tạo yêu cầu giữ hàng',
    en: 'Reserve stock',
  },
  'reservation.release': {
    group: 'reservations',
    vi: 'Giải phóng hàng đang được giữ',
    en: 'Release reserved stock',
  },
  'purchaseRequest.create': {
    group: 'purchasing',
    vi: 'Tạo yêu cầu nhập hàng trong Kho',
    en: 'Create a restock request in Inventory',
  },
  'purchaseRequest.read': {
    group: 'purchasing',
    vi: 'Xem yêu cầu nhập hàng của mình',
    en: 'View own restock requests',
  },
  'purchaseRequest.manage': {
    group: 'purchasing',
    vi: 'Quản lý yêu cầu nhập hàng',
    en: 'Manage restock requests',
  },
  'purchaseOrder.create': {
    group: 'purchasing',
    vi: 'Tạo đơn mua hàng',
    en: 'Create a purchase order',
  },
  'purchaseOrder.approve': {
    group: 'purchasing',
    vi: 'Phê duyệt đơn mua hàng',
    en: 'Approve purchase orders',
  },
  'purchaseOrder.cancel': {
    group: 'purchasing',
    vi: 'Hủy đơn mua hàng',
    en: 'Cancel purchase orders',
  },
  'purchaseOrder.receive': {
    group: 'purchasing',
    vi: 'Xác nhận nhận hàng mua',
    en: 'Confirm receipt of purchased goods',
  },
  'accounting.read': {
    group: 'accounting',
    vi: 'Xem sổ kế toán và báo cáo tài chính nội bộ',
    en: 'View the ledger and internal financial reports',
  },
  'accounting.post': {
    group: 'accounting',
    vi: 'Ghi sổ và đảo bút toán kế toán',
    en: 'Post and reverse accounting journal entries',
  },
  'count.create': {
    group: 'stocktake',
    vi: 'Tạo đợt kiểm kê',
    en: 'Create a stocktake',
  },
  'count.record': {
    group: 'stocktake',
    vi: 'Ghi nhận số lượng kiểm kê',
    en: 'Record stocktake counts',
  },
  'count.approve': {
    group: 'stocktake',
    vi: 'Phê duyệt kết quả kiểm kê',
    en: 'Approve stocktake results',
  },
  'warranty.create': {
    group: 'afterSales',
    vi: 'Tạo hồ sơ bảo hành',
    en: 'Create a warranty case',
  },
  'warranty.transition': {
    group: 'afterSales',
    vi: 'Cập nhật trạng thái bảo hành',
    en: 'Update warranty case status',
  },
  'quality.reclassify': {
    group: 'afterSales',
    vi: 'Thay đổi phân loại chất lượng hàng',
    en: 'Change stock quality classification',
  },
  'salesOrder.create': {
    group: 'sales',
    vi: 'Tạo đơn bán hàng',
    en: 'Create a sales order',
  },
  'salesOrder.confirm': {
    group: 'sales',
    vi: 'Xác nhận đơn bán hàng',
    en: 'Confirm sales orders',
  },
  'salesOrder.cancel': {
    group: 'sales',
    vi: 'Hủy đơn bán hàng',
    en: 'Cancel sales orders',
  },
  'salesOrder.fulfill': {
    group: 'sales',
    vi: 'Soạn và xuất hàng cho đơn bán',
    en: 'Prepare and ship sales orders',
  },
  'salesOrder.return': {
    group: 'sales',
    vi: 'Tiếp nhận hàng khách trả',
    en: 'Process customer returns',
  },
  'operations.read': {
    group: 'business',
    vi: 'Xem bảng điều hành và báo cáo',
    en: 'View the operations dashboard and reports',
  },
  'inbox.read': {
    group: 'business',
    vi: 'Xem hộp thư và hội thoại',
    en: 'View the inbox and conversations',
  },
  'inbox.manage': {
    group: 'business',
    vi: 'Quản lý hội thoại, người phụ trách và trạng thái',
    en: 'Manage conversations, assignments, and statuses',
  },
  'inbox.message': {
    group: 'business',
    vi: 'Gửi tin nhắn cho khách hàng',
    en: 'Send messages to customers',
  },
  'customers.manage': {
    group: 'business',
    vi: 'Tạo và cập nhật hồ sơ khách hàng',
    en: 'Create and update customer profiles',
  },
  'crm.manage': {
    group: 'business',
    vi: 'Quản lý phân loại và thông tin khách hàng',
    en: 'Manage customer segments and CRM details',
  },
  'orders.manage': {
    group: 'business',
    vi: 'Quản lý đơn hàng',
    en: 'Manage orders',
  },
  'logistics.manage': {
    group: 'business',
    vi: 'Quản lý giao vận',
    en: 'Manage logistics',
  },
  'care.manage': {
    group: 'business',
    vi: 'Quản lý yêu cầu chăm sóc khách hàng',
    en: 'Manage customer care requests',
  },
}

const permissionLabel = (permission: string, t: (vi: string, en: string) => string) => {
  const label = permissionLabels[permission]
  if (label) return t(label.vi, label.en)
  return permission
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

export default function EmployeeManagement({
  currentRole,
  onSessionExpired,
}: {
  currentRole: string
  onSessionExpired: () => void
}) {
  const { t } = useI18n()
  const [users, setUsers] = useState<InventoryAccountUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [passwordUser, setPasswordUser] = useState<InventoryAccountUser | null>(null)
  const [permissionUser, setPermissionUser] = useState<InventoryAccountUser | null>(null)
  const [permissionActions, setPermissionActions] = useState<string[]>([])
  const [defaultPermissions, setDefaultPermissions] = useState<string[]>([])
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loginEvents, setLoginEvents] = useState<InventoryLoginEvent[]>([])
  const [activityUser, setActivityUser] = useState<InventoryAccountUser | null>(null)
  const [activityEvents, setActivityEvents] = useState<InventoryAccountActivity[]>([])
  const [query, setQuery] = useState('')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleUser, setRoleUser] = useState<InventoryAccountUser | null>(null)
  const [selectedRole, setSelectedRole] = useState('')
  const [newUserRole, setNewUserRole] = useState('receiver')
  const assignableRoles = roles.filter((role) => currentRole !== 'admin' || role !== 'admin')
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        `${user.name} ${user.email ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? user.active : !user.active)
      return matchesQuery && matchesRole && matchesStatus
    })
  }, [query, roleFilter, statusFilter, users])
  const groupedPermissions = permissionActions.reduce<
    Partial<Record<PermissionGroupKey, string[]>>
  >((groups, permission) => {
    const group = permissionLabels[permission]?.group ?? 'other'
    const current = groups[group] ?? []
    current.push(permission)
    groups[group] = current
    return groups
  }, {})
  const selectedPermissionCount = permissionActions.filter((permission) =>
    selectedPermissions.includes(permission),
  ).length
  const activeCount = users.filter((user) => user.active).length
  const isUserOnline = (user: InventoryAccountUser) =>
    user.isOnline &&
    user.lastActivityAt !== null &&
    Date.parse(user.lastActivityAt) >= currentTime - 5 * 60 * 1000
  const onlineCount = users.filter(isUserOnline).length
  const privilegedCount = users.filter((user) => ['admin', 'manager'].includes(user.role)).length

  const roleName = (role: string) =>
    ({
      owner: t('Chủ doanh nghiệp', 'Owner'),
      admin: t('Quản trị viên', 'Administrator'),
      manager: t('Quản lý', 'Manager'),
      accountant: t('Kế toán', 'Accountant'),
      receiver: t(
        'Nhân viên kho · quản lý sản phẩm và chứng từ kho',
        'Stock operator · products and stock documents',
      ),
      issuer: t('Nhân viên xuất hàng', 'Issuing'),
      counter: t('Nhân viên kiểm kê', 'Stock counting'),
      approver: t('Người duyệt chứng từ', 'Approver'),
      staff: t('Nhân viên', 'Staff'),
      viewer: t('Chỉ xem', 'Read only'),
    })[role] ?? role
  const roleDescription = (role: string) =>
    ({
      owner: t('Toàn quyền quản trị doanh nghiệp.', 'Full business administration.'),
      admin: t(
        'Quản trị, báo cáo và phân tích; không có quyền nghiệp vụ theo mặc định.',
        'Administration, reports and insights; no operational access by default.',
      ),
      manager: t(
        'Quản lý các nghiệp vụ bán hàng, chăm sóc và kho.',
        'Manages sales, care and inventory operations.',
      ),
      accountant: t(
        'Kiểm tra và duyệt đơn mua trước khi kho được nhận hàng.',
        'Reviews and approves purchase orders before inventory can receive goods.',
      ),
      receiver: t(
        'Quản lý sản phẩm và xử lý chứng từ kho được phân quyền; không nhận đơn mua trực tiếp.',
        'Manages products and permitted stock documents; cannot receive purchase orders directly.',
      ),
      issuer: t('Tạo và xử lý đơn bán.', 'Creates and processes sales orders.'),
      counter: t('Ghi nhận kiểm kê kho.', 'Records inventory counts.'),
      approver: t('Duyệt chứng từ và kiểm kê.', 'Approves documents and stocktakes.'),
      staff: t(
        'Xử lý công việc và hội thoại được giao.',
        'Handles assigned work and conversations.',
      ),
      viewer: t('Chỉ xem dữ liệu được cấp.', 'Read-only access to assigned data.'),
    })[role] ?? t('Quyền tùy chỉnh theo tài khoản.', 'Custom account permissions.')
  const activityLabel = (action: string) => {
    const labels: Record<string, [string, string]> = {
      'login.success': ['Đăng nhập thành công', 'Signed in'],
      'login.failure': ['Đăng nhập thất bại', 'Sign-in failed'],
      'account.user.create': ['Tạo tài khoản', 'Created an account'],
      'account.user.update': ['Cập nhật tài khoản', 'Updated an account'],
      'account.user.permissions.update': ['Thay đổi quyền', 'Changed permissions'],
      'account.user.password.reset': ['Đặt lại mật khẩu', 'Reset a password'],
      'account.password.change': ['Đổi mật khẩu', 'Changed password'],
      'customer.created': ['Tạo khách hàng', 'Created a customer'],
      'customer.updated': ['Cập nhật khách hàng', 'Updated a customer'],
      'conversation.updated': ['Cập nhật hội thoại', 'Updated a conversation'],
      'conversation.message.sent': ['Gửi tin nhắn', 'Sent a message'],
      'conversation.note.created': ['Thêm ghi chú hội thoại', 'Added a conversation note'],
      'order.created': ['Tạo đơn hàng', 'Created an order'],
      'shipment.created': ['Tạo vận đơn', 'Created a shipment'],
      'ticket.created': ['Tạo yêu cầu chăm sóc', 'Created a care ticket'],
    }
    const knownLabel = labels[action]
    if (knownLabel) return t(knownLabel[0], knownLabel[1])
    return action.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
  }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await inventoryService.listUsers())
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được nhân viên.', 'Unable to load employees.'),
      )
    } finally {
      setLoading(false)
    }
  }, [onSessionExpired, t])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const formData = new FormData(event.currentTarget)
    const input = {
      name: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
      role: String(formData.get('role') ?? 'receiver'),
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.createUser(input)
      setFormOpen(false)
      setNotice(t('Đã tạo tài khoản nhân viên.', 'Employee account created.'))
      await loadUsers()
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tạo được tài khoản.', 'Unable to create account.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const toggleUser = async (user: InventoryAccountUser) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.updateUser(user.id, { active: !user.active })
      setNotice(
        user.active
          ? t('Đã tạm khóa tài khoản nhân viên.', 'Employee account disabled.')
          : t('Đã kích hoạt tài khoản nhân viên.', 'Employee account enabled.'),
      )
      await loadUsers()
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không cập nhật được tài khoản.', 'Unable to update account.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const showRoleEditor = (user: InventoryAccountUser) => {
    setSelectedRole(user.role)
    setRoleUser(user)
  }

  const saveRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !roleUser) return
    if (selectedRole === roleUser.role) {
      setRoleUser(null)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.updateUser(roleUser.id, { role: selectedRole })
      setRoleUser(null)
      setNotice(
        t(
          'Đã cập nhật vai trò và thu hồi phiên đăng nhập cũ.',
          'Role updated; previous sessions were revoked.',
        ),
      )
      await loadUsers()
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không cập nhật được vai trò.', 'Unable to update the role.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !passwordUser) return
    const formData = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.resetUserPassword(
        passwordUser.id,
        String(formData.get('password') ?? ''),
      )
      setPasswordUser(null)
      setNotice(
        t('Đã đặt lại mật khẩu và thu hồi các phiên cũ.', 'Password reset; old sessions revoked.'),
      )
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không đặt lại được mật khẩu.', 'Unable to reset password.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const showLoginHistory = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setLoginEvents(await inventoryService.listLoginEvents())
      setHistoryOpen(true)
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được lịch sử đăng nhập.', 'Unable to load login history.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const showUserActivity = async (user: InventoryAccountUser) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setActivityEvents(await inventoryService.listUserActivity(user.id))
      setActivityUser(user)
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được lịch sử hoạt động.', 'Unable to load activity history.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const showPermissions = async (user: InventoryAccountUser) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const catalog = await inventoryService.permissionCatalog()
      setPermissionActions(catalog.permissions)
      setDefaultPermissions(catalog.defaults[user.role] ?? [])
      setSelectedPermissions(user.permissions ?? catalog.defaults[user.role] ?? [])
      setPermissionUser(user)
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được danh mục quyền.', 'Unable to load permissions.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const updatePermissions = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !permissionUser) return
    const selected = new Set(selectedPermissions)
    const defaults = new Set(defaultPermissions)
    const overrides = permissionActions.map((permission) => ({
      permission,
      granted:
        selected.has(permission) === defaults.has(permission) ? null : selected.has(permission),
    }))
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.updateUserPermissions(permissionUser.id, overrides)
      setPermissionUser(null)
      setNotice(
        t(
          'Đã cập nhật quyền và thu hồi các phiên cũ.',
          'Permissions updated; old sessions revoked.',
        ),
      )
      await loadUsers()
    } catch (cause) {
      if (cause instanceof InventoryApiError && cause.status === 401) onSessionExpired()
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không cập nhật được quyền.', 'Unable to update permissions.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="inv-panel">
        <header>
          <div className="inv-section-title">
            <h2>{t('Danh sách tài khoản', 'Account directory')}</h2>
            <p className="inv-note">
              {t(
                'Trạng thái online dựa trên hoạt động thực tế 5 phút gần nhất; lịch sử ghi lại đăng nhập và thao tác.',
                'Online status reflects activity within 5 minutes; history records sign-ins and actions.',
              )}
            </p>
          </div>
          <div className="inv-actions">
            <button
              className="button button-secondary"
              disabled={busy || loading}
              onClick={() => void showLoginHistory()}
            >
              <Clock3 size={14} />
              {t('Lịch sử đăng nhập', 'Login history')}
            </button>
            <button
              className="button button-secondary"
              disabled={busy || loading}
              onClick={() => void loadUsers()}
            >
              <RefreshCw size={14} />
              {t('Tải lại', 'Reload')}
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => {
                setNewUserRole('receiver')
                setFormOpen(true)
              }}
            >
              <Plus size={14} />
              {t('Tạo tài khoản', 'Create account')}
            </button>
          </div>
        </header>
        {error && (
          <div className="inv-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="inv-success" role="status">
            {notice}
          </div>
        )}
        {loading ? (
          <p className="inv-note inv-panel-note" role="status">
            {t('Đang tải danh sách nhân viên…', 'Loading employee accounts…')}
          </p>
        ) : (
          <>
            <div
              className="admin-account-summary"
              aria-label={t('Tổng quan tài khoản', 'Account summary')}
            >
              <article>
                <span>{t('Tổng tài khoản', 'Total accounts')}</span>
                <strong>{users.length}</strong>
                <small>{t('Trong doanh nghiệp', 'In this business')}</small>
              </article>
              <article>
                <span>{t('Đang hoạt động', 'Active now')}</span>
                <strong>{onlineCount}</strong>
                <small>{t('Có hoạt động trong 5 phút', 'Active within 5 minutes')}</small>
              </article>
              <article>
                <span>{t('Đã tạm khóa', 'Suspended')}</span>
                <strong>{users.length - activeCount}</strong>
                <small>{t('Không thể đăng nhập', 'Cannot sign in')}</small>
              </article>
              <article>
                <span>{t('Quản trị & quản lý', 'Admins & managers')}</span>
                <strong>{privilegedCount}</strong>
                <small>{t('Tài khoản có quyền quản lý', 'Accounts with management roles')}</small>
              </article>
            </div>
            <div className="admin-account-filters">
              <label className="admin-account-search">
                <span>{t('Tìm nhân viên', 'Search employees')}</span>
                <div>
                  <Search size={15} aria-hidden="true" />
                  <input
                    aria-label={t('Tìm theo tên hoặc email', 'Search by name or email')}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('Tên hoặc email đăng nhập', 'Name or sign-in email')}
                  />
                </div>
              </label>
              <label>
                <span>{t('Vai trò', 'Role')}</span>
                <select
                  aria-label={t('Lọc theo vai trò', 'Filter by role')}
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  <option value="all">{t('Tất cả vai trò', 'All roles')}</option>
                  {[...new Set(['owner', ...roles, ...users.map((user) => user.role)])].map(
                    (role) => (
                      <option key={role} value={role}>
                        {roleName(role)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>{t('Quyền đăng nhập', 'Account access')}</span>
                <select
                  aria-label={t('Lọc theo trạng thái', 'Filter by status')}
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">{t('Tất cả trạng thái', 'All statuses')}</option>
                  <option value="active">{t('Được phép đăng nhập', 'Sign-in enabled')}</option>
                  <option value="inactive">{t('Đã khóa', 'Suspended')}</option>
                </select>
              </label>
            </div>
            <div className="inv-table-scroll">
              <table className="inv-table admin-account-table">
                <thead>
                  <tr>
                    <th scope="col">{t('Nhân viên & tài khoản', 'Employee & account')}</th>
                    <th scope="col">{t('Vai trò', 'Role')}</th>
                    <th scope="col">{t('Quyền phân hệ', 'Module permissions')}</th>
                    <th scope="col">{t('Hoạt động thực tế', 'Recent activity')}</th>
                    <th scope="col">{t('Quyền đăng nhập', 'Account access')}</th>
                    <th scope="col">{t('Thao tác', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <small>{user.email || '—'}</small>
                      </td>
                      <td>
                        <strong>{roleName(user.role)}</strong>
                        <small>{roleDescription(user.role)}</small>
                      </td>
                      <td>
                        <strong>{user.permissions?.length ?? 0}</strong>
                        <small>{t('quyền trong danh mục', 'catalog permissions')}</small>
                      </td>
                      <td>
                        <span
                          className={`admin-activity-status ${isUserOnline(user) ? 'is-online' : ''}`}
                        >
                          <span aria-hidden="true" />
                          {isUserOnline(user)
                            ? t('Đang hoạt động', 'Active now')
                            : user.lastActivityAt
                              ? t('Ngoại tuyến', 'Offline')
                              : t('Chưa hoạt động', 'No activity')}
                        </span>
                        <small>
                          {user.lastActivityAt
                            ? `${t('Gần nhất', 'Last seen')}: ${new Date(user.lastActivityAt).toLocaleString()}`
                            : t('Chưa ghi nhận hoạt động', 'No activity recorded')}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`inv-tag ${user.active ? 'inv-tag-posted' : 'inv-tag-cancelled'}`}
                        >
                          {user.active
                            ? t('Được phép đăng nhập', 'Sign-in enabled')
                            : t('Đã khóa', 'Disabled')}
                        </span>
                      </td>
                      <td>
                        <div className="inv-actions admin-account-actions">
                          <button
                            className="button button-secondary"
                            aria-label={t(
                              `Lịch sử hoạt động · ${user.name}`,
                              `Activity history · ${user.name}`,
                            )}
                            disabled={busy}
                            onClick={() => void showUserActivity(user)}
                          >
                            <Activity size={14} />
                            {t('Lịch sử', 'Activity')}
                          </button>
                          {user.role !== 'owner' &&
                            (currentRole === 'owner' || user.role !== 'admin') && (
                              <details className="admin-account-menu">
                                <summary
                                  role="button"
                                  aria-label={t(
                                    `Thao tác tài khoản · ${user.name}`,
                                    `Account actions · ${user.name}`,
                                  )}
                                  title={t('Thao tác khác', 'More actions')}
                                >
                                  <MoreHorizontal size={17} />
                                </summary>
                                <div className="admin-account-menu-popover">
                                  <button
                                    type="button"
                                    aria-label={t(
                                      `Đổi vai trò · ${user.name}`,
                                      `Change role · ${user.name}`,
                                    )}
                                    disabled={busy}
                                    onClick={(event) => {
                                      showRoleEditor(user)
                                      event.currentTarget.closest('details')?.removeAttribute('open')
                                    }}
                                  >
                                    <Pencil size={14} />
                                    {t('Vai trò', 'Role')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={(event) => {
                                      void toggleUser(user)
                                      event.currentTarget.closest('details')?.removeAttribute('open')
                                    }}
                                  >
                                    {user.active ? <Ban size={14} /> : <Check size={14} />}
                                    {user.active
                                      ? t('Tạm khóa', 'Disable')
                                      : t('Kích hoạt', 'Enable')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={(event) => {
                                      setPasswordUser(user)
                                      event.currentTarget.closest('details')?.removeAttribute('open')
                                    }}
                                  >
                                    <KeyRound size={14} />
                                    {t('Đặt lại mật khẩu', 'Reset password')}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={(event) => {
                                      void showPermissions(user)
                                      event.currentTarget.closest('details')?.removeAttribute('open')
                                    }}
                                  >
                                    <Shield size={14} />
                                    {t('Phân quyền', 'Permissions')}
                                  </button>
                                </div>
                              </details>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredUsers.length && (
                    <tr>
                      <td colSpan={6} className="inv-empty">
                        {users.length
                          ? t(
                              'Không có tài khoản phù hợp bộ lọc.',
                              'No accounts match these filters.',
                            )
                          : t('Chưa có tài khoản nhân viên.', 'No employee accounts yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {formOpen && (
        <Modal
          title={t('Tạo tài khoản nhân viên', 'Create employee account')}
          onClose={() => {
            if (!busy) setFormOpen(false)
          }}
        >
          <form className="inv-form modal-body" onSubmit={(event) => void createUser(event)}>
            <fieldset disabled={busy}>
              <label>
                <span>{t('Họ tên nhân viên', 'Employee name')} *</span>
                <input name="name" autoComplete="name" minLength={2} maxLength={200} required />
              </label>
              <label>
                <span>{t('Email đăng nhập', 'Sign-in email')} *</span>
                <input name="email" type="email" autoComplete="email" maxLength={254} required />
              </label>
              <label>
                <span>{t('Mật khẩu ban đầu', 'Temporary password')} *</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
              </label>
              <label>
                <span>{t('Vai trò', 'Role')} *</span>
                <select
                  name="role"
                  value={newUserRole}
                  onChange={(event) => setNewUserRole(event.target.value)}
                  required
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleName(role)}
                    </option>
                  ))}
                </select>
              </label>
              <small className="admin-account-role-description">
                {roleDescription(newUserRole)}
              </small>
            </fieldset>
            <p className="inv-note">
              {t(
                'Mật khẩu cần ít nhất 10 ký tự. Nhân viên kho có thể thêm sản phẩm, nhập/chuyển hàng nhưng không được xuất hoặc điều chỉnh tồn.',
                'Passwords need at least 10 characters. Stock operators can add products and receive/transfer goods, but cannot issue or adjust stock.',
              )}
            </p>
            <div className="inv-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setFormOpen(false)}
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? <RefreshCw size={14} className="spin" /> : <UserRoundPlus size={14} />}
                {t('Tạo tài khoản', 'Create account')}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {roleUser && (
        <Modal
          title={t(`Đổi vai trò · ${roleUser.name}`, `Change role · ${roleUser.name}`)}
          onClose={() => {
            if (!busy) setRoleUser(null)
          }}
        >
          <form className="inv-form modal-body" onSubmit={(event) => void saveRole(event)}>
            <p className="inv-note">
              {t(
                `Vai trò hiện tại: ${roleName(roleUser.role)}. Đổi vai trò sẽ xóa quyền tùy chỉnh và thu hồi phiên đăng nhập cũ.`,
                `Current role: ${roleName(roleUser.role)}. Changing the role clears custom permissions and revokes existing sessions.`,
              )}
            </p>
            <fieldset disabled={busy}>
              <label>
                <span>{t('Vai trò mới', 'New role')} *</span>
                <select
                  aria-label={t('Vai trò mới', 'New role')}
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value)}
                  required
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleName(role)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <p className="admin-account-role-description">{roleDescription(selectedRole)}</p>
            <div className="inv-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setRoleUser(null)}
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button
                className="button button-primary"
                disabled={busy || selectedRole === roleUser.role}
              >
                {busy ? <RefreshCw size={14} className="spin" /> : <Pencil size={14} />}
                {t('Lưu vai trò', 'Save role')}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {passwordUser && (
        <Modal
          title={t('Đặt lại mật khẩu', 'Reset password')}
          onClose={() => {
            if (!busy) setPasswordUser(null)
          }}
        >
          <form className="inv-form modal-body" onSubmit={(event) => void resetPassword(event)}>
            <p className="inv-note">
              {t(
                `Tạo mật khẩu mới cho ${passwordUser.name}. Các phiên đăng nhập hiện tại của nhân viên sẽ bị thu hồi.`,
                `Set a new password for ${passwordUser.name}. Their active sessions will be revoked.`,
              )}
            </p>
            <fieldset disabled={busy}>
              <label>
                <span>{t('Mật khẩu mới', 'New password')} *</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
              </label>
            </fieldset>
            <div className="inv-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setPasswordUser(null)}
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? <RefreshCw size={14} className="spin" /> : <KeyRound size={14} />}
                {t('Đặt lại', 'Reset')}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {historyOpen && (
        <Modal
          title={t('Lịch sử đăng nhập', 'Login history')}
          onClose={() => setHistoryOpen(false)}
        >
          <div className="inv-table-scroll modal-body">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">{t('Tài khoản', 'Account')}</th>
                  <th scope="col">{t('Kết quả', 'Result')}</th>
                  <th scope="col">{t('Thời gian', 'Time')}</th>
                  <th scope="col">{t('Địa chỉ', 'Address')}</th>
                </tr>
              </thead>
              <tbody>
                {loginEvents.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.userName ?? t('Không xác định', 'Unknown')}</strong>
                      <small>
                        {entry.email ?? t('Tài khoản không tồn tại', 'Unknown account')}
                      </small>
                    </td>
                    <td>
                      {entry.succeeded ? t('Thành công', 'Success') : t('Thất bại', 'Failed')}
                    </td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.remoteAddress || '—'}</td>
                  </tr>
                ))}
                {!loginEvents.length && (
                  <tr>
                    <td colSpan={4} className="inv-empty">
                      {t('Chưa có lịch sử đăng nhập.', 'No login history yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {activityUser && (
        <Modal
          title={t(
            `Lịch sử hoạt động · ${activityUser.name}`,
            `Activity history · ${activityUser.name}`,
          )}
          onClose={() => {
            if (!busy) setActivityUser(null)
          }}
        >
          <div className="inv-table-scroll modal-body">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">{t('Hoạt động', 'Activity')}</th>
                  <th scope="col">{t('Chi tiết', 'Details')}</th>
                  <th scope="col">{t('Thời gian', 'Time')}</th>
                </tr>
              </thead>
              <tbody>
                {activityEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{activityLabel(event.action)}</td>
                    <td>
                      {event.description ??
                        (event.kind === 'login'
                          ? event.succeeded
                            ? t('Đăng nhập thành công', 'Sign-in succeeded')
                            : t('Sai thông tin đăng nhập', 'Invalid sign-in credentials')
                          : event.entityId
                            ? `${t('Mã liên quan', 'Related ID')}: ${event.entityId}`
                            : '—')}
                    </td>
                    <td>
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString()}
                      </time>
                    </td>
                  </tr>
                ))}
                {!activityEvents.length && (
                  <tr>
                    <td colSpan={3} className="inv-empty">
                      {t('Chưa ghi nhận hoạt động nào.', 'No activity recorded yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {permissionUser && (
        <Modal
          title={t(`Phân quyền · ${permissionUser.name}`, `Permissions · ${permissionUser.name}`)}
          wide
          className="modal-permissions"
          onClose={() => {
            if (!busy) setPermissionUser(null)
          }}
        >
          <form
            className="inv-form modal-body inv-permission-form"
            onSubmit={(event) => void updatePermissions(event)}
          >
            <p className="inv-note">
              {t(
                'Quyền được kiểm tra tại máy chủ. Chọn “Khôi phục vai trò” để bỏ các quyền tùy chỉnh.',
                'Permissions are enforced by the server. Choose “Restore role defaults” to clear custom overrides.',
              )}
            </p>
            <div className="inv-permission-toolbar">
              <span>
                {t('Đang chọn', 'Selected')}{' '}
                <strong>
                  {selectedPermissionCount}/{permissionActions.length}
                </strong>{' '}
                {t('quyền', 'permissions')}
              </span>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setSelectedPermissions(defaultPermissions)}
              >
                {t('Khôi phục vai trò', 'Restore role defaults')}
              </button>
            </div>
            <fieldset className="inv-permission-list" disabled={busy}>
              <legend>
                <span>{t('Danh sách quyền có thể cấp', 'Available permissions')}</span>
                <small>
                  {t(
                    'Cuộn danh sách để xem các nhóm quyền bên dưới.',
                    'Scroll the list to see the remaining permission groups.',
                  )}
                </small>
              </legend>
              {permissionGroups.map(({ key, vi, en }) => {
                const permissions = groupedPermissions[key] ?? []
                if (!permissions.length) return null
                return (
                  <section className="inv-permission-group" key={key}>
                    <h3>{t(vi, en)}</h3>
                    <div className="inv-permission-options">
                      {permissions.map((permission) => (
                        <label className="inv-permission-option" key={permission}>
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(permission)}
                            onChange={(event) =>
                              setSelectedPermissions((current) =>
                                event.target.checked
                                  ? [...current, permission]
                                  : current.filter((value) => value !== permission),
                              )
                            }
                          />
                          <span>{permissionLabel(permission, t)}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                )
              })}
            </fieldset>
            <div className="inv-actions inv-permission-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setPermissionUser(null)}
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? <RefreshCw size={14} className="spin" /> : <Shield size={14} />}
                {t('Lưu quyền', 'Save permissions')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
