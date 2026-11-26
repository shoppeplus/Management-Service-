import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { InventoryApiError, inventoryService } from './service'
import InventoryLogin from './InventoryLogin'
import './inventory.css'

const requestedPath = (state: unknown): string => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return '/dashboard'
  const from = (state as Record<string, unknown>).from
  if (typeof from !== 'string') return '/dashboard'
  try {
    const url = new URL(from, window.location.origin)
    const allowedPaths = new Set([
      '/inbox',
      '/dashboard',
      '/customers',
      '/care',
      '/orders',
      '/logistics',
      '/inventory',
      '/products',
      '/market-intelligence',
      '/reports',
    ])
    if (url.origin !== window.location.origin || !allowedPaths.has(url.pathname))
      return '/dashboard'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/dashboard'
  }
}

export default function InventoryAuthPage() {
  const { pathname, state } = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const mode = pathname === '/register' ? 'register' : 'login'
  const returnTo = requestedPath(state)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [error, setError] = useState('')

  const checkSession = useCallback(async () => {
    setChecking(true)
    setError('')
    setConnectionFailed(false)
    try {
      await inventoryService.checkSession()
      navigate(returnTo, { replace: true })
      return true
    } catch (cause) {
      if (!(cause instanceof InventoryApiError && cause.status === 401)) {
        setError(cause instanceof Error ? cause.message : 'Inventory API error')
        setConnectionFailed(
          !(cause instanceof InventoryApiError) || cause.status === 0 || cause.status >= 500,
        )
      }
      return false
    } finally {
      setChecking(false)
    }
  }, [navigate, returnTo])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    document.title = `${mode === 'register' ? t('Đăng ký', 'Register') : t('Đăng nhập', 'Sign in')} · SmartSales Suite`
  }, [mode, t])

  const authenticate = async (action: () => Promise<void>) => {
    if (checking || busy) return false
    setBusy(true)
    setError('')
    setConnectionFailed(false)
    let signedIn = false
    try {
      await action()
      signedIn = true
      navigate(returnTo, { replace: true })
      return true
    } catch (cause) {
      if (!signedIn && cause instanceof InventoryApiError && cause.status === 401)
        setError(
          t(
            'Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.',
            'Email or password is incorrect, or the account has been disabled.',
          ),
        )
      else setError(cause instanceof Error ? cause.message : 'Authentication error')
      setConnectionFailed(
        !(cause instanceof InventoryApiError) || cause.status === 0 || cause.status >= 500,
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="inventory-auth-page" aria-label={t('Tài khoản kho', 'Inventory account')}>
      <div className="inventory-auth-content">
        {error && (
          <div className="inv-error" role="alert">
            {error}
          </div>
        )}
        <InventoryLogin
          mode={mode}
          checking={checking}
          busy={busy}
          connectionFailed={connectionFailed}
          onLogin={(email, password) => authenticate(() => inventoryService.login(email, password))}
          onRegister={(input) => authenticate(() => inventoryService.register(input))}
          onRetry={() => void checkSession()}
          onModeChange={(nextMode) =>
            navigate(nextMode === 'register' ? '/register' : '/login', {
              state: { from: returnTo },
            })
          }
        />
      </div>
    </main>
  )
}
