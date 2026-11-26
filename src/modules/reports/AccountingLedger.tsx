import { Download, MoreHorizontal, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useI18n } from '../../i18n'
import { useAppAccess } from '../operations/access'
import {
  accountingService,
  AccountingApiError,
} from './accountingService'
import type {
  AccountingAccount,
  AccountingJournal,
  JournalInput,
  TrialBalance,
} from './accountingService'

export type AccountingLedgerTab = 'trial' | 'journals' | 'accounts'
type JournalLineInput = { accountCode: string; debit: string; credit: string; description: string }

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const monthStart = () => `${today().slice(0, 7)}-01`
const emptyLine = (): JournalLineInput => ({ accountCode: '', debit: '', credit: '', description: '' })
const money = (value: number, locale: string) =>
  new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    maximumFractionDigits: 0,
  }).format(value)
const csvValue = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const exportCsv = (filename: string, rows: unknown[][]) => {
  const content = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AccountingLedger({
  initialTab = 'trial',
  showViewSelect = true,
}: {
  initialTab?: AccountingLedgerTab
  showViewSelect?: boolean
} = {}) {
  const { t, locale } = useI18n()
  const access = useAppAccess()
  const canPost = access.permissions.includes('accounting.post')
  const [tab, setTab] = useState<AccountingLedgerTab>(initialTab)
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [accounts, setAccounts] = useState<AccountingAccount[]>([])
  const [journals, setJournals] = useState<AccountingJournal[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [trial, setTrial] = useState<TrialBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [entryDate, setEntryDate] = useState(today)
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<JournalLineInput[]>([emptyLine(), emptyLine()])
  const [reversingId, setReversingId] = useState('')
  const [reverseReason, setReverseReason] = useState('')
  const [reverseDate, setReverseDate] = useState(today)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setLoadingMore(false)
    setError('')
    try {
      const [nextAccounts, nextTrial, nextJournals] = await Promise.all([
        accountingService.listAccounts(),
        accountingService.trialBalance({ from, to }),
        accountingService.listJournals({ from, to, limit: 100 }),
      ])
      if (currentRequest === requestId.current) {
        setAccounts(nextAccounts)
        setTrial(nextTrial)
        setJournals(nextJournals.entries)
        setNextOffset(nextJournals.nextOffset)
      }
    } catch (cause) {
      if (currentRequest === requestId.current)
        setError(
          cause instanceof AccountingApiError
            ? cause.message
            : t('Không tải được dữ liệu sổ kế toán.', 'Unable to load accounting ledger data.'),
        )
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [from, to, t])

  useEffect(() => {
    void load()
  }, [load])

  const currency = useMemo(
    () => (value: number) => `${money(value, locale)} ₫`,
    [locale],
  )

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return
    const currentRequest = requestId.current
    setLoadingMore(true)
    setError('')
    try {
      const page = await accountingService.listJournals({
        from,
        to,
        limit: 100,
        offset: nextOffset,
      })
      if (currentRequest === requestId.current) {
        setJournals((current) => [...current, ...page.entries])
        setNextOffset(page.nextOffset)
      }
    } catch (cause) {
      if (currentRequest === requestId.current)
        setError(
          cause instanceof AccountingApiError
            ? cause.message
            : t('Không tải thêm được sổ nhật ký.', 'Unable to load more journal entries.'),
        )
    } finally {
      if (currentRequest === requestId.current) setLoadingMore(false)
    }
  }

  const exportCurrent = async () => {
    if (tab === 'trial' && trial) {
      exportCsv('bang-can-doi-thu.csv', [
        ['Mã tài khoản', 'Tên tài khoản', 'Loại', 'Số dư đầu kỳ', 'Phát sinh Nợ', 'Phát sinh Có', 'Dư Nợ cuối kỳ', 'Dư Có cuối kỳ'],
        ...trial.accounts.map((row) => [
          row.code,
          row.name,
          row.category,
          row.openingBalance,
          row.periodDebit,
          row.periodCredit,
          row.closingDebit,
          row.closingCredit,
        ]),
      ])
    } else if (tab === 'journals') {
      setExporting(true)
      setError('')
      try {
        const allJournals = [...journals]
        let offset = nextOffset
        while (offset !== null) {
          const page = await accountingService.listJournals({ from, to, limit: 500, offset })
          allJournals.push(...page.entries)
          offset = page.nextOffset
        }
        exportCsv('so-nhat-ky.csv', [
          ['Số chứng từ', 'Ngày', 'Diễn giải', 'Loại nguồn', 'Mã nguồn', 'Tài khoản', 'Tên tài khoản', 'Nợ', 'Có'],
          ...allJournals.flatMap((journal) =>
            journal.lines.map((line) => [
              journal.number,
              journal.entryDate,
              journal.memo,
              journal.sourceType,
              journal.sourceReference,
              line.accountCode,
              line.accountName,
              line.debit,
              line.credit,
            ]),
          ),
        ])
      } catch (cause) {
        setError(
          cause instanceof AccountingApiError
            ? cause.message
            : t('Không xuất được sổ nhật ký.', 'Unable to export journal entries.'),
        )
      } finally {
        setExporting(false)
      }
    } else {
      exportCsv('he-thong-tai-khoan.csv', [
        ['Mã tài khoản', 'Tên tài khoản', 'Loại', 'Tính chất số dư', 'Tài khoản hệ thống'],
        ...accounts.map((account) => [
          account.code,
          account.name,
          account.category,
          account.normalBalance,
          account.isSystem ? 'Có' : 'Không',
        ]),
      ])
    }
  }

  const submitJournal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const input: JournalInput = {
        entryDate,
        memo,
        sourceType: 'adjustment',
        lines: lines.map((line) => ({
          accountCode: line.accountCode,
          description: line.description,
          debit: line.debit === '' ? 0 : Number(line.debit),
          credit: line.credit === '' ? 0 : Number(line.credit),
        })),
      }
      await accountingService.createJournal(input)
      setMemo('')
      setLines([emptyLine(), emptyLine()])
      setNotice(t('Đã ghi sổ bút toán.', 'Journal entry posted.'))
      await load()
    } catch (cause) {
      setError(
        cause instanceof AccountingApiError
          ? cause.message
          : t('Không ghi được bút toán.', 'Unable to post journal entry.'),
      )
    } finally {
      setSaving(false)
    }
  }

  const submitReversal = async (event: FormEvent<HTMLFormElement>, journal: AccountingJournal) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await accountingService.reverseJournal(journal.id, {
        entryDate: reverseDate,
        reason: reverseReason,
      })
      setReversingId('')
      setReverseReason('')
      setNotice(t('Đã ghi nhận bút toán đảo.', 'Reversal entry posted.'))
      await load()
    } catch (cause) {
      setError(
        cause instanceof AccountingApiError
          ? cause.message
          : t('Không đảo được bút toán.', 'Unable to reverse journal entry.'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="accounting-ledger" aria-label={t('Sổ kế toán', 'Accounting ledger')}>
      <header className="accounting-heading">
        <div>
          <span className="accounting-eyebrow">{t('NỀN TẢNG KẾ TOÁN', 'ACCOUNTING FOUNDATION')}</span>
          <h1>{t('Sổ kế toán nội bộ', 'Internal accounting ledger')}</h1>
          <p>
            {t(
              'Sổ kép VND trung lập, chưa cấu hình theo chế độ kế toán hoặc biểu mẫu pháp định. Chỉ gồm chứng từ đã được ghi sổ.',
              'A neutral VND double-entry ledger, not configured for a statutory accounting standard or filing. Includes posted entries only.',
            )}
          </p>
        </div>
        <details className="accounting-actions-menu">
          <summary aria-label={t('Tác vụ khác', 'More actions')} title={t('Tác vụ khác', 'More actions')}>
            <MoreHorizontal size={19} />
          </summary>
          <div className="accounting-actions-popover">
            <button
              type="button"
              disabled={exporting}
              onClick={(event) => {
                void exportCurrent()
                event.currentTarget.closest('details')?.removeAttribute('open')
              }}
            >
              <Download size={15} />
              {exporting ? t('Đang xuất…', 'Exporting…') : t('Xuất CSV', 'Export CSV')}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={(event) => {
                void load()
                event.currentTarget.closest('details')?.removeAttribute('open')
              }}
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              {t('Làm mới', 'Refresh')}
            </button>
          </div>
        </details>
      </header>

      <div className="accounting-filters">
        <label>
          {t('Từ ngày', 'From')}
          <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          {t('Đến ngày', 'To')}
          <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        </label>
        <span>{t('Đơn vị tiền tệ: VND', 'Currency: VND')}</span>
      </div>

      {showViewSelect && (
        <label className="accounting-view-select">
          <span>{t('Xem', 'View')}</span>
          <select
            aria-label={t('Chế độ sổ kế toán', 'Accounting view')}
            value={tab}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (value === 'trial' || value === 'journals' || value === 'accounts')
                setTab(value)
            }}
          >
            <option value="trial">{t('Bảng cân đối thử', 'Trial balance')}</option>
            <option value="journals">{t('Sổ nhật ký', 'Journal')}</option>
            <option value="accounts">{t('Hệ thống tài khoản', 'Chart of accounts')}</option>
          </select>
        </label>
      )}

      {error && <div className="accounting-alert" role="alert">{error}</div>}
      {notice && <div className="accounting-notice" role="status">{notice}</div>}
      {loading && <p className="accounting-empty">{t('Đang tải sổ kế toán…', 'Loading ledger…')}</p>}

      {!loading && !error && tab === 'trial' && trial && (
        <div className="accounting-table-wrap">
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('Tài khoản', 'Account')}</th>
                <th>{t('Số dư đầu kỳ', 'Opening')}</th>
                <th>{t('Phát sinh Nợ', 'Period debit')}</th>
                <th>{t('Phát sinh Có', 'Period credit')}</th>
                <th>{t('Dư Nợ cuối kỳ', 'Closing debit')}</th>
                <th>{t('Dư Có cuối kỳ', 'Closing credit')}</th>
              </tr>
            </thead>
            <tbody>
              {trial.accounts.map((row) => (
                <tr key={row.code}>
                  <td><strong>{row.code}</strong><span>{row.name}</span></td>
                  <td>{currency(row.openingBalance)}</td>
                  <td>{currency(row.periodDebit)}</td>
                  <td>{currency(row.periodCredit)}</td>
                  <td>{currency(row.closingDebit)}</td>
                  <td>{currency(row.closingCredit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t('Tổng cộng', 'Total')}</th>
                <th />
                <th>{currency(trial.totals.periodDebit)}</th>
                <th>{currency(trial.totals.periodCredit)}</th>
                <th>{currency(trial.totals.closingDebit)}</th>
                <th>{currency(trial.totals.closingCredit)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && !error && tab === 'journals' && (
        <div className="accounting-journal-list">
          {journals.length === 0 && (
            <p className="accounting-empty">{t('Chưa có chứng từ ghi sổ trong kỳ này.', 'No posted entries in this period.')}</p>
          )}
          {journals.map((journal) => (
            <article className="accounting-journal" key={journal.id}>
              <div className="accounting-journal-heading">
                <div>
                  <strong>{journal.number}</strong>
                  <span>{journal.entryDate} · {journal.memo}</span>
                </div>
                {canPost && !journal.reversalOfId && (
                  <details className="accounting-entry-menu">
                    <summary
                      aria-label={t('Tác vụ chứng từ', 'Journal actions')}
                      title={t('Tác vụ chứng từ', 'Journal actions')}
                    >
                      <MoreHorizontal size={18} />
                    </summary>
                    <div>
                      <button
                        type="button"
                        onClick={(event) => {
                          setReversingId(reversingId === journal.id ? '' : journal.id)
                          setReverseReason('')
                          event.currentTarget.closest('details')?.removeAttribute('open')
                        }}
                      >
                        <RotateCcw size={14} />
                        {t('Đảo bút toán', 'Reverse')}
                      </button>
                    </div>
                  </details>
                )}
              </div>
              <div className="accounting-table-wrap">
                <table className="accounting-table accounting-line-table">
                  <thead>
                    <tr>
                      <th>{t('Tài khoản', 'Account')}</th>
                      <th>{t('Diễn giải', 'Description')}</th>
                      <th>{t('Nợ', 'Debit')}</th>
                      <th>{t('Có', 'Credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.lines.map((line) => (
                      <tr key={`${journal.id}-${line.lineNumber}`}>
                        <td><strong>{line.accountCode}</strong><span>{line.accountName}</span></td>
                        <td>{line.description || '—'}</td>
                        <td>{currency(line.debit)}</td>
                        <td>{currency(line.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reversingId === journal.id && (
                <form className="accounting-reversal-form" onSubmit={(event) => void submitReversal(event, journal)}>
                  <label>
                    {t('Ngày đảo', 'Reversal date')}
                    <input type="date" required value={reverseDate} onChange={(event) => setReverseDate(event.target.value)} />
                  </label>
                  <label>
                    {t('Lý do', 'Reason')}
                    <input required minLength={3} maxLength={1000} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} />
                  </label>
                  <button type="submit" disabled={saving}>{t('Xác nhận đảo', 'Confirm reversal')}</button>
                </form>
              )}
            </article>
          ))}
          {nextOffset !== null && (
            <button
              type="button"
              className="accounting-secondary-button accounting-load-more"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore
                ? t('Đang tải…', 'Loading…')
                : t('Tải thêm chứng từ', 'Load more entries')}
            </button>
          )}
        </div>
      )}

      {!loading && !error && tab === 'accounts' && (
        <div className="accounting-account-grid">
          {accounts.map((account) => (
            <article key={account.code}>
              <strong>{account.code}</strong>
              <span>{account.name}</span>
              <small>
                {account.category} · {account.normalBalance === 'debit' ? t('Dư Nợ', 'Debit balance') : t('Dư Có', 'Credit balance')}
              </small>
            </article>
          ))}
        </div>
      )}

      {canPost && tab === 'journals' && (
        <details className="accounting-entry-panel">
          <summary><Plus size={16} />{t('Lập bút toán thủ công', 'Create manual journal entry')}</summary>
          <form onSubmit={(event) => void submitJournal(event)}>
            <div className="accounting-entry-fields">
              <label>
                {t('Ngày hạch toán', 'Entry date')}
                <input required type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              </label>
              <label>
                {t('Diễn giải chứng từ', 'Journal memo')}
                <input required minLength={1} maxLength={1000} value={memo} onChange={(event) => setMemo(event.target.value)} />
              </label>
            </div>
            <div className="accounting-entry-lines">
              {lines.map((line, index) => (
                <div className="accounting-entry-line" key={index}>
                  <label>
                    {t('Tài khoản', 'Account')}
                    <select
                      required
                      value={line.accountCode}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, lineIndex) =>
                            lineIndex === index ? { ...item, accountCode: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      <option value="">{t('Chọn tài khoản', 'Select account')}</option>
                      {accounts.map((account) => (
                        <option key={account.code} value={account.code}>{account.code} — {account.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('Nợ (VND)', 'Debit (VND)')}
                    <input type="number" min="0" step="1" value={line.debit} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, debit: event.target.value } : item))} />
                  </label>
                  <label>
                    {t('Có (VND)', 'Credit (VND)')}
                    <input type="number" min="0" step="1" value={line.credit} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, credit: event.target.value } : item))} />
                  </label>
                  <label>
                    {t('Diễn giải dòng', 'Line description')}
                    <input maxLength={500} value={line.description} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, description: event.target.value } : item))} />
                  </label>
                  {lines.length > 2 && (
                    <button className="accounting-remove-line" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>
                      {t('Xóa dòng', 'Remove line')}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="accounting-entry-footer">
              <button type="button" className="accounting-secondary-button" onClick={() => setLines((current) => [...current, emptyLine()])}>
                <Plus size={14} />{t('Thêm dòng', 'Add line')}
              </button>
              <button type="submit" disabled={saving || loading}>
                {saving ? t('Đang ghi sổ…', 'Posting…') : t('Ghi sổ bút toán', 'Post journal entry')}
              </button>
            </div>
          </form>
        </details>
      )}
      <p className="accounting-disclaimer">
        {t(
          'Dữ liệu hiện chưa tự đồng bộ từ đơn hàng, thanh toán, thuế, mua hàng, chi phí hoặc biến động kho. Không dùng để kê khai hay lập báo cáo pháp định.',
          'Entries are not yet automatically sourced from orders, payments, tax, purchases, expenses or stock movements. Do not use for statutory reporting.',
        )}
      </p>
    </section>
  )
}
