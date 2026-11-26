import { notifyAuthenticationExpired } from '../../services/authSession'

export interface AccountingAccount {
  code: string
  name: string
  category: string
  normalBalance: 'debit' | 'credit'
  description: string
  isSystem: boolean
}

export interface AccountingJournalLine {
  lineNumber: number
  accountCode: string
  accountName: string
  description: string
  debit: number
  credit: number
  counterpartyType: string | null
  counterpartyReference: string
  taxCode: string | null
  taxRateBasisPoints: number | null
  taxAmount: number | null
}

export interface AccountingJournal {
  id: string
  number: string
  entryDate: string
  memo: string
  sourceType: string | null
  sourceReference: string
  currencyCode: string
  reversalOfId: string | null
  createdBy: string
  createdAt: string
  lines: AccountingJournalLine[]
}

export interface TrialBalanceRow {
  code: string
  name: string
  category: string
  normalBalance: 'debit' | 'credit'
  openingBalance: number
  periodDebit: number
  periodCredit: number
  closingDebit: number
  closingCredit: number
}

export interface TrialBalance {
  from: string | null
  to: string | null
  accounts: TrialBalanceRow[]
  totals: {
    periodDebit: number
    periodCredit: number
    closingDebit: number
    closingCredit: number
  }
}

export interface JournalFilters {
  from?: string
  to?: string
  accountCode?: string
  limit?: number
  offset?: number
}

export interface JournalInput {
  entryDate: string
  memo: string
  sourceType?: string | null
  sourceReference?: string
  lines: Array<{
    accountCode: string
    description?: string
    debit: number
    credit: number
  }>
}

export class AccountingApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function assertAccounts(value: unknown): asserts value is AccountingAccount[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (row) =>
        !isRecord(row) ||
        typeof row.code !== 'string' ||
        typeof row.name !== 'string' ||
        typeof row.category !== 'string' ||
        !['debit', 'credit'].includes(String(row.normalBalance)) ||
        typeof row.description !== 'string' ||
        typeof row.isSystem !== 'boolean',
    )
  )
    throw new AccountingApiError(502, 'INVALID_RESPONSE', 'Dữ liệu tài khoản kế toán không hợp lệ.')
}

function assertJournal(value: unknown): asserts value is AccountingJournal {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.number !== 'string' ||
    typeof value.entryDate !== 'string' ||
    typeof value.memo !== 'string' ||
    !Array.isArray(value.lines) ||
    value.lines.some(
      (line) =>
        !isRecord(line) ||
        typeof line.accountCode !== 'string' ||
        typeof line.debit !== 'number' ||
        typeof line.credit !== 'number',
    )
  )
    throw new AccountingApiError(502, 'INVALID_RESPONSE', 'Dữ liệu sổ nhật ký không hợp lệ.')
}

function assertTrialBalance(value: unknown): asserts value is TrialBalance {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !isRecord(value.totals))
    throw new AccountingApiError(502, 'INVALID_RESPONSE', 'Bảng cân đối thử không hợp lệ.')
  const totals = value.totals
  if (
    value.accounts.some(
      (row) =>
        !isRecord(row) ||
        typeof row.code !== 'string' ||
        typeof row.name !== 'string' ||
        typeof row.periodDebit !== 'number' ||
        typeof row.periodCredit !== 'number' ||
        typeof row.closingDebit !== 'number' ||
        typeof row.closingCredit !== 'number',
    ) ||
    ['periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'].some(
      (key) => typeof totals[key] !== 'number',
    )
  )
    throw new AccountingApiError(502, 'INVALID_RESPONSE', 'Bảng cân đối thử không hợp lệ.')
}

export function createAccountingService(baseUrl = '') {
  const request = async (path: string, method = 'GET', body?: unknown): Promise<unknown> => {
    let response: Response
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      throw new AccountingApiError(
        0,
        'CONNECTION_ERROR',
        'Không kết nối được máy chủ kế toán. Hãy thử tải lại sau.',
      )
    }

    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new AccountingApiError(502, 'INVALID_RESPONSE', 'API kế toán trả về dữ liệu không hợp lệ.')
    }
    if (!response.ok) {
      if (response.status === 401) notifyAuthenticationExpired()
      const error = isRecord(value) && isRecord(value.error) ? value.error : {}
      throw new AccountingApiError(
        response.status,
        typeof error.code === 'string' ? error.code : 'API_ERROR',
        typeof error.message === 'string' ? error.message : `API kế toán: ${response.status}`,
      )
    }
    return value
  }
  const query = (filters: object) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters))
      if ((typeof value === 'string' || typeof value === 'number') && value !== '')
        params.set(key, String(value))
    return params.size ? `?${params.toString()}` : ''
  }

  return {
    async listAccounts() {
      const value = await request('/accounting/accounts')
      assertAccounts(value)
      return value
    },
    async trialBalance(filters: { from?: string; to?: string } = {}) {
      const value = await request(`/accounting/trial-balance${query(filters)}`)
      assertTrialBalance(value)
      return value
    },
    async listJournals(filters: JournalFilters = {}) {
      const value = await request(`/accounting/journals${query(filters)}`)
      if (
        !isRecord(value) ||
        !Array.isArray(value.entries) ||
        (value.nextOffset !== null && typeof value.nextOffset !== 'number')
      )
        throw new AccountingApiError(502, 'INVALID_RESPONSE', 'Danh sách sổ nhật ký không hợp lệ.')
      const entries = value.entries.map((entry) => {
        assertJournal(entry)
        return entry
      })
      return { entries, nextOffset: value.nextOffset }
    },
    async createJournal(input: JournalInput) {
      const value = await request('/accounting/journals', 'POST', input)
      assertJournal(value)
      return value
    },
    async reverseJournal(id: string, input: { entryDate: string; reason: string }) {
      const value = await request(
        `/accounting/journals/${encodeURIComponent(id)}/reverse`,
        'POST',
        input,
      )
      assertJournal(value)
      return value
    },
  }
}

export const accountingService = createAccountingService(
  import.meta.env.VITE_INVENTORY_API_BASE_URL || '',
)
