import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  Copy,
  FileText,
  Flag,
  ImagePlus,
  LockKeyhole,
  MoreHorizontal,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Send,
  ShoppingBag,
  Smile,
  Sparkles,
  StickyNote,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  Attachment,
  Conversation,
  ConversationPatch,
  Customer,
  InboxData,
  Message,
  SendMessageInput,
} from '../types/inbox'
import {
  CHANNELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  formatBytes,
  formatDate,
  formatTime,
} from '../lib/inbox'
import { Avatar, ChannelIcon } from './shared'
import AIConversationSummary from './AIConversationSummary'
import ConversationSales from './ConversationSales'
import { draftNamespace, readDraft, saveDraft } from '../lib/drafts'
import { useI18n } from '../i18n'

interface WorkspaceProps {
  data: InboxData
  conversation: Conversation
  customer: Customer
  detailsOpen: boolean
  busy: boolean
  mode: 'demo' | 'live'
  canManage: boolean
  canMessage: boolean
  canCreateOrder: boolean
  canCreateQuote: boolean
  onToggleDetails: () => void
  onBack: () => void
  onUpdate: (patch: ConversationPatch) => Promise<void>
  onSend: (input: SendMessageInput) => Promise<void>
  onCreateQuote: () => void
  onNotify: (message: string, kind?: 'success' | 'error') => void
}
export function ConversationWorkspace(props: WorkspaceProps) {
  const { t } = useI18n()
  const [suggestion, setSuggestion] = useState('')
  const [tool, setTool] = useState<{ name: 'ai' | 'sales'; conversationId: string } | null>(null)
  const conversation = props.conversation
  const activeTool = tool?.conversationId === conversation.id ? tool.name : null
  return (
    <main
      className="conversation-workspace"
      aria-label={t('Không gian hội thoại', 'Conversation workspace')}
    >
      <ConversationHeader {...props} />
      <div className="conversation-context">
        <span>
          <span className={`status-dot status-${conversation.status}`} />
          {conversation.subject}
        </span>
        <span className="conversation-reference">#{conversation.id.replace('conv-', 'SS-')}</span>
      </div>
      <MessageList conversation={conversation} customer={props.customer} />
      <div className="workspace-bottom">
        {(props.canManage || props.canMessage || props.canCreateOrder || props.canCreateQuote) && (
          <MessageComposer
            key={conversation.id}
            conversation={conversation}
            mode={props.mode}
            busy={props.busy}
            suggestion={suggestion}
            onSuggestionUsed={() => setSuggestion('')}
            onSend={props.onSend}
            onNotify={props.onNotify}
            onOpenAI={() => setTool({ name: 'ai', conversationId: conversation.id })}
            onOpenSales={() => setTool({ name: 'sales', conversationId: conversation.id })}
            onCreateQuote={props.onCreateQuote}
            canManage={props.canManage}
            canMessage={props.canMessage}
            canCreateOrder={props.canCreateOrder}
            canCreateQuote={props.canCreateQuote}
          />
        )}
      </div>
      {activeTool === 'ai' && (
        <AIConversationSummary
          conversation={conversation}
          customer={props.customer}
          mode={props.mode}
          onClose={() => setTool(null)}
          onUseSuggestion={(text) => {
            setTool(null)
            setSuggestion(text)
          }}
        />
      )}
      {activeTool === 'sales' && (
        <ConversationSales
          conversation={conversation}
          customer={props.customer}
          onNotify={props.onNotify}
          onClose={() => setTool(null)}
        />
      )}
    </main>
  )
}
export function ConversationHeader({
  data,
  conversation: c,
  customer,
  detailsOpen,
  onToggleDetails,
  onBack,
  onUpdate,
  onNotify,
  busy,
  canManage,
}: WorkspaceProps) {
  const { t, label } = useI18n()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [menu])
  const update = async (patch: ConversationPatch) => {
    try {
      await onUpdate(patch)
    } catch {
      /* Parent displays the error. */
    }
  }
  return (
    <>
      <header className="conversation-header">
        <button
          className="icon-button mobile-back"
          onClick={onBack}
          aria-label={t('Quay lại danh sách hội thoại', 'Back to conversations')}
        >
          <ArrowLeft size={20} />
        </button>
        <Avatar customer={customer} size="small" />
        <div className="contact-heading">
          <h2>
            <span className="contact-name">{customer.name}</span>
            <span className="contact-verified">
              <Check size={9} strokeWidth={3} />
            </span>
          </h2>
          <span>
            <ChannelIcon channel={c.channel} size={12} />
            {label(CHANNELS.find((item) => item.id === c.channel)?.label || '')}
            <span className="contact-dot">·</span>
            <span className="contact-online">{t('Khách hàng', 'Customer')}</span>
          </span>
        </div>
        <div className="header-actions">
          {canManage && (
            <button
              className={`icon-button priority-button ${c.priority === 'high' || c.priority === 'urgent' ? 'is-priority' : ''}`}
              aria-label={t('Bật hoặc tắt ưu tiên cao', 'Toggle high priority')}
              title={t('Bật hoặc tắt ưu tiên cao', 'Toggle high priority')}
              disabled={busy}
              onClick={() =>
                void update({
                  priority: c.priority === 'high' || c.priority === 'urgent' ? 'normal' : 'high',
                })
              }
            >
              <Flag size={17} />
            </button>
          )}
          <button
            className="icon-button"
            title={
              detailsOpen
                ? t('Ẩn thông tin khách hàng', 'Hide customer details')
                : t('Hiện thông tin khách hàng', 'Show customer details')
            }
            aria-label={
              detailsOpen
                ? t('Ẩn thông tin khách hàng', 'Hide customer details')
                : t('Hiện thông tin khách hàng', 'Show customer details')
            }
            onClick={onToggleDetails}
          >
            {detailsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
          {canManage && <div className="dropdown-anchor" ref={menuRef}>
            <button
              className="icon-button"
              aria-label={t('Thao tác hội thoại khác', 'More conversation actions')}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <div className="dropdown-menu">
                <button
                  onClick={() => {
                    void update({ unread: 1 })
                    setMenu(false)
                  }}
                >
                  <StickyNote size={14} /> {t('Đánh dấu chưa đọc', 'Mark as unread')}
                </button>
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${window.location.origin}/inbox?conversation=${c.id}`)
                      .then(
                        () =>
                          onNotify(
                            t('Đã sao chép liên kết hội thoại.', 'Conversation link copied.'),
                          ),
                        () =>
                          onNotify(
                            t(
                              'Không thể sao chép. Trình duyệt chưa cấp quyền clipboard.',
                              'Unable to copy. Clipboard permission is unavailable.',
                            ),
                            'error',
                          ),
                      )
                    setMenu(false)
                  }}
                >
                  <Copy size={14} /> {t('Sao chép liên kết hội thoại', 'Copy conversation link')}
                </button>
                <button
                  onClick={() => {
                    void update({ status: c.status === 'closed' ? 'open' : 'closed' })
                    setMenu(false)
                  }}
                >
                  <LockKeyhole size={14} />
                  {c.status === 'closed'
                    ? t('Mở lại hội thoại', 'Reopen conversation')
                    : t('Đóng hội thoại', 'Close conversation')}
                </button>
              </div>
            )}
          </div>}
        </div>
      </header>
      {canManage && (
        <div className="conversation-toolbar">
          <div className="toolbar-assignment">
            <Users size={14} />
            <select
              disabled={busy}
              aria-label={t('Phân công hội thoại', 'Assign conversation')}
              value={c.assigneeId || ''}
              onChange={(e) => void update({ assigneeId: e.target.value || null })}
            >
              <option value="">{t('Chưa phân công', 'Unassigned')}</option>
              {data.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <ChevronDown size={12} />
            <span className="toolbar-divider" />
            <select
              disabled={busy}
              aria-label={t('Phân công nhóm', 'Assign team')}
              value={c.teamId || ''}
              onChange={(e) => void update({ teamId: e.target.value || null })}
            >
              <option value="">{t('Chưa có nhóm', 'No team')}</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <label className={`status-control status-${c.status}`}>
            <CircleCheck size={14} />
            <select
              disabled={busy}
              aria-label={t('Đổi trạng thái hội thoại', 'Change conversation status')}
              value={c.status}
              onChange={(e) => void update({ status: e.target.value as Conversation['status'] })}
            >
              {Object.entries(STATUS_LABELS).map(([value, statusLabel]) => (
                <option key={value} value={value}>
                  {label(statusLabel)}
                </option>
              ))}
            </select>
            <ChevronDown size={11} />
          </label>
        </div>
      )}
    </>
  )
}
export function MessageList({
  conversation,
  customer,
}: {
  conversation: Conversation
  customer: Customer
}) {
  const { locale, t, label } = useI18n()
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' })
  }, [conversation.id, conversation.messages.length])
  return (
    <div
      className="message-list"
      aria-label={t('Lịch sử tin nhắn', 'Message history')}
      role="log"
      aria-live="polite"
    >
      <div className="conversation-start">
        <span>
          <LockKeyhole size={11} />{' '}
          {t('Đây là phần đầu của hội thoại', 'You’re at the beginning of this conversation')}
        </span>
      </div>
      {conversation.messages.map((message, index) => (
        <div key={message.id}>
          {(index === 0 ||
            new Date(message.sentAt).toDateString() !==
              new Date(conversation.messages[index - 1].sentAt).toDateString()) && (
            <div className="date-divider">
              <span>
                {new Date(message.sentAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
          <MessageBubble message={message} customer={customer} />
        </div>
      ))}
      <div className="conversation-bottom-note">
        <span className={`priority-dot priority-${conversation.priority}`} />
        {t(
          `Ưu tiên ${label(PRIORITY_LABELS[conversation.priority]).toLocaleLowerCase('vi')}`,
          `${PRIORITY_LABELS[conversation.priority]} priority`,
        )}
        <span>·</span>
        {t('Hoạt động gần nhất', 'Last activity')} {formatDate(conversation.lastMessageAt, locale)},{' '}
        {formatTime(conversation.lastMessageAt, locale)}
      </div>
      <div ref={endRef} />
    </div>
  )
}
export function MessageBubble({ message, customer }: { message: Message; customer: Customer }) {
  const { locale, t } = useI18n()
  return (
    <article className={`message-row message-${message.type}`}>
      {message.type === 'incoming' && <Avatar customer={customer} size="small" />}
      <div className="message-content">
        {message.type === 'note' && (
          <span className="note-label">
            <LockKeyhole size={11} /> {t('Ghi chú nội bộ', 'Internal note')} ·{' '}
            {message.authorName || 'Linh Nguyễn'}
          </span>
        )}
        {message.type === 'incoming' && <span className="message-author">{customer.name}</span>}
        <div className="message-bubble">
          {message.text && <p>{message.text}</p>}
          {message.attachments?.map((a) => (
            <AttachmentPreview key={a.id} attachment={a} />
          ))}
        </div>
        <span className="message-time">
          <time dateTime={message.sentAt}>{formatTime(message.sentAt, locale)}</time>
          {message.type === 'outgoing' && (
            <span
              title={
                message.delivery === 'read'
                  ? t('Đã xem', 'read')
                  : message.delivery === 'delivered'
                    ? t('Đã nhận', 'delivered')
                    : t('Đã gửi', 'sent')
              }
            >
              {message.delivery === 'read' ? (
                <CheckCheck size={13} className="read-receipt" />
              ) : message.delivery === 'delivered' ? (
                <CheckCheck size={13} />
              ) : (
                <Check size={13} />
              )}
            </span>
          )}
        </span>
      </div>
      {message.type === 'outgoing' && <span className="message-agent-avatar">LN</span>}
    </article>
  )
}
function AttachmentPreview({ attachment: a }: { attachment: Attachment }) {
  const { t } = useI18n()
  const image = a.type.startsWith('image/') && a.url
  return (
    <div className={`attachment-preview ${image ? 'image-attachment' : ''}`}>
      {image && (
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer"
          aria-label={t(`Xem ${a.name}`, `View ${a.name}`)}
        >
          <img src={a.url} alt={a.name} loading="lazy" />
        </a>
      )}
      <div className="attachment-file">
        <FileText size={17} />
        <span>
          <strong>{a.name}</strong>
          <small>
            {formatBytes(a.size)}
            {!a.url ? t(' · Chỉ có thông tin tệp', ' · File metadata only') : ''}
          </small>
        </span>
        {a.url && (
          <a
            href={a.url}
            download={a.name}
            target="_blank"
            rel="noreferrer"
            aria-label={t(`Tải xuống ${a.name}`, `Download ${a.name}`)}
          >
            <ArrowUpRight size={16} />
          </a>
        )}
      </div>
    </div>
  )
}
const quickReplies = [
  {
    title: 'Chào mừng khách hàng',
    text: 'Chào anh/chị! Em là Linh từ SmartSales. Em có thể hỗ trợ mình điều gì hôm nay ạ?',
    englishTitle: 'Welcome a customer',
    englishText: 'Hello! I’m Linh from SmartSales. How can I help you today?',
  },
  {
    title: 'Kiểm tra đơn hàng',
    text: 'Dạ, anh/chị cho em xin mã đơn hàng hoặc số điện thoại đặt hàng để em kiểm tra và hỗ trợ mình ngay nhé.',
    englishTitle: 'Check an order',
    englishText:
      'Could you share your order number or the phone number used to place the order? I’ll check it for you right away.',
  },
  {
    title: 'Xác nhận tiếp nhận',
    text: 'Em đã tiếp nhận thông tin. Em sẽ phối hợp với bộ phận phụ trách và cập nhật lại cho anh/chị sớm nhất ạ.',
    englishTitle: 'Acknowledge a request',
    englishText:
      'I’ve received your request. I’ll coordinate with the relevant team and update you as soon as possible.',
  },
  {
    title: 'Cảm ơn khách hàng',
    text: 'Cảm ơn anh/chị đã tin tưởng SmartSales! Nếu cần hỗ trợ thêm, anh/chị cứ nhắn em nhé. Chúc mình một ngày tốt lành ạ.',
    englishTitle: 'Thank a customer',
    englishText:
      'Thank you for choosing SmartSales! Please message us if you need any further help. Have a wonderful day!',
  },
]
export function MessageComposer({
  conversation,
  mode,
  busy,
  suggestion,
  onSuggestionUsed,
  onSend,
  onNotify,
  onOpenAI,
  onOpenSales,
  onCreateQuote,
  canManage,
  canMessage,
  canCreateOrder,
  canCreateQuote,
}: {
  conversation: Conversation
  mode: 'demo' | 'live'
  busy: boolean
  suggestion: string
  onSuggestionUsed: () => void
  onSend: (input: SendMessageInput) => Promise<void>
  onNotify: (message: string, kind?: 'success' | 'error') => void
  onOpenAI: () => void
  onOpenSales: () => void
  onCreateQuote: () => void
  canManage: boolean
  canMessage: boolean
  canCreateOrder: boolean
  canCreateQuote: boolean
}) {
  const { t, label } = useI18n()
  const draftKey = `${draftNamespace(mode, import.meta.env.VITE_API_BASE_URL)}${conversation.id}`
  const [type, setType] = useState<'outgoing' | 'note'>(canMessage ? 'outgoing' : 'note')
  const [replyText, setReplyText] = useState(() => readDraft(`${draftKey}:outgoing`))
  const [noteText, setNoteText] = useState(() => readDraft(`${draftKey}:note`))
  const text = type === 'outgoing' ? replyText : noteText
  const setText = type === 'outgoing' ? setReplyText : setNoteText
  const canEdit = type === 'outgoing' ? canMessage : canManage
  const canCompose = canMessage || canManage
  const [replyAttachments, setReplyAttachments] = useState<Attachment[]>([])
  const [noteAttachments, setNoteAttachments] = useState<Attachment[]>([])
  const attachments = type === 'outgoing' ? replyAttachments : noteAttachments
  const setAttachments = type === 'outgoing' ? setReplyAttachments : setNoteAttachments
  const [quick, setQuick] = useState(false)
  const [readingFiles, setReadingFiles] = useState(false)
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (suggestion) {
      setReplyText(suggestion)
      setType('outgoing')
      onSuggestionUsed()
      textarea.current?.focus()
    }
  }, [suggestion, onSuggestionUsed])
  useEffect(() => {
    saveDraft(`${draftKey}:outgoing`, replyText)
    saveDraft(`${draftKey}:note`, noteText)
  }, [replyText, noteText, draftKey])
  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return
    if (attachments.length + files.length > 4) {
      onNotify(t('Tối đa 4 tệp trong một tin nhắn.', 'Attach up to 4 files per message.'), 'error')
      return
    }
    const supported = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
    ]
    if (Array.from(files).some((f) => f.size > 1024 * 1024 || !supported.includes(f.type))) {
      onNotify(
        t(
          'Chọn ảnh, PDF hoặc TXT; mỗi tệp tối đa 1 MB.',
          'Choose images, PDFs or TXT files, up to 1 MB each.',
        ),
        'error',
      )
      return
    }
    setReadingFiles(true)
    try {
      const loaded = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<Attachment>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  url: String(reader.result),
                })
              reader.onerror = () =>
                reject(
                  new Error(t('Không thể đọc tệp đính kèm.', 'Unable to read the attachment.')),
                )
              reader.readAsDataURL(file)
            }),
        ),
      )
      setAttachments((previous) => [...previous, ...loaded])
    } catch {
      onNotify(t('Không thể đọc tệp đính kèm.', 'Unable to read the attachment.'), 'error')
    } finally {
      setReadingFiles(false)
      if (input.current) input.current.value = ''
    }
  }
  const send = async () => {
    if (
      sending ||
      busy ||
      readingFiles ||
      (!text.trim() && !attachments.length) ||
      (conversation.status === 'closed' && type === 'outgoing') ||
      (type === 'outgoing' && !canMessage) ||
      (type === 'note' && !canManage)
    )
      return
    setSending(true)
    try {
      await onSend({ text: text.trim(), type, attachments })
      setText('')
      setAttachments([])
      textarea.current?.focus()
    } catch {
      /* Parent retains draft and displays the error. */
    } finally {
      setSending(false)
    }
  }
  const disabled =
    busy ||
    sending ||
    readingFiles ||
    (conversation.status === 'closed' && type === 'outgoing') ||
    (type === 'outgoing' && !canMessage) ||
    (type === 'note' && !canManage)
  return (
    <div className={`composer ${type === 'note' ? 'composer-note' : ''}`}>
      {canCompose && <div className="composer-tabs">
        {canMessage && (
          <button
            className={type === 'outgoing' ? 'active' : ''}
            onClick={() => setType('outgoing')}
          >
            <Send size={13} /> {t('Trả lời', 'Reply')}
          </button>
        )}
        {canManage && (
          <button className={type === 'note' ? 'active' : ''} onClick={() => setType('note')}>
            <StickyNote size={13} /> {t('Ghi chú', 'Note')}
          </button>
        )}
        <span className="composer-channel">
          {type === 'note' ? (
            <>
              <LockKeyhole size={11} /> {t('Chỉ nội bộ nhóm xem được', 'Only visible to your team')}
            </>
          ) : (
            <>
              <ChannelIcon channel={conversation.channel} size={12} /> {t('qua', 'via')}{' '}
              {label(CHANNELS.find((c) => c.id === conversation.channel)?.label || '')}
            </>
          )}
        </span>
      </div>}
      {canCompose && <textarea
        ref={textarea}
        aria-label={
          type === 'note'
            ? t('Ghi chú nội bộ', 'Internal note')
            : t('Tin nhắn trả lời', 'Reply message')
        }
        placeholder={
          conversation.status === 'closed' && type === 'outgoing'
            ? t('Mở lại hội thoại để trả lời…', 'Reopen this conversation to reply…')
            : type === 'note'
              ? t('Thêm ghi chú cho nhóm của bạn…', 'Add a note for your team…')
              : t('Nhập nội dung trả lời…', 'Write a thoughtful reply…')
        }
        value={text}
        disabled={disabled}
        maxLength={10000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void send()
          }
        }}
      />}
      {canCompose && attachments.length > 0 && (
        <div className="pending-attachments">
          {attachments.map((a) => (
            <span key={a.id}>
              <Paperclip size={12} />
              {a.name}
              {canEdit && (
                <button
                  aria-label={t(`Xóa ${a.name}`, `Remove ${a.name}`)}
                  className="icon-button"
                  onClick={() => setAttachments((items) => items.filter((i) => i.id !== a.id))}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="composer-actions">
        <div className="composer-tools">
          {canEdit && (
            <>
              <input
                ref={input}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
                className="visually-hidden"
                aria-label={t('Đính kèm tệp', 'Attach files')}
                onChange={(e) => void attachFiles(e.target.files)}
              />
              <button
                className="icon-button"
                title={t('Đính kèm tệp · tối đa 1 MB', 'Attach file · 1 MB max')}
                aria-label={t('Đính kèm một tệp', 'Attach a file')}
                disabled={disabled}
                onClick={() => {
                  if (input.current) {
                    input.current.accept =
                      'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain'
                    input.current.click()
                  }
                }}
              >
                <Paperclip size={17} />
              </button>
            </>
          )}
          {canMessage && (
            <>
              <button
                className="icon-button"
                title={t('Đính kèm ảnh', 'Attach image')}
                aria-label={t('Đính kèm một ảnh', 'Attach an image')}
                disabled={disabled}
                onClick={() => {
                  if (input.current) {
                    input.current.accept = 'image/png,image/jpeg,image/webp,image/gif'
                    input.current.click()
                  }
                }}
              >
                <ImagePlus size={17} />
              </button>
              <button
                className="icon-button"
                title={t('Chèn biểu tượng cười', 'Insert smile')}
                aria-label={t('Chèn biểu tượng cảm xúc cười', 'Insert smile emoji')}
                disabled={disabled}
                onClick={() => {
                  setText((value) => `${value} 😊`)
                  textarea.current?.focus()
                }}
              >
                <Smile size={17} />
              </button>
              <span className="tool-separator" />
              <div className="quick-reply-anchor">
                <button
                  className={`icon-button ${quick ? 'selected' : ''}`}
                  aria-label={t('Mẫu trả lời nhanh', 'Quick replies')}
                  title={t('Mẫu trả lời nhanh', 'Quick replies')}
                  aria-expanded={quick}
                  disabled={disabled}
                  onClick={() => setQuick(!quick)}
                >
                  <FileText size={17} />
                </button>
                {quick && (
                  <div className="quick-replies">
                    <div>
                      <strong>{t('Mẫu trả lời nhanh', 'Quick replies')}</strong>
                      <button
                        className="icon-button"
                        onClick={() => setQuick(false)}
                        aria-label={t('Đóng mẫu trả lời nhanh', 'Close quick replies')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {quickReplies.map((reply) => (
                      <button
                        key={reply.title}
                        onClick={() => {
                          setText(t(reply.text, reply.englishText))
                          setQuick(false)
                          textarea.current?.focus()
                        }}
                      >
                        <strong>{t(reply.title, reply.englishTitle)}</strong>
                        <span>{t(reply.text, reply.englishText)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="icon-button composer-ai-action"
                aria-label={t('Trợ lý AI', 'AI Copilot')}
                title={t('Trợ lý AI', 'AI Copilot')}
                aria-haspopup="dialog"
                onClick={() => {
                  setQuick(false)
                  onOpenAI()
                }}
              >
                <Sparkles size={17} />
              </button>
            </>
          )}
          {canCreateOrder && (
            <button
              className="icon-button"
              aria-label={t('Tạo đơn nhanh', 'Quick order')}
              title={t('Tạo đơn nhanh', 'Quick order')}
              aria-haspopup="dialog"
              onClick={() => {
                setQuick(false)
                onOpenSales()
              }}
            >
              <ShoppingBag size={17} />
            </button>
          )}
          {canCreateQuote && (
            <button
              className="icon-button"
              aria-label={t('Tạo báo giá PDF', 'Create PDF quotation')}
              title={t('Tạo báo giá PDF', 'Create PDF quotation')}
              aria-haspopup="dialog"
              onClick={() => {
                setQuick(false)
                onCreateQuote()
              }}
            >
              <FileText size={17} />
            </button>
          )}
        </div>
        {canCompose && (
          <button
            className="send-button"
            disabled={disabled || (!text.trim() && !attachments.length)}
            onClick={() => void send()}
          >
            {sending
              ? t('Đang gửi…', 'Sending…')
              : readingFiles
                ? t('Đang đọc…', 'Reading…')
                : type === 'note'
                  ? t('Thêm ghi chú', 'Add note')
                  : t('Gửi', 'Send')}
            <Send size={14} />
          </button>
        )}
      </div>
      {canCompose && <div className="composer-footer">
        <span>
          {mode === 'demo'
            ? t(
                'Chế độ Demo · Tin nhắn chỉ lưu trên trình duyệt',
                'Demo mode · Messages stay in this browser',
              )
            : t('Chế độ trực tiếp · Kết nối qua API', 'Live mode · API adapter')}
        </span>
        <span>
          <kbd>Ctrl</kbd> + <kbd>↵</kbd> {t('để gửi', 'to send')}
        </span>
      </div>}
    </div>
  )
}
