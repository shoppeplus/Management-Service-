// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { createDemoData } from '../../data/demo'
import { inboxService } from '../../services/inboxService'
import { InventoryApiError, inventoryService } from '../inventory/service'
import { createOperationsDemoData } from '../operations/data'
import { operationsService } from '../operations/service'
import { marketIntelligenceService } from '../market-intelligence/service'
import { accountingService } from './accountingService'

vi.mock('../../services/inboxService', () => ({
  APP_MODE: 'live',
  inboxService: { load: vi.fn() },
}))
vi.mock('../operations/service', () => ({ operationsService: { load: vi.fn() } }))
vi.mock('../inventory/service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../inventory/service')>()
  return {
    ...original,
    inventoryService: {
      ...original.inventoryService,
      load: vi.fn(),
      checkSession: vi.fn(),
    },
  }
})

const session = {
  actor: { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' },
  user: { id: 'owner-a', name: 'Owner', email: 'owner@example.com', role: 'owner' },
  tenant: { id: 'tenant-a', name: 'Company' },
  permissions: ['operations.read', 'inbox.read', 'sku.create', 'accounting.read'],
}
const reportInbox = createDemoData()
const reportOperations = createOperationsDemoData(reportInbox)
const loadReportData = () => {
  vi.mocked(inboxService.load).mockResolvedValue(reportInbox)
  vi.mocked(operationsService.load).mockResolvedValue(reportOperations)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('Reports route', () => {
  it('opens detailed reports from live operations data', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.checkSession).mockResolvedValue(session)
    loadReportData()
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Báo cáo doanh thu' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'So sánh kỳ báo cáo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Xu hướng đơn hàng theo ngày' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Danh sách đơn hàng' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thanh toán theo trạng thái' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sản phẩm bán chạy' })).toBeInTheDocument()
    const period = screen.getByRole('button', { name: '7 ngày' })
    await user.click(period)
    expect(period).toHaveAttribute('aria-pressed', 'true')
    expect(inboxService.load).toHaveBeenCalledOnce()
    expect(operationsService.load).toHaveBeenCalledOnce()
  })

  it('loads the internal ledger view from its dedicated report tab', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.checkSession).mockResolvedValue(session)
    loadReportData()
    vi.spyOn(accountingService, 'listAccounts').mockResolvedValue([
      {
        code: 'A-CASH',
        name: 'Cash on hand',
        category: 'asset',
        normalBalance: 'debit',
        description: '',
        isSystem: true,
      },
    ])
    vi.spyOn(accountingService, 'trialBalance').mockResolvedValue({
      from: '2026-01-01',
      to: '2026-01-31',
      accounts: [
        {
          code: 'A-CASH',
          name: 'Cash on hand',
          category: 'asset',
          normalBalance: 'debit',
          openingBalance: 0,
          periodDebit: 10000,
          periodCredit: 0,
          closingDebit: 10000,
          closingCredit: 0,
        },
      ],
      totals: { periodDebit: 10000, periodCredit: 10000, closingDebit: 10000, closingCredit: 10000 },
    })
    vi.spyOn(accountingService, 'listJournals').mockResolvedValue({
      entries: [],
      nextOffset: null,
    })
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { level: 1, name: 'Báo cáo doanh thu' })
    await user.click(screen.getByRole('tab', { name: 'Sổ kế toán' }))

    expect(await screen.findByRole('heading', { name: 'Sổ kế toán nội bộ' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Khoảng thời gian báo cáo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Làm mới số liệu' })).not.toBeInTheDocument()
    expect(screen.getByText('A-CASH')).toBeInTheDocument()
    expect(screen.getByText(/chưa tự đồng bộ từ đơn hàng/i)).toBeInTheDocument()
    expect(accountingService.trialBalance).toHaveBeenCalledOnce()
  })

  it('paginates the journal list instead of hiding entries beyond the first page', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.checkSession).mockResolvedValue(session)
    loadReportData()
    vi.spyOn(accountingService, 'listAccounts').mockResolvedValue([])
    vi.spyOn(accountingService, 'trialBalance').mockResolvedValue({
      from: null,
      to: null,
      accounts: [],
      totals: { periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 },
    })
    vi.spyOn(accountingService, 'listJournals')
      .mockResolvedValueOnce({ entries: [], nextOffset: 100 })
      .mockResolvedValueOnce({
        entries: [
          {
            id: 'journal-101',
            number: 'JE-101',
            entryDate: '2026-01-10',
            memo: 'Entry on the next page',
            sourceType: null,
            sourceReference: '',
            currencyCode: 'VND',
            reversalOfId: null,
            createdBy: 'owner-a',
            createdAt: '2026-01-10T00:00:00.000Z',
            lines: [],
          },
        ],
        nextOffset: null,
      })
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { level: 1, name: 'Báo cáo doanh thu' })
    await user.click(screen.getByRole('tab', { name: 'Sổ kế toán' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Chế độ sổ kế toán' }), 'journals')
    await user.click(await screen.findByRole('button', { name: 'Tải thêm chứng từ' }))

    expect(await screen.findByText('JE-101')).toBeInTheDocument()
    expect(accountingService.listJournals).toHaveBeenCalledTimes(2)
  })

  it('keeps product navigation and hides automation and login from the module menu', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryService.checkSession).mockResolvedValue(session)
    loadReportData()
    vi.spyOn(marketIntelligenceService, 'status').mockResolvedValue({
      ready: false,
      provider: { name: 'Google Gemini', configured: false, model: 'gemini-3.8-flash' },
    })
    vi.spyOn(marketIntelligenceService, 'listRuns').mockResolvedValue([])
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { level: 1, name: 'Báo cáo doanh thu' })
    await user.click(screen.getByRole('button', { name: 'Mở điều hướng' }))
    const navigation = within(screen.getByRole('navigation', { name: 'Các phân hệ vận hành' }))
    expect(navigation.queryByRole('link', { name: 'Đăng nhập' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Tự động hóa' })).not.toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Báo cáo' })).toHaveAttribute('href', '/reports')
    await user.click(navigation.getByRole('link', { name: 'Phân tích thị trường' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Phân tích thị trường bằng AI' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Trạng thái dịch vụ AI' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Phân tích thị trường' })).toBeDisabled()
    const adminNavigation = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
    expect(adminNavigation.getByRole('link', { name: 'Phân tích thị trường' })).toHaveAttribute(
      'href',
      '/market-intelligence',
    )
    expect(
      screen.queryByRole('navigation', { name: 'Các phân hệ vận hành' }),
    ).not.toBeInTheDocument()
    expect(inboxService.load).toHaveBeenCalledOnce()
    expect(operationsService.load).toHaveBeenCalledOnce()
  })

  it('opens the product catalog from the left navigation', async () => {
    loadReportData()
    vi.mocked(inventoryService.checkSession)
      .mockResolvedValueOnce(session)
      .mockRejectedValueOnce(new InventoryApiError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'))
    vi.mocked(inventoryService.load).mockRejectedValue(
      new InventoryApiError(401, 'UNAUTHENTICATED', 'Cần đăng nhập'),
    )
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/reports']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'Báo cáo doanh thu' })
    const sidebar = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
    expect(sidebar.queryByRole('button', { name: 'Tự động hóa' })).not.toBeInTheDocument()
    expect(sidebar.queryByRole('button', { name: 'Đăng nhập' })).not.toBeInTheDocument()
    await user.click(sidebar.getByRole('link', { name: 'Sản phẩm' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sản phẩm' })).toBeInTheDocument()
    expect(inboxService.load).toHaveBeenCalledOnce()
    expect(operationsService.load).toHaveBeenCalledOnce()
  })
})
