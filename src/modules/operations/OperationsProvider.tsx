import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { APP_MODE, inboxService } from '../../services/inboxService'
import { useI18n, translateMessage } from '../../i18n'
import type { CustomerInput, InboxData } from '../../types/inbox'
import type { OperationsData } from './types'
import { operationsService, operationsErrorMessage } from './service'
import { OperationsContext } from './context'
import { Modal } from '../../components/shared'

export default function OperationsProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n()
  const [inbox, setInbox] = useState<InboxData | null>(null)
  const [data, setData] = useState<OperationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [notices, setNotices] = useState<{ id: number; text: string; kind: 'success' | 'error' }[]>(
    [],
  )
  const mutation = useRef(false)
  const ids = useRef(0)
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const notify = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    const id = ++ids.current
    setNotices((old) => [...old.filter((n) => n.text !== text), { id, text, kind }].slice(-3))
    timeouts.current.push(
      setTimeout(() => setNotices((old) => old.filter((n) => n.id !== id)), 6000),
    )
  }, [])
  useEffect(() => () => timeouts.current.forEach(clearTimeout), [])
  const refresh = useCallback(async () => {
    const nextInbox = await inboxService.load()
    const nextData = await operationsService.load()
    setInbox(nextInbox)
    setData(nextData)
  }, [])
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await refresh()
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [refresh])
  useEffect(() => {
    void load()
  }, [load])
  const run = async (
    action: () => Promise<OperationsData>,
    success?: string,
  ): Promise<OperationsData> => {
    if (mutation.current)
      throw new Error(t('Vui lòng chờ thao tác đang xử lý.', 'Please wait for the current action.'))
    mutation.current = true
    setBusy(true)
    try {
      const next = await action()
      setData(next)
      notify(success || t('Đã lưu thay đổi.', 'Changes saved.'))
      return next
    } catch (cause) {
      notify(operationsErrorMessage(cause, locale), 'error')
      throw cause
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }
  const saveCustomer = async (id: string | null, input: CustomerInput) => {
    if (mutation.current)
      throw new Error(t('Vui lòng chờ thao tác đang xử lý.', 'Please wait for the current action.'))
    mutation.current = true
    setBusy(true)
    try {
      const customer = id
        ? await inboxService.updateCustomer(id, input)
        : await inboxService.createCustomer(input)
      setInbox((old) =>
        old
          ? {
              ...old,
              customers: id
                ? old.customers.map((c) => (c.id === id ? customer : c))
                : [...old.customers, customer],
            }
          : old,
      )
      try {
        setData(await operationsService.load())
      } catch (cause) {
        notify(
          t(
            'Hồ sơ đã lưu; chưa tải được dữ liệu liên kết. Hãy tải lại trang.',
            'Profile saved; linked data could not be refreshed. Reload the page.',
          ),
          'error',
        )
        setError(cause)
      }
      notify(t('Đã lưu hồ sơ khách hàng.', 'Customer profile saved.'))
      return customer
    } catch (cause) {
      notify(
        translateMessage(cause instanceof Error ? cause.message : String(cause), locale),
        'error',
      )
      throw cause
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }
  const reset = async () => {
    setBusy(true)
    try {
      setData(await operationsService.reset())
      setInbox(await inboxService.load())
      setError(null)
      setResetOpen(false)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {loading ? (
        <div className="ops-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          <h2>{t('Đang tải dữ liệu vận hành…', 'Loading operations…')}</h2>
        </div>
      ) : error || !inbox || !data ? (
        <div className="ops-load-error">
          <AlertCircle size={34} />
          <h2>{t('Không thể tải phân hệ', 'Unable to load module')}</h2>
          <p>{operationsErrorMessage(error, locale)}</p>
          <div className="ops-record-actions">
            <button className="button button-primary" onClick={() => void load()}>
              {t('Thử lại', 'Try again')}
            </button>
            {APP_MODE !== 'live' && (
              <button className="button button-secondary" onClick={() => setResetOpen(true)}>
                <RotateCcw size={14} />
                {t('Khôi phục dữ liệu vận hành Demo', 'Restore Demo operations')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <OperationsContext.Provider
          value={{
            inbox,
            data,
            service: operationsService,
            busy,
            run,
            saveCustomer,
            refresh,
            notify,
          }}
        >
          {children}
        </OperationsContext.Provider>
      )}
      <div className="toast-container" aria-live="polite">
        {notices.map((n) => (
          <div
            key={n.id}
            className={`toast toast-${n.kind}`}
            role={n.kind === 'error' ? 'alert' : 'status'}
          >
            {n.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
            <span>{n.text}</span>
            <button
              className="icon-button"
              aria-label={t('Đóng thông báo', 'Dismiss notification')}
              onClick={() => setNotices((old) => old.filter((item) => item.id !== n.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {resetOpen && (
        <Modal
          title={t('Khôi phục dữ liệu vận hành?', 'Restore operations data?')}
          onClose={() => {
            if (!busy) setResetOpen(false)
          }}
        >
          <div className="modal-body">
            <p>
              {t(
                'Thao tác này thay thế đơn hàng, vận đơn, ticket và thông tin chăm sóc Demo bằng dữ liệu ban đầu. Hồ sơ khách hàng và hội thoại được giữ nguyên.',
                'This replaces Demo orders, shipments, tickets and care profiles with the original data. Customer records and conversations are preserved.',
              )}
            </p>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setResetOpen(false)}
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button className="button button-danger" disabled={busy} onClick={() => void reset()}>
                {t('Khôi phục Demo', 'Restore Demo')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
