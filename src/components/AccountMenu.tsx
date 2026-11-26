import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { InventoryApiError, inventoryService } from '../modules/inventory/service'
import type { InventoryAccountSession } from '../modules/inventory/service'

const roleLabel = (role: string, t: (vi: string, en: string) => string) =>
  ({
    owner: t('Chủ doanh nghiệp', 'Owner'),
    admin: t('Quản trị viên', 'Administrator'),
    manager: t('Quản lý', 'Manager'),
    receiver: t('Nhân viên kho', 'Stock operator'),
    issuer: t('Nhân viên xuất hàng', 'Stock issuer'),
    counter: t('Nhân viên kiểm kê', 'Stock counter'),
    approver: t('Người duyệt chứng từ', 'Approver'),
    staff: t('Nhân viên', 'Staff'),
    viewer: t('Chỉ xem', 'Read only'),
  })[role] ?? role

const permissionLabel = (permission: string, t: (vi: string, en: string) => string) => {
  const labels: Record<string, [string, string]> = {
    'account.users.manage': ['Quản lý tài khoản', 'Manage accounts'],
    'warehouse.create': ['Tạo kho', 'Create warehouses'],
    'warehouse.update': ['Sửa kho', 'Update warehouses'],
    'location.create': ['Tạo vị trí kho', 'Create locations'],
    'supplier.create': ['Tạo nhà cung cấp', 'Create suppliers'],
    'supplier.update': ['Sửa nhà cung cấp', 'Update suppliers'],
    'sku.create': ['Thêm sản phẩm', 'Add products'],
    'sku.update': ['Sửa sản phẩm', 'Edit products'],
    'sku.import': ['Nhập danh sách sản phẩm', 'Import products'],
    'document.create': ['Tạo chứng từ kho', 'Create stock documents'],
    'document.approve': ['Duyệt chứng từ kho', 'Approve stock documents'],
    'document.post': ['Ghi sổ chứng từ kho', 'Post stock documents'],
    'document.cancel': ['Hủy chứng từ kho', 'Cancel stock documents'],
    'document.transfer_receive': ['Nhận hàng chuyển kho', 'Receive transfers'],
    'reservation.create': ['Giữ hàng', 'Reserve stock'],
    'reservation.release': ['Giải phóng hàng giữ', 'Release reservations'],
    'purchaseOrder.create': ['Tạo đơn mua hàng', 'Create purchase orders'],
    'purchaseOrder.approve': ['Duyệt đơn mua hàng', 'Approve purchase orders'],
    'purchaseOrder.cancel': ['Hủy đơn mua hàng', 'Cancel purchase orders'],
    'purchaseOrder.receive': ['Nhận hàng mua', 'Receive purchase orders'],
    'count.create': ['Tạo phiên kiểm kê', 'Create stocktakes'],
    'count.record': ['Ghi số liệu kiểm kê', 'Record stocktake counts'],
    'count.approve': ['Duyệt kiểm kê', 'Approve stocktakes'],
    'warranty.create': ['Tạo hồ sơ bảo hành', 'Create warranty cases'],
    'warranty.transition': ['Cập nhật bảo hành', 'Update warranty cases'],
    'quality.reclassify': ['Phân loại chất lượng', 'Reclassify stock quality'],
    'config.update': ['Sửa cấu hình kho', 'Update inventory settings'],
    'salesOrder.create': ['Tạo đơn bán', 'Create sales orders'],
    'salesOrder.confirm': ['Xác nhận đơn bán', 'Confirm sales orders'],
    'salesOrder.cancel': ['Hủy đơn bán', 'Cancel sales orders'],
    'salesOrder.fulfill': ['Xuất hàng bán', 'Fulfill sales orders'],
    'salesOrder.return': ['Nhận hàng bán trả', 'Process sales returns'],
  }
  const value = labels[permission]
  return value ? t(value[0], value[1]) : permission
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toLocaleUpperCase()

export default function AccountMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<InventoryAccountSession | null>(null)
  const [checked, setChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)

  useEffect(() => {
    let active = true
    void inventoryService
      .checkSession()
      .then((value) => {
        if (active) setSession(value)
      })
      .catch((cause) => {
        if (!active) return
        if (cause instanceof InventoryApiError && cause.status === 401) setSession(null)
        else
          setSessionError(
            cause instanceof Error
              ? cause.message
              : t('Không thể tải thông tin tài khoản.', 'Unable to load account information.'),
          )
      })
      .finally(() => {
        if (active) setChecked(true)
      })
    return () => {
      active = false
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  const signOut = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.logout()
      setSession(null)
      setOpen(false)
      navigate('/login')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('Không thể đăng xuất.', 'Unable to sign out.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const currentPassword = String(values.get('currentPassword') ?? '')
    const newPassword = String(values.get('newPassword') ?? '')
    if (newPassword !== String(values.get('confirmPassword') ?? '')) {
      setError(t('Mật khẩu mới nhập lại chưa khớp.', 'The new passwords do not match.'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await inventoryService.changePassword(currentPassword, newPassword)
      form.reset()
      setPasswordOpen(false)
      setNotice(
        t(
          'Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị thu hồi.',
          'Password changed. Other signed-in sessions have been revoked.',
        ),
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể đổi mật khẩu.', 'Unable to change password.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!checked || !session)
    return (
      <Link
        to="/login"
        className="user-avatar"
        aria-label={t('Đăng nhập hoặc đăng ký tài khoản', 'Sign in or create an account')}
        title={sessionError || t('Tài khoản kho', 'Inventory account')}
      >
        LN
        <span />
      </Link>
    )

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className="user-avatar"
        aria-label={t(`Tài khoản ${session.user.name}`, `Account for ${session.user.name}`)}
        aria-expanded={open}
        aria-controls="signed-in-account"
        title={t('Thông tin tài khoản', 'Account information')}
        onClick={() => {
          setError('')
          setOpen((value) => !value)
        }}
      >
        {initials(session.user.name)}
        <span />
      </button>
      {open && (
        <section
          id="signed-in-account"
          className="account-popover"
          role="dialog"
          aria-label={t('Thông tin tài khoản', 'Account information')}
        >
          <header className="account-popover-heading">
            <div className="account-avatar-large">{initials(session.user.name)}</div>
            <div>
              <strong>{session.user.name}</strong>
              <span>{roleLabel(session.user.role, t)}</span>
            </div>
          </header>
          <dl className="account-details">
            <div>
              <dt>{t('Email', 'Email')}</dt>
              <dd>{session.user.email || '—'}</dd>
            </div>
            <div>
              <dt>{t('Doanh nghiệp', 'Business')}</dt>
              <dd>{session.tenant.name}</dd>
            </div>
            <div>
              <dt>{t('Trạng thái', 'Status')}</dt>
              <dd>{t('Đang hoạt động', 'Active')}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="account-password-toggle"
            aria-expanded={passwordOpen}
            onClick={() => {
              setError('')
              setNotice('')
              setPasswordOpen((value) => !value)
            }}
          >
            <KeyRound size={15} />
            {t('Đổi mật khẩu', 'Change password')}
          </button>
          {passwordOpen && (
            <form
              className="account-password-form"
              onSubmit={(event) => void changePassword(event)}
            >
              <label>
                {t('Mật khẩu hiện tại', 'Current password')}
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </label>
              <label>
                {t('Mật khẩu mới', 'New password')}
                <input
                  type="password"
                  name="newPassword"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
              </label>
              <label>
                {t('Nhập lại mật khẩu mới', 'Confirm new password')}
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
              </label>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy
                  ? t('Đang cập nhật…', 'Updating…')
                  : t('Lưu mật khẩu mới', 'Save new password')}
              </button>
            </form>
          )}
          <details className="account-permissions">
            <summary>
              {t('Quyền được cấp', 'Assigned permissions')} ({session.permissions.length})
            </summary>
            {session.permissions.length ? (
              <ul>
                {session.permissions.map((permission) => (
                  <li key={permission}>{permissionLabel(permission, t)}</li>
                ))}
              </ul>
            ) : (
              <p>{t('Chưa được cấp quyền thao tác.', 'No operational permissions assigned.')}</p>
            )}
          </details>
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="account-success" role="status">
              {notice}
            </p>
          )}
          <button
            type="button"
            className="account-signout"
            disabled={busy}
            onClick={() => void signOut()}
          >
            <LogOut size={15} />
            {busy ? t('Đang đăng xuất…', 'Signing out…') : t('Đăng xuất', 'Sign out')}
          </button>
        </section>
      )}
    </div>
  )
}
