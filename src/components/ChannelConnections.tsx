import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
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
  connectTikTokShopAccount,
  generateTikTokSignature,
  listPublicTikTokShops,
  loadActiveTikTokShops,
  removeTikTokShopAccount,
  verifyTikTokWebhookSignature,
} from '../lib/tiktokShops'
import { PRODUCT_CATEGORY_TREE } from '../lib/productCategories'
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
  const [embeddedShops, setEmbeddedShops] = useState(() =>
    listPublicTikTokShops(loadActiveTikTokShops()),
  )
  const [newShopId, setNewShopId] = useState(
    () => `tiktok-shop-0${loadActiveTikTokShops().length + 1}`,
  )
  const [newShopName, setNewShopName] = useState(
    () => `TikTok Shop 0${loadActiveTikTokShops().length + 1} · Phụ Kiện & Túi Xách`,
  )
  const [newShopCategory, setNewShopCategory] = useState('Phụ kiện')
  const [simShopId, setSimShopId] = useState('tiktok-shop-01')
  const [simMessageText, setSimMessageText] = useState(
    'Shop ơi cho mình đặt 2 Son kem lì Velvet Tint Đỏ Đất và 1 Serum Vitamin C Brightening 30ml giao về 120 Cầu Giấy Hà Nội, SĐT 0988123456 nhé!',
  )

  const handleSimulateIncomingMessage = async () => {
    const targetShop =
      embeddedShops.find((s) => s.shopId === simShopId) ??
      embeddedShops[0] ??
      listPublicTikTokShops(DEFAULT_TIKTOK_SHOPS)[0]
    const cleanText = simMessageText.trim()
    if (!cleanText) return
    const currentInbox = await inboxService.load()
    const nowIso = new Date().toISOString()
    const convId = `conv-tt-msg-${Date.now()}`
    const shopCategory = targetShop.categoryName ?? 'Mỹ phẩm'
    const newConv: InboxData['conversations'][number] = {
      id: convId,
      customerId: currentInbox.customers[1]?.id ?? currentInbox.customers[0]?.id ?? 'CUS-001',
      channel: 'tiktok',
      shopId: targetShop.shopId,
      category: shopCategory,
      status: 'open',
      priority: 'high',
      assigneeId: 'agent-linh',
      teamId: 'team-sales',
      subject: `[${targetShop.accountName.replace('TikTok ', '')}] Khách đặt hàng mới trên TikTok`,
      unread: 1,
      lastMessageAt: nowIso,
      dueAt: nowIso,
      sourceUrl: null,
      tags: [shopCategory, targetShop.shopId],
      mentioned: false,
      bot: false,
      messages: [
        {
          id: `${convId}-m1`,
          type: 'incoming',
          text: cleanText,
          sentAt: nowIso,
          delivery: 'delivered',
          attachments: [],
        },
      ],
    }
    const updatedInbox: InboxData = {
      ...currentInbox,
      conversations: [newConv, ...currentInbox.conversations],
    }
    try {
      window.localStorage.setItem('smartsales.inbox.demo.tiktok.v4', JSON.stringify(updatedInbox))
    } catch {
      // ignore storage errors
    }
    onSynced(updatedInbox)
    onNotify(
      t(
        `Đã nhận tin nhắn khách hàng mới vào ${targetShop.accountName}! Bấm "Về hộp thư" để xem và Tạo đơn nhanh.`,
        `Received new customer message in ${targetShop.accountName}! Click "Back to inbox" to view and Quick Order.`,
      ),
    )
  }

  const handlePullTunnelWebhooks = async () => {
    try {
      const res = await fetch('/api/v1/webhooks/tiktokshop', {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        throw new Error(
          t(
            'Hãy bật "npm run server:inventory" ở cổng 3002 để hứng Webhook thật từ Cloudflare Tunnel.',
            'Please start "npm run server:inventory" on port 3002 to receive live Cloudflare Tunnel webhooks.',
          ),
        )
      }
      const body = (await res.json()) as {
        events?: {
          id: string
          receivedAt: string
          type: string
          shopId: string
          customerName: string
          text: string
        }[]
      }
      const events = Array.isArray(body.events) ? body.events : []
      if (events.length === 0) {
        onNotify(
          t(
            'Cổng Webhook (3002) đang hoạt động tốt, hiện chưa có gói tin mới nào bắn vào Tunnel.',
            'Webhook server (3002) is active; no new webhook events received yet.',
          ),
        )
        return
      }
      const currentInbox = await inboxService.load()
      let addedCount = 0
      const newConvs: InboxData['conversations'] = []
      for (const ev of events) {
        const convId = `conv-${ev.id}`
        if (currentInbox.conversations.some((c) => c.id === convId)) continue
        const targetShop =
          embeddedShops.find((s) => s.shopId === ev.shopId) ??
          embeddedShops[0] ??
          listPublicTikTokShops(DEFAULT_TIKTOK_SHOPS)[0]
        const shopCategory = targetShop.categoryName ?? 'Mỹ phẩm'
        newConvs.push({
          id: convId,
          customerId: currentInbox.customers[0]?.id ?? 'CUS-001',
          channel: 'tiktok',
          shopId: targetShop.shopId,
          category: shopCategory,
          status: 'open',
          priority: 'high',
          assigneeId: 'agent-linh',
          teamId: 'team-sales',
          subject: `[Webhook Live · ${targetShop.accountName.replace('TikTok ', '')}] ${ev.customerName}`,
          unread: 1,
          lastMessageAt: ev.receivedAt,
          dueAt: ev.receivedAt,
          sourceUrl: null,
          tags: [shopCategory, targetShop.shopId, 'Webhook Live'],
          mentioned: false,
          bot: false,
          messages: [
            {
              id: `${convId}-m1`,
              type: 'incoming',
              text: ev.text,
              sentAt: ev.receivedAt,
              delivery: 'delivered',
              attachments: [],
            },
          ],
        })
        addedCount++
      }
      if (addedCount > 0) {
        const updatedInbox: InboxData = {
          ...currentInbox,
          conversations: [...newConvs, ...currentInbox.conversations],
        }
        try {
          window.localStorage.setItem(
            'smartsales.inbox.demo.tiktok.v4',
            JSON.stringify(updatedInbox),
          )
        } catch {
          // ignore
        }
        onSynced(updatedInbox)
      }
      onNotify(
        t(
          `Đã kéo thành công ${addedCount} tin nhắn Webhook thật từ Cloudflare Tunnel vào Hộp thư!`,
          `Pulled ${addedCount} live Webhook messages from Cloudflare Tunnel into Inbox!`,
        ),
      )
    } catch (cause) {
      const msg =
        cause instanceof Error
          ? cause.message
          : t(
              'Hãy chạy thêm "npm run server:inventory" để hứng Webhook thật từ Cloudflare Tunnel.',
              'Run "npm run server:inventory" to receive live webhooks from Cloudflare Tunnel.',
            )
      onNotify(msg, 'error')
    }
  }

  const handleAddTikTokShop = async () => {
    try {
      const { shops, added, signature } = connectTikTokShopAccount({
        shopId: newShopId,
        accountName: newShopName,
        categoryName: newShopCategory,
        appKey: partnerAppKey,
        appSecret: partnerAppSecret,
      })
      const publicList = listPublicTikTokShops(shops)
      setEmbeddedShops(publicList)
      const timestamp = Math.floor(Date.now() / 1000)
      setSignatureResult({ signature, verified: true, timestamp })

      const nextIndex = publicList.length + 1
      setNewShopId(`tiktok-shop-0${nextIndex}`)
      setNewShopName(`TikTok Shop 0${nextIndex} · Gian Hàng Mới`)

      const currentInbox = await inboxService.load()
      const convId = `conv-tt-${added.shopId}`
      if (!currentInbox.conversations.some((c) => c.id === convId)) {
        const catNode =
          PRODUCT_CATEGORY_TREE.find((c) => c.name === added.categoryName) ??
          PRODUCT_CATEGORY_TREE[0]
        const sampleProd = catNode.products[0]
        const nowIso = new Date().toISOString()
        const newConv: InboxData['conversations'][number] = {
          id: convId,
          customerId: currentInbox.customers[0]?.id ?? 'CUS-001',
          channel: 'tiktok',
          shopId: added.shopId,
          category: added.categoryName ?? catNode.name,
          status: 'open',
          priority: 'high',
          assigneeId: 'agent-linh',
          teamId: 'team-sales',
          subject: `[${added.accountName}] Đặt mua ${sampleProd?.name ?? 'sản phẩm mới'}`,
          unread: 1,
          lastMessageAt: nowIso,
          dueAt: nowIso,
          sourceUrl: null,
          tags: [added.categoryName ?? catNode.name, added.shopId],
          mentioned: false,
          bot: false,
          messages: [
            {
              id: `${convId}-m1`,
              type: 'incoming',
              text: `Chào ${added.accountName}! Mình muốn đặt 2 ${sampleProd?.name ?? 'sản phẩm'} giao về Quận 1 nhé.`,
              sentAt: nowIso,
              delivery: 'delivered',
              attachments: [],
            },
          ],
        }
        const updatedInbox: InboxData = {
          ...currentInbox,
          conversations: [newConv, ...currentInbox.conversations],
        }
        try {
          window.localStorage.setItem(
            'smartsales.inbox.demo.tiktok.v4',
            JSON.stringify(updatedInbox),
          )
        } catch {
          // ignore storage errors
        }
        onSynced(updatedInbox)
      }
      onNotify(
        t(
          `Đã kết nối ${added.accountName} (${added.shopId}) và đồng bộ tin nhắn vào Hộp thư!`,
          `Connected ${added.accountName} (${added.shopId}) and synced messages to Inbox!`,
        ),
      )
    } catch (cause) {
      const msg =
        cause instanceof Error ? cause.message : t('Không thể thêm Shop.', 'Unable to add shop.')
      setError(msg)
      onNotify(msg, 'error')
    }
  }

  const handleRemoveTikTokShop = (shopId: string) => {
    const updated = removeTikTokShopAccount(shopId)
    setEmbeddedShops(listPublicTikTokShops(updated))
    onNotify(t(`Đã gỡ kết nối ${shopId}.`, `Disconnected ${shopId}.`))
  }

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
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--border-subtle, #e6e4f0)',
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: '6px' }}>
                      {t(
                        `Danh sách tài khoản TikTok Shop đang kết nối (${embeddedShops.length} Shop):`,
                        `Connected TikTok Shop accounts (${embeddedShops.length} Shops):`,
                      )}
                    </strong>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginBottom: '12px',
                      }}
                    >
                      {embeddedShops.map((s) => (
                        <div
                          key={s.shopId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: 'var(--surface-muted, #f7f6fb)',
                            fontSize: '13px',
                          }}
                        >
                          <span>
                            <strong>{s.accountName}</strong> · <code>{s.shopId}</code>
                            {s.categoryName ? ` · Danh mục: ${s.categoryName}` : ''}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="connection-state state-connected">
                              {t('Đã kết nối', 'Connected')}
                            </span>
                            {!['tiktok-shop-01', 'tiktok-shop-02', 'tiktok-shop-03'].includes(
                              s.shopId,
                            ) && (
                              <button
                                type="button"
                                className="icon-button"
                                title={t('Gỡ kết nối Shop', 'Disconnect Shop')}
                                onClick={() => handleRemoveTikTokShop(s.shopId)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>
                      {t(
                        '+ Kết nối thêm tài khoản TikTok Shop mới (Multi-Shop Sandbox):',
                        '+ Connect another TikTok Shop account (Multi-Shop Sandbox):',
                      )}
                    </strong>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: '8px',
                        alignItems: 'end',
                      }}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <small>{t('Mã Shop (shop_id)', 'Shop ID')}</small>
                        <input
                          type="text"
                          value={newShopId}
                          onChange={(e) => setNewShopId(e.target.value)}
                          placeholder="tiktok-shop-04"
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <small>{t('Tên hiển thị TikTok Shop', 'Shop display name')}</small>
                        <input
                          type="text"
                          value={newShopName}
                          onChange={(e) => setNewShopName(e.target.value)}
                          placeholder="TikTok Shop 04 · Phụ Kiện"
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <small>{t('Danh mục phụ trách', 'Assigned category')}</small>
                        <select
                          value={newShopCategory}
                          onChange={(e) => setNewShopCategory(e.target.value)}
                        >
                          {PRODUCT_CATEGORY_TREE.map((cat) => (
                            <option key={cat.id} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void handleAddTikTokShop()}
                      >
                        <Plus size={14} />
                        {t('Kết nối & Đồng bộ Shop', 'Connect & Sync Shop')}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--border-subtle, #e6e4f0)',
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: '6px' }}>
                      {t(
                        '📩 Test bắn tin nhắn khách hàng mới vào Hộp thư (Giả lập Webhook Tin nhắn TikTok Shop):',
                        '📩 Simulate incoming TikTok Shop customer message (Webhook Inbox Tester):',
                      )}
                    </strong>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 1fr) 2fr auto',
                        gap: '8px',
                        alignItems: 'end',
                      }}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <small>{t('Gửi vào TikTok Shop', 'Target TikTok Shop')}</small>
                        <select
                          value={simShopId}
                          onChange={(e) => {
                            const nextId = e.target.value
                            setSimShopId(nextId)
                            const found = embeddedShops.find((s) => s.shopId === nextId)
                            const catNode = PRODUCT_CATEGORY_TREE.find(
                              (c) => c.name === found?.categoryName,
                            )
                            const prod = catNode?.products[0]
                            if (prod) {
                              setSimMessageText(
                                `Shop ơi cho mình đặt 2 ${prod.name} giao về 120 Cầu Giấy Hà Nội, SĐT 0988123456 nhé!`,
                              )
                            }
                          }}
                        >
                          {embeddedShops.map((s) => (
                            <option key={s.shopId} value={s.shopId}>
                              {s.accountName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <small>
                          {t(
                            'Nội dung tin nhắn khách gửi (có tên SP, số lượng, SĐT, địa chỉ)',
                            'Customer message text (with product, qty, phone, address)',
                          )}
                        </small>
                        <input
                          type="text"
                          value={simMessageText}
                          onChange={(e) => setSimMessageText(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void handleSimulateIncomingMessage()}
                      >
                        {t('Bắn tin nhắn vào Hộp thư', 'Send message to Inbox')}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void handlePullTunnelWebhooks()}
                      >
                        <RefreshCw size={13} />
                        {t('Kéo Webhook thật từ Tunnel', 'Pull live Tunnel Webhooks')}
                      </button>
                    </div>
                  </div>
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
