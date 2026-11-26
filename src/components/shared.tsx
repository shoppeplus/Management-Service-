import {
  Instagram,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  ShoppingBag,
  X,
} from 'lucide-react'
import { useEffect, useRef, useId } from 'react'
import type { ReactNode } from 'react'
import type { Channel, Customer } from '../types/inbox'
import { CHANNELS, initials } from '../lib/inbox'
import { useI18n } from '../i18n'

export function ChannelIcon({
  channel,
  size = 17,
  badge = false,
}: {
  channel: Channel
  size?: number
  badge?: boolean
}) {
  const { label } = useI18n()
  const info = CHANNELS.find((c) => c.id === channel)!
  const icon = ['shopee', 'lazada', 'tiktok'].includes(channel) ? (
    <ShoppingBag size={size} />
  ) : channel === 'zalo' ? (
    <MessageCircle size={size} />
  ) : channel === 'instagram' ? (
    <Instagram size={size} />
  ) : channel === 'email' ? (
    <Mail size={size} />
  ) : channel === 'telegram' ? (
    <Send size={size} />
  ) : channel === 'whatsapp' ? (
    <>
      <MessageCircle size={size} />
      <Phone className="channel-phone" size={size * 0.48} />
    </>
  ) : channel === 'messenger' ? (
    <MessageCircle size={size} fill="currentColor" strokeWidth={1.4} />
  ) : (
    <MessageSquare size={size} />
  )
  return (
    <span
      className={`channel-icon ${badge ? 'channel-badge' : ''} channel-${channel}`}
      style={{ color: info.color }}
      aria-label={label(info.label)}
    >
      {icon}
      {channel === 'messenger' && <span className="messenger-bolt">⌁</span>}
    </span>
  )
}
export function Avatar({
  customer,
  size = 'normal',
  channel,
}: {
  customer: Customer
  size?: 'small' | 'normal' | 'large'
  channel?: Channel
}) {
  return (
    <span className={`avatar avatar-${size}`} style={{ backgroundColor: customer.avatarColor }}>
      {initials(customer.name)}
      {channel && <ChannelIcon channel={channel} size={12} badge />}
    </span>
  )
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  const closeRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab') {
        const list = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        )
        if (!list?.length) return
        const first = list[0],
          last = list[list.length - 1]
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', listener)
    return () => {
      document.removeEventListener('keydown', listener)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('Đóng hộp thoại', 'Close dialog')}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
