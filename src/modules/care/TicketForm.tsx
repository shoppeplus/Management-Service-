import { useState } from 'react'
import { Modal } from '../../components/shared'
import { useI18n } from '../../i18n'
import { useOperations } from '../operations/context'
import { operationLabel } from '../operations/labels'
import { operationsErrorMessage } from '../operations/errors'
import type { CreateTicketInput } from '../operations/types'

export default function TicketForm({
  customerId,
  orderId,
  onClose,
  onCreated,
}: {
  customerId?: string | null
  orderId?: string | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t, locale } = useI18n()
  const { inbox, data, service, busy, run } = useOperations()
  const initialOrder = data.orders.find((order) => order.id === orderId)
  const initialCustomer =
    inbox.customers.find((customer) => customer.id === (initialOrder?.customerId || customerId))
      ?.id || ''
  const [input, setInput] = useState<CreateTicketInput>({
    customerId: initialCustomer,
    orderId: initialOrder?.id || null,
    conversationId: null,
    subject: '',
    description: '',
    category: 'other',
    priority: 'normal',
    assigneeId: null,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = <K extends keyof CreateTicketInput>(key: K, value: CreateTicketInput[K]) =>
    setInput((old) => ({ ...old, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || saving) return
    if (
      !input.customerId ||
      input.subject.trim().length < 3 ||
      input.description.trim().length < 5
    ) {
      setError(
        t(
          'Chọn khách hàng, nhập tiêu đề ít nhất 3 ký tự và mô tả ít nhất 5 ký tự.',
          'Select a customer, enter a subject of at least 3 characters and a description of at least 5 characters.',
        ),
      )
      return
    }
    setSaving(true)
    setError('')
    const before = new Set(data.tickets.map((ticket) => ticket.id))
    try {
      let createdId = ''
      await run(
        async () => {
          const next = await service.createTicket({
            ...input,
            subject: input.subject.trim(),
            description: input.description.trim(),
          })
          createdId = next.tickets.find((ticket) => !before.has(ticket.id))?.id || ''
          return next
        },
        t('Đã tạo yêu cầu hỗ trợ.', 'Support ticket created.'),
      )
      onCreated(createdId)
    } catch (cause) {
      setError(operationsErrorMessage(cause, locale))
    } finally {
      setSaving(false)
    }
  }
  const matchingOrders = data.orders.filter((order) => order.customerId === input.customerId)
  const matchingConversations = inbox.conversations.filter(
    (conversation) => conversation.customerId === input.customerId,
  )
  return (
    <Modal
      title={t('Tạo yêu cầu hỗ trợ', 'Create support ticket')}
      onClose={() => {
        if (!saving) onClose()
      }}
      wide
    >
      <form className="ops-form" onSubmit={submit}>
        <div className="modal-body">
          <div className="ops-field-grid">
            <label className="ops-field">
              {t('Khách hàng', 'Customer')}
              <select
                required
                autoFocus
                value={input.customerId}
                onChange={(e) =>
                  setInput((old) => ({
                    ...old,
                    customerId: e.target.value,
                    orderId: null,
                    conversationId: null,
                  }))
                }
              >
                <option value="">{t('Chọn khách hàng', 'Select customer')}</option>
                {inbox.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customer.phone || customer.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              {t('Đơn hàng liên quan', 'Related order')}
              <select
                value={input.orderId || ''}
                disabled={!input.customerId}
                onChange={(e) => update('orderId', e.target.value || null)}
              >
                <option value="">{t('Không liên kết đơn hàng', 'No related order')}</option>
                {matchingOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              {t('Hội thoại liên quan', 'Related conversation')}
              <select
                value={input.conversationId || ''}
                disabled={!input.customerId}
                onChange={(e) => update('conversationId', e.target.value || null)}
              >
                <option value="">{t('Không liên kết hội thoại', 'No related conversation')}</option>
                {matchingConversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              {t('Phân loại', 'Category')}
              <select
                value={input.category}
                onChange={(e) =>
                  update('category', e.target.value as CreateTicketInput['category'])
                }
              >
                {['delivery', 'return', 'payment', 'product', 'other'].map((value) => (
                  <option key={value} value={value}>
                    {operationLabel(value, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              {t('Mức ưu tiên', 'Priority')}
              <select
                value={input.priority}
                onChange={(e) =>
                  update('priority', e.target.value as CreateTicketInput['priority'])
                }
              >
                {['low', 'normal', 'high', 'urgent'].map((value) => (
                  <option key={value} value={value}>
                    {operationLabel(value, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              {t('Người phụ trách', 'Assignee')}
              <select
                value={input.assigneeId || ''}
                onChange={(e) => update('assigneeId', e.target.value || null)}
              >
                <option value="">{t('Chưa phân công', 'Unassigned')}</option>
                {inbox.agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="ops-field">
            {t('Tiêu đề', 'Subject')}
            <input
              required
              minLength={3}
              maxLength={160}
              value={input.subject}
              onChange={(e) => update('subject', e.target.value)}
              placeholder={t(
                'Ví dụ: Cần kiểm tra tiến độ giao đơn hàng',
                'Example: Check order delivery progress',
              )}
            />
          </label>
          <label className="ops-field">
            {t('Mô tả chi tiết', 'Description')}
            <textarea
              required
              minLength={5}
              maxLength={5000}
              rows={4}
              value={input.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder={t(
                'Vấn đề khách hàng gặp phải và kết quả mong muốn…',
                'Describe the issue and expected outcome…',
              )}
            />
          </label>
          <p className="ops-form-hint">
            {t(
              'SLA được tính từ lúc tạo: Khẩn cấp 2 giờ · Cao 4 giờ · Bình thường 24 giờ · Thấp 48 giờ.',
              'SLA starts at creation: Urgent 2h · High 4h · Normal 24h · Low 48h.',
            )}
          </p>
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
          <button className="button button-primary" type="submit" disabled={busy || saving}>
            {saving ? t('Đang tạo…', 'Creating…') : t('Tạo yêu cầu', 'Create ticket')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
