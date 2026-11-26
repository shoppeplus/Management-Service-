import { AlertTriangle, Clock3, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { buildDashboard } from '../dashboard/metrics'
import type { DashboardPeriod } from '../dashboard/metrics'
import { useOperations } from '../operations/context'
import { operationsErrorMessage } from '../operations/service'
import { SalesReport } from '../admin/AdminReports'
import AccountingLedger from './AccountingLedger'
import '../dashboard/dashboard.css'
import '../admin/admin.css'
import './reports.css'

export default function ReportsPage() {
  const { inbox, data, refresh, busy } = useOperations()
  const { t, locale } = useI18n()
  const [days, setDays] = useState<DashboardPeriod>(30)
  const [now, setNow] = useState(() => new Date())
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [section, setSection] = useState<'sales' | 'accounting'>('sales')
  const refreshLock = useRef(false)
  const mounted = useRef(true)
  const overview = useMemo(() => buildDashboard(inbox, data, days, now), [inbox, data, days, now])
  const displayDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => {
      if (!document.hidden) setNow(new Date())
    }, 60_000)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [])

  const reload = async () => {
    if (refreshLock.current || busy) return
    refreshLock.current = true
    setRefreshing(true)
    setRefreshError('')
    try {
      await refresh()
      if (mounted.current) {
        const current = new Date()
        setNow(current)
        setUpdatedAt(current)
      }
    } catch (cause) {
      if (mounted.current) setRefreshError(operationsErrorMessage(cause, locale))
    } finally {
      refreshLock.current = false
      if (mounted.current) setRefreshing(false)
    }
  }

  return (
    <main
      className="dashboard-page reports-page"
      aria-label={t(
        section === 'sales' ? 'Báo cáo doanh thu' : 'Sổ kế toán',
        section === 'sales' ? 'Revenue reports' : 'Accounting ledger',
      )}
    >
      {section === 'sales' && (
        <>
          <header className="dashboard-heading">
            <div>
              <span className="dashboard-eyebrow">
                <span />
                {t('BÁO CÁO BÁN HÀNG', 'SALES REPORTING')}
              </span>
              <h1>{t('Báo cáo doanh thu', 'Revenue reports')}</h1>
              <p>
                {t(
                  'Phân tích giá trị đơn hàng, thanh toán, vận chuyển và sản phẩm bán chạy theo từng kỳ.',
                  'Analyze order value, payments, shipping and top-selling products over time.',
                )}
              </p>
            </div>
            <div className="dashboard-heading-actions">
              <button
                type="button"
                className="dashboard-refresh"
                disabled={refreshing || busy}
                onClick={() => void reload()}
              >
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
                {refreshing
                  ? t('Đang cập nhật…', 'Refreshing…')
                  : t('Làm mới số liệu', 'Refresh data')}
              </button>
            </div>
          </header>

          <div className="dashboard-filter-bar reports-filter-bar">
            <div
              className="dashboard-period-filter"
              role="group"
              aria-label={t('Khoảng thời gian báo cáo', 'Report period')}
            >
              {([7, 30, 90] as const).map((period) => (
                <button
                  type="button"
                  key={period}
                  aria-pressed={period === days}
                  onClick={() => setDays(period)}
                >
                  {period} {t('ngày', 'days')}
                </button>
              ))}
            </div>
            <span className="reports-date-range">
              {displayDate(overview.period.start)} – {displayDate(overview.period.end)}
            </span>
            <span className="dashboard-updated">
              <Clock3 size={13} />
              {t('Cập nhật', 'Updated')}{' '}
              <time dateTime={updatedAt.toISOString()}>
                {updatedAt.toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </span>
          </div>

          {refreshError && (
            <div className="dashboard-refresh-error" role="alert">
              <AlertTriangle size={18} />
              <div>
                <strong>{t('Chưa cập nhật được số liệu', 'Unable to refresh data')}</strong>
                <p>{refreshError}</p>
              </div>
            </div>
          )}
        </>
      )}

      <div
        className="reports-section-switch"
        role="tablist"
        aria-label={t('Loại báo cáo', 'Report type')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'sales'}
          onClick={() => setSection('sales')}
        >
          {t('Báo cáo bán hàng', 'Sales reports')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'accounting'}
          onClick={() => setSection('accounting')}
        >
          {t('Sổ kế toán', 'Accounting ledger')}
        </button>
      </div>

      <div className="reports-content">
        {section === 'sales' ? (
          <SalesReport inbox={inbox} data={data} overview={overview} now={now} />
        ) : (
          <AccountingLedger />
        )}
      </div>
    </main>
  )
}
