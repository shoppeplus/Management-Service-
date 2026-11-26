import { useState } from 'react'
import { Modal } from '../../components/shared'
import { translateMessage, useI18n } from '../../i18n'
import type { Customer, CustomerInput } from '../../types/inbox'
import { useOperations } from '../operations/context'

export default function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null
  onClose: () => void
  onSaved: (customer: Customer) => void
}) {
  const { t, label, locale } = useI18n()
  const { saveCustomer, busy } = useOperations()
  const [input, setInput] = useState<CustomerInput>(() =>
    customer
      ? {
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          company: customer.company,
          membership: customer.membership,
          location: customer.location,
        }
      : { name: '', phone: '', email: '', company: '', membership: 'Standard', location: '' },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = (key: keyof CustomerInput, value: string) =>
    setInput((old) => ({ ...old, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || busy) return
    const cleaned = {
      ...input,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      company: input.company.trim(),
      location: input.location.trim(),
    }
    if (cleaned.name.length < 2) {
      setError(t('Họ tên cần ít nhất 2 ký tự.', 'Full name must contain at least 2 characters.'))
      return
    }
    if (!cleaned.phone && !cleaned.email) {
      setError(
        t(
          'Nhập ít nhất số điện thoại hoặc email để liên hệ.',
          'Enter a phone number or email address for contact.',
        ),
      )
      return
    }
    if (
      cleaned.phone &&
      (!/^\+?[\d\s().-]{8,24}$/.test(cleaned.phone) || cleaned.phone.replace(/\D/g, '').length < 8)
    ) {
      setError(t('Số điện thoại chưa hợp lệ.', 'Enter a valid phone number.'))
      return
    }
    if (cleaned.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
      setError(t('Email chưa hợp lệ.', 'Enter a valid email address.'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await saveCustomer(customer?.id || null, cleaned)
      onSaved(saved)
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? translateMessage(cause.message, locale)
          : t('Không thể lưu khách hàng.', 'Unable to save customer.'),
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={
        customer ? t('Chỉnh sửa khách hàng', 'Edit customer') : t('Thêm khách hàng', 'Add customer')
      }
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <form className="ops-form" onSubmit={submit}>
        <div className="modal-body">
          <p className="ops-form-hint">
            {t(
              'Hồ sơ liên hệ dùng chung cho Hộp thư, Đơn hàng và Chăm sóc khách hàng.',
              'This contact profile is shared across Inbox, Orders and Customer Care.',
            )}
          </p>
          <div className="ops-field-grid">
            <label className="ops-field">
              {t('Họ và tên', 'Full name')}
              <input
                required
                autoFocus
                autoComplete="name"
                maxLength={100}
                value={input.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </label>
            <label className="ops-field">
              {t('Số điện thoại', 'Phone')}
              <input
                type="tel"
                autoComplete="tel"
                maxLength={24}
                value={input.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </label>
            <label className="ops-field">
              Email
              <input
                type="email"
                autoComplete="email"
                maxLength={160}
                value={input.email}
                onChange={(e) => update('email', e.target.value)}
              />
            </label>
            <label className="ops-field">
              {t('Công ty', 'Company')}
              <input
                autoComplete="organization"
                maxLength={100}
                value={input.company}
                onChange={(e) => update('company', e.target.value)}
              />
            </label>
            <label className="ops-field">
              {t('Hạng thành viên', 'Membership')}
              <select
                value={input.membership}
                onChange={(e) => update('membership', e.target.value)}
              >
                {['Standard', 'Silver', 'Gold', 'Platinum'].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              {t('Địa chỉ', 'Location')}
              <input
                autoComplete="street-address"
                maxLength={200}
                value={input.location}
                onChange={(e) => update('location', e.target.value)}
              />
            </label>
          </div>
          {error && (
            <p className="ops-form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t('Hủy', 'Cancel')}
          </button>
          <button type="submit" className="button button-primary" disabled={saving || busy}>
            {saving ? t('Đang lưu…', 'Saving…') : t('Lưu khách hàng', 'Save customer')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
