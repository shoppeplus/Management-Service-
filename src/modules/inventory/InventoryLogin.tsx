import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, LoaderCircle, LogIn, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { useI18n } from '../../i18n'
import './inventory-login.css'

type AccountInput = {
  email: string
  password: string
}
type RegistrationInput = AccountInput & {
  companyName: string
  name: string
}

export default function InventoryLogin({
  mode,
  checking,
  busy,
  connectionFailed,
  onLogin,
  onRegister,
  onRetry,
  onModeChange,
}: {
  mode: 'login' | 'register'
  checking: boolean
  busy: boolean
  connectionFailed: boolean
  onLogin: (email: string, password: string) => Promise<boolean>
  onRegister: (input: RegistrationInput) => Promise<boolean>
  onRetry: () => void
  onModeChange: (mode: 'login' | 'register') => void
}) {
  const { t } = useI18n()
  const registering = mode === 'register'
  const [companyName, setCompanyName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [validation, setValidation] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (checking || busy || submitting.current) return
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidation(t('Nhập địa chỉ email hợp lệ.', 'Enter a valid email address.'))
      return
    }
    if (password.length < 10 || password.length > 128 || !password.trim()) {
      setValidation(t('Mật khẩu cần từ 10 đến 128 ký tự.', 'Password must be 10–128 characters.'))
      inputRef.current?.focus()
      return
    }
    if (registering && (companyName.trim().length < 2 || name.trim().length < 2)) {
      setValidation(
        t('Nhập tên doanh nghiệp và họ tên hợp lệ.', 'Enter a valid business and full name.'),
      )
      return
    }
    submitting.current = true
    setValidation('')
    setVisible(false)
    try {
      const succeeded = registering
        ? await onRegister({ companyName: companyName.trim(), name: name.trim(), email, password })
        : await onLogin(email, password)
      if (succeeded) setPassword('')
    } finally {
      submitting.current = false
    }
  }

  return (
    <section className="inv-panel inv-login" aria-labelledby="inventory-login-title">
      <div className="inv-login-intro">
        <div className="inv-login-symbol">
          {registering ? <UserPlus size={28} /> : <ShieldCheck size={28} />}
        </div>
        <span className="inv-login-eyebrow">SMARTSALES SUITE</span>
        <h2 id="inventory-login-title">
          {registering
            ? t('Tạo không gian làm việc', 'Create your workspace')
            : t('Đăng Nhập', 'Sign In')}
        </h2>
        <p>
          {registering
            ? t(
                'Tạo tài khoản quản lý doanh nghiệp. Bạn có thể tạo tài khoản và phân quyền cho nhân viên sau khi đăng nhập.',
                'Create the business owner account. You can add employee accounts and assign roles after signing in.',
              )
            : t(
                'Đăng nhập bằng tài khoản nhân viên do doanh nghiệp tạo. Quyền kho được áp dụng theo vai trò.',
                'Sign in with an employee account created by your business. Inventory access follows the assigned role.',
              )}
        </p>
      </div>
      {checking ? (
        <p className="inv-login-checking" role="status">
          <LoaderCircle size={18} className="spin" />
          {t('Đang kiểm tra phiên đăng nhập…', 'Checking your session…')}
        </p>
      ) : (
        <div className="inv-login-content">
          {connectionFailed && (
            <div className="inv-login-retry">
              <p>
                {t(
                  'Chưa thể kiểm tra phiên. Kiểm tra kết nối máy chủ rồi thử lại.',
                  'Your session could not be checked. Check the server connection and try again.',
                )}
              </p>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={onRetry}
              >
                <RefreshCw size={15} />
                {t('Thử kết nối lại', 'Retry connection')}
              </button>
            </div>
          )}
          <form className="inv-form" noValidate onSubmit={(event) => void submit(event)}>
            {registering && (
              <>
                <label htmlFor="inventory-company-name">
                  {t('Tên doanh nghiệp', 'Business name')}
                </label>
                <input
                  id="inventory-company-name"
                  name="companyName"
                  autoComplete="organization"
                  maxLength={200}
                  required
                  value={companyName}
                  disabled={busy}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
                <label htmlFor="inventory-owner-name">
                  {t('Họ tên chủ tài khoản', 'Account owner name')}
                </label>
                <input
                  id="inventory-owner-name"
                  name="name"
                  autoComplete="name"
                  maxLength={200}
                  required
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            )}
            <label htmlFor="inventory-account-email">{t('Email', 'Email')}</label>
            <input
              id="inventory-account-email"
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="inventory-account-password">{t('Mật khẩu', 'Password')}</label>
            <div className="inv-login-token">
              <input
                ref={inputRef}
                id="inventory-account-password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={registering ? 'new-password' : 'current-password'}
                minLength={10}
                maxLength={128}
                required
                spellCheck={false}
                value={password}
                disabled={busy}
                aria-invalid={!!validation}
                aria-describedby={validation ? 'inventory-account-error' : undefined}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setValidation('')
                }}
              />
              <button
                type="button"
                disabled={busy}
                aria-label={
                  visible ? t('Ẩn mật khẩu', 'Hide password') : t('Hiện mật khẩu', 'Show password')
                }
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {validation && (
              <p id="inventory-account-error" className="inv-error" role="alert">
                {validation}
              </p>
            )}
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : registering ? (
                <UserPlus size={16} />
              ) : (
                <LogIn size={16} />
              )}
              {busy
                ? t('Đang xử lý…', 'Please wait…')
                : registering
                  ? t('Tạo tài khoản doanh nghiệp', 'Create business account')
                  : t('Đăng nhập', 'Sign in')}
            </button>
          </form>
          <p className="inv-note inv-login-session">
            {t(
              'Mật khẩu được bảo vệ trên máy chủ. Phiên đăng nhập tự kết thúc sau 8 giờ.',
              'Passwords are protected on the server. Sessions expire after 8 hours.',
            )}
          </p>
          <button
            type="button"
            className="inv-text-button inv-login-demo"
            disabled={busy}
            onClick={() => {
              setValidation('')
              onModeChange(registering ? 'login' : 'register')
            }}
          >
            {registering
              ? t('Đã có tài khoản? Đăng nhập', 'Already have an account? Sign in')
              : t('Tạo tài khoản doanh nghiệp', 'Create a business account')}
          </button>
        </div>
      )}
    </section>
  )
}
