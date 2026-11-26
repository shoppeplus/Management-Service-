// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nContext } from '../../i18n/context'
import { inventoryService } from '../inventory/service'
import EmployeeManagement from '../inventory/EmployeeManagement'

const userFixture = [
  {
    id: 'owner-a',
    name: 'Chủ doanh nghiệp',
    email: 'owner@example.com',
    role: 'owner',
    active: true,
    isOnline: true,
    lastActivityAt: new Date().toISOString(),
  },
  {
    id: 'employee-a',
    name: 'Nhân viên kho',
    email: 'stock@example.com',
    role: 'receiver',
    active: true,
    isOnline: false,
    lastActivityAt: '2026-11-17T02:00:00.000Z',
  },
]

function renderManagement() {
  return render(
    <I18nContext.Provider
      value={{
        locale: 'vi',
        setLocale: vi.fn(),
        t: (vi) => vi,
        label: (name) => name,
      }}
    >
      <EmployeeManagement currentRole="owner" onSessionExpired={vi.fn()} />
    </I18nContext.Provider>,
  )
}

beforeEach(() => {
  vi.spyOn(inventoryService, 'listUsers').mockResolvedValue(userFixture)
  vi.spyOn(inventoryService, 'createUser').mockResolvedValue({})
  vi.spyOn(inventoryService, 'listLoginEvents').mockResolvedValue([
    {
      id: 'login-event-a',
      userId: 'owner-a',
      userName: 'Chủ doanh nghiệp',
      email: 'owner@example.com',
      succeeded: true,
      remoteAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: '2026-11-18T02:00:00.000Z',
    },
  ])
  vi.spyOn(inventoryService, 'listUserActivity').mockResolvedValue([
    {
      id: 'activity-event-a',
      kind: 'action',
      action: 'order.created',
      entityId: 'order-1',
      description: 'Tạo đơn bán SO-1.',
      succeeded: null,
      createdAt: '2026-11-18T02:00:00.000Z',
    },
  ])
  vi.spyOn(inventoryService, 'resetUserPassword').mockResolvedValue({})
  vi.spyOn(inventoryService, 'permissionCatalog').mockResolvedValue({
    permissions: ['sku.create', 'document.create'],
    defaults: { receiver: ['sku.create', 'document.create'] },
  })
  vi.spyOn(inventoryService, 'updateUserPermissions').mockResolvedValue({})
  vi.spyOn(inventoryService, 'updateUser').mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('admin employee management', () => {
  it('creates staff accounts with the restricted product and receiving role', async () => {
    const user = userEvent.setup()
    renderManagement()

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo tài khoản nhân viên' }))
    await user.type(dialog.getByLabelText('Họ tên nhân viên *'), 'Nguyễn Văn Kho')
    await user.type(dialog.getByLabelText('Email đăng nhập *'), 'stock@example.com')
    await user.type(dialog.getByLabelText('Mật khẩu ban đầu *'), 'secure-password-123')
    await user.click(dialog.getByRole('button', { name: 'Tạo tài khoản' }))

    await waitFor(() =>
      expect(inventoryService.createUser).toHaveBeenCalledWith({
        name: 'Nguyễn Văn Kho',
        email: 'stock@example.com',
        password: 'secure-password-123',
        role: 'receiver',
      }),
    )
  })

  it('lets an owner create a dedicated administrator account', async () => {
    const user = userEvent.setup()
    renderManagement()

    await screen.findByText('owner@example.com')
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Tạo tài khoản nhân viên' }))
    await user.selectOptions(dialog.getByLabelText('Vai trò *'), 'admin')
    await user.type(dialog.getByLabelText('Họ tên nhân viên *'), 'Quản trị hệ thống')
    await user.type(dialog.getByLabelText('Email đăng nhập *'), 'admin@example.com')
    await user.type(dialog.getByLabelText('Mật khẩu ban đầu *'), 'secure-password-123')
    await user.click(dialog.getByRole('button', { name: 'Tạo tài khoản' }))

    await waitFor(() =>
      expect(inventoryService.createUser).toHaveBeenCalledWith({
        name: 'Quản trị hệ thống',
        email: 'admin@example.com',
        password: 'secure-password-123',
        role: 'admin',
      }),
    )
  })

  it('filters the account directory by employee name or email', async () => {
    const user = userEvent.setup()
    renderManagement()

    await screen.findByText('owner@example.com')
    expect(screen.getByText('Tổng tài khoản')).toBeInTheDocument()
    expect(screen.getByText('Quyền phân hệ')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Tìm theo tên hoặc email' }), 'stock@')

    expect(screen.getByText('stock@example.com')).toBeInTheDocument()
    expect(screen.queryByText('owner@example.com')).not.toBeInTheDocument()
  })

  it('updates an employee role and explains that custom permissions are reset', async () => {
    const user = userEvent.setup()
    renderManagement()

    await screen.findByText('stock@example.com')
    await user.click(screen.getByRole('button', { name: 'Thao tác tài khoản · Nhân viên kho' }))
    await user.click(screen.getByRole('button', { name: 'Đổi vai trò · Nhân viên kho' }))
    const roleDialog = screen.getByRole('dialog', { name: 'Đổi vai trò · Nhân viên kho' })
    const dialog = within(roleDialog)
    expect(roleDialog).toHaveTextContent('xóa quyền tùy chỉnh')
    await user.selectOptions(dialog.getByLabelText('Vai trò mới *'), 'manager')
    await user.click(dialog.getByRole('button', { name: 'Lưu vai trò' }))

    await waitFor(() =>
      expect(inventoryService.updateUser).toHaveBeenCalledWith('employee-a', { role: 'manager' }),
    )
  })

  it('lets administrators review sign-ins, reset passwords and adjust permissions', async () => {
    const user = userEvent.setup()
    renderManagement()

    await screen.findByText('stock@example.com')
    await user.click(screen.getByRole('button', { name: 'Lịch sử đăng nhập' }))
    expect(await screen.findByRole('dialog', { name: 'Lịch sử đăng nhập' })).toHaveTextContent(
      '127.0.0.1',
    )
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Thao tác tài khoản · Nhân viên kho' }))
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))
    const passwordDialog = within(screen.getByRole('dialog', { name: 'Đặt lại mật khẩu' }))
    await user.type(passwordDialog.getByLabelText('Mật khẩu mới *'), 'new-secure-password-123')
    await user.click(passwordDialog.getByRole('button', { name: 'Đặt lại' }))
    await waitFor(() =>
      expect(inventoryService.resetUserPassword).toHaveBeenCalledWith(
        'employee-a',
        'new-secure-password-123',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Thao tác tài khoản · Nhân viên kho' }))
    await user.click(screen.getByRole('button', { name: 'Phân quyền' }))
    const permissions = within(
      await screen.findByRole('dialog', { name: 'Phân quyền · Nhân viên kho' }),
    )
    expect(permissions.getByText('Sản phẩm và nhà cung cấp')).toBeInTheDocument()
    expect(permissions.getByText('Chứng từ kho')).toBeInTheDocument()
    expect(
      permissions.getByText('Cuộn danh sách để xem các nhóm quyền bên dưới.'),
    ).toBeInTheDocument()
    expect(permissions.getByLabelText('Thêm sản phẩm')).toBeChecked()
    await user.click(permissions.getByLabelText('Thêm sản phẩm'))
    await user.click(permissions.getByRole('button', { name: 'Lưu quyền' }))
    await waitFor(() =>
      expect(inventoryService.updateUserPermissions).toHaveBeenCalledWith('employee-a', [
        { permission: 'sku.create', granted: false },
        { permission: 'document.create', granted: null },
      ]),
    )
  })

  it('shows the actual online state and the selected employee activity history', async () => {
    const user = userEvent.setup()
    renderManagement()

    await screen.findByText('stock@example.com')
    expect(screen.getByText('Ngoại tuyến')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lịch sử hoạt động · Nhân viên kho' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Lịch sử hoạt động · Nhân viên kho',
    })
    expect(dialog).toHaveTextContent('Tạo đơn hàng')
    expect(dialog).toHaveTextContent('Tạo đơn bán SO-1.')
    expect(inventoryService.listUserActivity).toHaveBeenCalledWith('employee-a')
  })
})
