import { ArrowUpRight, Sparkles } from 'lucide-react'
import type { Conversation, Customer } from '../types/inbox'
import { useI18n } from '../i18n'
import { Modal } from './shared'

interface Props {
  conversation: Conversation
  customer: Customer
  onUseSuggestion: (text: string) => void
  mode: 'demo' | 'live'
  onClose: () => void
}

export default function AIConversationSummary({
  conversation,
  customer,
  onUseSuggestion,
  mode,
  onClose,
}: Props) {
  const { t } = useI18n()
  const incoming = conversation.messages.filter((message) => message.type === 'incoming')
  const latest =
    incoming.at(-1)?.text ||
    t('Khách hàng chưa gửi nội dung văn bản.', 'The customer has not sent a text message yet.')
  const subject = conversation.subject.toLocaleLowerCase('vi')
  const corpus =
    `${subject} ${incoming.map((message) => message.text).join(' ')}`.toLocaleLowerCase('vi')
  const issue = /giao|vận chuyển|ship|đơn hàng|delivery|shipping|order/.test(corpus)
    ? 'delivery'
    : /đổi|trả|hoàn|return|refund|exchange/.test(corpus)
      ? 'return'
      : 'consult'
  const sentiment = /chậm|lâu|chưa|lo|bực|gấp|delay|late|worried|urgent|upset/.test(
    latest.toLocaleLowerCase('vi'),
  )
    ? t('Cần được trấn an', 'Needs reassurance')
    : /cảm ơn|tuyệt|hài lòng|thank|great|satisfied/.test(latest.toLocaleLowerCase('vi'))
      ? t('Tích cực', 'Positive')
      : t('Trung tính', 'Neutral')
  const firstName = customer.name.split(' ').filter(Boolean).at(-1) || customer.name
  const suggestion =
    issue === 'delivery'
      ? t(
          `Chào ${firstName}, mình đã nhận được thông tin. Bạn gửi giúp mình mã đơn hàng để mình kiểm tra tiến độ với đơn vị vận chuyển và cập nhật thời gian giao dự kiến nhé.`,
          `Hi ${firstName}, thanks for sharing the details. Could you send your order number so I can check with the carrier and update you on the estimated delivery time?`,
        )
      : issue === 'return'
        ? t(
            `Chào ${firstName}, mình sẽ hỗ trợ kiểm tra yêu cầu đổi/trả. Bạn gửi giúp mình mã đơn hàng và hình ảnh sản phẩm để mình xác nhận phương án phù hợp nhé.`,
            `Hi ${firstName}, I can help with your exchange or return request. Please send your order number and product photos so I can confirm the available options.`,
          )
        : t(
            `Chào ${firstName}, cảm ơn bạn đã liên hệ SmartSales. Mình đã xem yêu cầu của bạn và sẽ hỗ trợ chi tiết. Bạn chia sẻ thêm nhu cầu để mình tư vấn phù hợp nhé.`,
            `Hi ${firstName}, thanks for contacting SmartSales. I've reviewed your request and would be happy to help. Could you share a little more about what you need?`,
          )
  const nextStep =
    issue === 'delivery'
      ? t(
          'Xác nhận mã đơn và kiểm tra tiến độ giao hàng.',
          'Confirm the order number and check delivery progress.',
        )
      : issue === 'return'
        ? t(
            'Kiểm tra điều kiện đổi trả và chứng từ đơn hàng.',
            'Check return eligibility and order documentation.',
          )
        : t(
            'Xác nhận nhu cầu và cung cấp thông tin phù hợp.',
            'Confirm the customer’s needs and provide relevant information.',
          )
  return (
    <Modal title={t('Trợ lý AI', 'AI Copilot')} onClose={onClose}>
      <div className="modal-body ai-dialog-body">
        <div className="ai-dialog-mode">
          <Sparkles size={16} />
          <span>
            {mode === 'demo'
              ? t('Demo · phân tích mẫu theo quy tắc', 'Demo · rule-based sample analysis')
              : t('Chưa kết nối dịch vụ AI', 'AI service not connected')}
          </span>
        </div>
        {mode === 'live' ? (
          <p>
            {t(
              'Tính năng AI chưa được cấu hình cho chế độ trực tiếp.',
              'AI has not been configured for Live Mode.',
            )}
          </p>
        ) : (
          <>
            <p className="ai-insight">
              <strong>{t('Tóm tắt', 'Summary')}</strong>
              {customer.name} · {conversation.subject}. {t('Tin nhắn gần nhất', 'Latest message')}:
              “{latest.length > 150 ? `${latest.slice(0, 150)}…` : latest}”
            </p>
            <div className="ai-sentiment">
              <span>
                {t('Cảm xúc', 'Sentiment')} · {sentiment}
              </span>
              <span>
                {t(
                  `${incoming.length} tin nhắn đến`,
                  `${incoming.length} incoming ${incoming.length === 1 ? 'message' : 'messages'}`,
                )}
              </span>
            </div>
            <p className="ai-next-step">
              <strong>{t('Bước tiếp theo', 'Next step')}</strong> {nextStep}
            </p>
            <div className="ai-reply-preview">
              <strong>{t('Câu trả lời gợi ý', 'Suggested reply')}</strong>
              <p>{suggestion}</p>
            </div>
            <button className="ai-use-suggestion" onClick={() => onUseSuggestion(suggestion)}>
              {t('Dùng câu trả lời gợi ý', 'Use suggested reply')} <ArrowUpRight size={14} />
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
