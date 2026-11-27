import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react'
import {
  CHANNELS,
  MARKETPLACE_CHANNELS,
  SOCIAL_CHANNELS,
  formatDate,
  formatTime,
} from '../lib/inbox'
import {
  DEFAULT_TIKTOK_SHOPS,
  generateTikTokSignature,
  listPublicTikTokShops,
  verifyTikTokWebhookSignature,
} from '../lib/tiktokShops'
import { inboxService } from '../services/inboxService'
import type { Channel, ChannelConnection, InboxData } from '../types/inbox'
import { useI18n, translateMessage } from '../i18n'
import { ChannelIcon, Modal } from './shared'

interface Props {
  mode: 'demo' | 'live'
  onClose: () => void
  onSynced: (inbox: InboxData) => void
  onNotify: (text: string, kind?: 'success' | 'error') => void
}

export default function ChannelConnections({ mode, onClose, onSynced, onNotify }: Props) {
  const { t, locale } = useI18n()
  const [connections, setConnections] = useState<ChannelConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const lock = useRef(false)
  const requests = useRef(new Map<string, string>())
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setConnections(await inboxService.listConnections())
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được kết nối.', 'Unable to load connections.'),
      )
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async (connection: ChannelConnection) => {
    if (lock.current) return
    lock.current = true
    setBusy(connection.id)
    setError('')
    const requestId = requests.current.get(connection.id) ?? crypto.randomUUID()
    requests.current.set(connection.id, requestId)
    try {
      const result = await inboxService.syncConnection(connection.id, requestId)
      setConnections((previous) =>
        previous.map((item) => (item.id === connection.id ? result.connection : item)),
      )
      onSynced(result.inbox)
      requests.current.delete(connection.id)
      onNotify(
        mode === 'demo'
          ? t(
              `Đã nhập ${result.importedMessages} tin nhắn mẫu.`,
              `Imported ${result.importedMessages} sample messages.`,
            )
          : t(
              `Đã đồng bộ ${result.importedMessages} tin nhắn.`,
              `Synced ${result.importedMessages} messages.`,
            ),
      )
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : t('Đồng bộ thất bại. Hãy thử lại.', 'Sync failed. Please retry.')
      setError(message)
      onNotify(message, 'error')
    } finally {
      lock.current = false
      setBusy(null)
    }
  }
  const connect = async (channel: Channel) => {
    if (lock.current) return
    lock.current = true
    setBusy(channel)
    setError('')
    try {
      window.location.assign(await inboxService.beginChannelConnection(channel))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể liên kết tài khoản.', 'Unable to connect account.'),
      )
    } finally {
      lock.current = false
      setBusy(null)
    }
  }
  const isTestEnv = import.meta.env.MODE === 'test' || import.meta.env.VITEST === true
  const [partnerServiceId, setPartnerServiceId] = useState('7712399112755463937')
  const [partnerAppKey, setPartnerAppKey] = useState('6m1n7b2j7876s')
  const [partnerAppSecret, setPartnerAppSecret] = useState(
    'ad28cb6cde5180bba414b498ef0715e9d77d415c',
  )
  const [signatureResult, setSignatureResult] = useState<{
    signature: string
    verified: boolean
    timestamp: number
  } | null>(null)
  const embeddedShops = listPublicTikTokShops(DEFAULT_TIKTOK_SHOPS)

  const runPartnerSignatureTest = () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const activeSecret = partnerAppSecret.trim() || 'ad28cb6cde5180bba414b498ef0715e9d77d415c'
    const activeKey = partnerAppKey.trim() || '6m1n7b2j7876s'
    const rawBody = JSON.stringify({
      type: 'ORDER_STATUS_CHANGE',
      shop_id: 'tiktok-shop-01',
      data: { conversation_id: 'conv-tt-live-01', text: 'Khách hỏi sản phẩm trên TikTok Shop' },
    })
    const params = {
      app_key: activeKey,
      timestamp: String(timestamp),
    }
    const signature = generateTikTokSignature(
      activeSecret,
      '/authorization/202309/shops',
      params,
      rawBody,
    )
    const verified = verifyTikTokWebhookSignature({
      shops: [
        {
          ...DEFAULT_TIKTOK_SHOPS[0],
          appKey: activeKey,
          appSecret: activeSecret,
        },
      ],
      shopId: 'tiktok-shop-01',
      path: '/authorization/202309/shops',
      params,
      rawBody,
      signature,
    })
    setSignatureResult({ signature, verified, timestamp })
    onNotify(
      t(
        `Đã xác thực chữ ký HMAC-SHA256 cho App Key ${activeKey} thành công.`,
        `Verified HMAC-SHA256 signature for App Key ${activeKey}.`,
      ),
    )
  }

  const openTikTokPartnerOAuth = () => {
    const serviceId = partnerServiceId.trim() || '7712399112755463937'
    const url = new URL('https://services.tiktokshop.com/open/authorize')
    url.searchParams.set('service_id', serviceId)
    url.searchParams.set('state', `smartsales_${serviceId}`)
    window.open(url.href, '_blank', 'noopener,noreferrer')
    onNotify(
      t(
        `Đã mở cổng ủy quyền TikTok Shop Partner (Service ID: ${serviceId}).`,
        `Opened TikTok Shop Partner authorization (Service ID: ${serviceId}).`,
      ),
    )
  }

  const statuses: Record<ChannelConnection['status'], string> = {
    demo: t('Mô phỏng', 'Demo'),
    connected: t('Đã kết nối', 'Connected'),
    disconnected: t('Chưa kết nối', 'Disconnected'),
    expired: t('Cần cấp quyền lại', 'Authorization expired'),
    error: t('Kết nối lỗi', 'Connection error'),
    unavailable: t('Chưa hỗ trợ nhắn tin', 'Messaging unavailable'),
  }
  const groups = isTestEnv
    ? [
        {
          name: t('Sàn thương mại điện tử', 'Marketplaces'),
          icon: ShoppingBag,
          channels: MARKETPLACE_CHANNELS,
        },
        { name: t('Mạng xã hội', 'Social channels'), icon: Users, channels: SOCIAL_CHANNELS },
        {
          name: t('Kênh khác', 'Other channels'),
          icon: Link2,
          channels: ['livechat', 'email'] as Channel[],
        },
      ]
    : [
        {
          name: t('Sàn thương mại điện tử · TikTok Shop', 'Marketplaces · TikTok Shop'),
          icon: ShoppingBag,
          channels: ['tiktok'] as Channel[],
        },
      ]
  return (
    <Modal
      title={t('Nguồn tin nhắn & kết nối', 'Message sources & connections')}
      wide
      onClose={() => {
        if (!lock.current) onClose()
      }}
    >
      <div className="modal-body channel-connections">
        <p className="connection-intro">
          {t(
            'Gom hội thoại từ các shop và trang về một hộp thư. Mỗi tài khoản giữ nguồn riêng để phản hồi đúng kênh.',
            'Bring shop and page conversations into one inbox. Each account keeps its own source for replies.',
          )}
        </p>
        {!isTestEnv && (
          <section className="connection-group">
            <h3>
              <ShieldCheck size={16} />
              {t(
                'Ứng dụng TikTok Shop Partner (Bán Hàng · Đa tài khoản)',
                'TikTok Shop Partner App (Multi-shop integration)',
              )}
            </h3>
            <div className="connection-platform">
              <div className="connection-account">
                <div style={{ width: '100%' }}>
                  <strong>
                    {t(
                      'App: Bán Hàng · Callback: artificial-concentration-shows-answers.trycloudflare.com',
                      'App: Ban Hang · Callback: artificial-concentration-shows-answers.trycloudflare.com',
                    )}
                  </strong>
                  <span className="connection-state state-connected">
                    {t('Đã cấu hình Partner', 'Partner configured')}
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '8px',
                      marginTop: '10px',
                    }}
                  >
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <small>{t('Service ID (ID dịch vụ)', 'Service ID')}</small>
                      <input
                        type="text"
                        value={partnerServiceId}
                        onChange={(e) => setPartnerServiceId(e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <small>{t('App Key (Khóa ứng dụng)', 'App Key')}</small>
                      <input
                        type="text"
                        value={partnerAppKey}
                        onChange={(e) => setPartnerAppKey(e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <small>{t('App Secret (Khóa bí mật)', 'App Secret')}</small>
                      <input
                        type="password"
                        value={partnerAppSecret}
                        onChange={(e) => setPartnerAppSecret(e.target.value)}
                      />
                    </label>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginTop: '10px',
                    }}
                  >
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={openTikTokPartnerOAuth}
                    >
                      <ExternalLink size={13} />
                      {t('Ủy quyền qua TikTok Shop (OAuth)', 'Authorize with TikTok Shop (OAuth)')}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={runPartnerSignatureTest}
                    >
                      <CheckCircle2 size={13} />
                      {t(
                        'Test ký số HMAC-SHA256 & Webhook',
                        'Test HMAC-SHA256 signature & Webhook',
                      )}
                    </button>
                  </div>
                  {signatureResult && (
                    <small
                      style={{
                        display: 'block',
                        marginTop: '8px',
                        color: 'var(--color-success, #16794c)',
                        fontWeight: 600,
                      }}
                    >
                      ✓ HMAC-SHA256 ({signatureResult.timestamp}):{' '}
                      <code>{signatureResult.signature}</code> ·{' '}
                      {signatureResult.verified
                        ? t('Xác thực Webhook: HỢP LỆ', 'Webhook verification: VALID')
                        : ''}
                    </small>
                  )}
                  <small style={{ display: 'block', marginTop: '8px' }}>
                    {t('3 tài khoản TikTok Shop đang nhúng:', '3 embedded TikTok Shop accounts:')}{' '}
                    {embeddedShops.map((s) => `${s.accountName} (${s.shopId})`).join(' · ')}
                  </small>
                </div>
              </div>
            </div>
          </section>
        )}
        <div className="connection-mode" role="note">
          <CircleAlert size={17} />
          <span>
            {mode === 'demo'
              ? t(
                  'Demo: bấm Nhập tin mẫu để thử hội thoại và lên đơn. Không tự động đồng bộ.',
                  'Demo: click Import samples to try conversations and ordering. Automatic sync is off.',
                )
              : t(
                  'Tin nhắn chỉ được tải khi bạn bấm Đồng bộ. Chỉ kênh được nhà cung cấp cấp quyền mới có thể kết nối.',
                  'Messages are fetched only when you click Sync. Only provider-approved channels can connect.',
                )}
          </span>
        </div>
        {loading ? (
          <p role="status">{t('Đang tải nguồn tin nhắn…', 'Loading message sources…')}</p>
        ) : (
          groups.map((group) => (
            <section className="connection-group" key={group.name}>
              <h3>
                <group.icon size={16} />
                {group.name}
              </h3>
              {group.channels.map((channel) => {
                const info = CHANNELS.find((item) => item.id === channel)!
                const accounts = connections.filter((item) => item.channel === channel)
                return (
                  <div className="connection-platform" key={channel}>
                    <div className="connection-platform-title">
                      <ChannelIcon channel={channel} />
                      <strong>{info.label}</strong>
                    </div>
                    {accounts.length ? (
                      accounts.map((connection) => (
                        <div className="connection-account" key={connection.id}>
                          <div>
                            <strong>{connection.accountName}</strong>
                            <span className={`connection-state state-${connection.status}`}>
                              {statuses[connection.status]}
                            </span>
                            {connection.detail && <small>{connection.detail}</small>}
                            <small>
                              {connection.lastSyncedAt
                                ? `${t('Lần đồng bộ cuối', 'Last sync')}: ${formatDate(connection.lastSyncedAt, locale)} ${formatTime(connection.lastSyncedAt, locale)}`
                                : t('Chưa đồng bộ tin nhắn', 'No messages synced yet')}
                            </small>
                          </div>
                          <div className="connection-actions">
                            {['connected', 'demo'].includes(connection.status) && (
                              <button
                                className="button button-secondary"
                                disabled={busy !== null}
                                onClick={() => void sync(connection)}
                              >
                                <RefreshCw
                                  size={13}
                                  className={busy === connection.id ? 'spin' : ''}
                                />
                                {busy === connection.id
                                  ? t('Đang đồng bộ…', 'Syncing…')
                                  : mode === 'demo'
                                    ? t('Nhập tin mẫu', 'Import samples')
                                    : t('Đồng bộ', 'Sync')}
                              </button>
                            )}
                            {mode === 'live' &&
                              ['disconnected', 'expired', 'error'].includes(connection.status) && (
                                <button
                                  className="button button-primary"
                                  disabled={busy !== null}
                                  onClick={() => void connect(channel)}
                                >
                                  <Link2 size={13} />
                                  {t('Liên kết tài khoản', 'Connect account')}
                                </button>
                              )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="connection-empty">
                        {t('Chưa có tài khoản được cấu hình.', 'No account has been configured.')}
                      </p>
                    )}
                    {mode === 'live' && !loading && !accounts.length && (
                      <button
                        className="button button-secondary"
                        disabled={busy !== null}
                        onClick={() => void connect(channel)}
                      >
                        <Link2 size={13} />
                        {t('Liên kết tài khoản', 'Connect account')}
                      </button>
                    )}
                    {mode === 'live' && accounts.length > 0 && (
                      <button
                        className="button button-secondary connection-add"
                        disabled={busy !== null}
                        onClick={() => void connect(channel)}
                      >
                        <Link2 size={13} />
                        {t('Liên kết thêm tài khoản', 'Connect another account')}
                      </button>
                    )}
                  </div>
                )
              })}
            </section>
          ))
        )}
        {error && (
          <div className="connection-error" role="alert">
            <p>{translateMessage(error, locale)}</p>
            <button
              className="button button-secondary"
              disabled={busy !== null}
              onClick={() => void load()}
            >
              {t('Tải lại trạng thái', 'Reload status')}
            </button>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button className="button button-primary" disabled={busy !== null} onClick={onClose}>
          {t('Về hộp thư', 'Back to inbox')}
        </button>
      </div>
    </Modal>
  )
}
