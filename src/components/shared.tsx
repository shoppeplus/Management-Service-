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

function TikTokIcon({ size }: { size: number }) {
  const path =
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="#25F4EE" transform="translate(-0.8 0.4)" />
      <path d={path} fill="#FE2C55" transform="translate(0.8 -0.4)" />
      <path d={path} fill="#161823" />
    </svg>
  )
}

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
  const icon =
    channel === 'tiktok' ? (
      <TikTokIcon size={size} />
    ) : ['shopee', 'lazada'].includes(channel) ? (
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
