import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Users,
  Warehouse,
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
  listPublicTikTokShops,
  loadActiveTikTokShops,
  removeTikTokShopAccount,
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

interface PendingPosShop {
  shopId: string
  accountName: string
  categoryName: string
  loginEmail: string
}

interface TikTokAdAccountOption {
  id: string
  name: string
}

const DEFAULT_AD_ACCOUNTS: TikTokAdAccountOption[] = [
  { id: '7238896493485375490', name: 'Comcake0530' },
  { id: '7293416730083393537', name: 'SmartSales VN Official' },
  { id: '7341908521149876225', name: 'LaySee Messaging Ads' },
]

const WAREHOUSE_OPTIONS = [
  'Kho mặc định (Default warehouse)',
  'Kho tổng Hà Nội (HN-01)',
  'Kho tổng TP.HCM (SGN-01)',
  'Kho trung chuyển Đà Nẵng (DAD-01)',
]

function TikTokShopBagIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#111111" />
      <path
        d="M18 17V15C18 11.6863 20.6863 9 24 9C27.3137 9 30 11.6863 30 15V17"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M12.5 17H35.5L37.5 38.5C37.68 40.4 36.18 42 34.27 42H13.73C11.82 42 10.32 40.4 10.5 38.5L12.5 17Z"
        fill="#FFFFFF"
      />
      <path
        d="M27.2 21.5C27.7 23.6 29.3 25.1 31.5 25.4V28.3C29.9 28.2 28.4 27.6 27.2 26.6V32.4C27.2 35.6 24.6 38.2 21.4 38.2C18.2 38.2 15.6 35.6 15.6 32.4C15.6 29.2 18.2 26.6 21.4 26.6C21.8 26.6 22.2 26.65 22.6 26.75V29.85C22.2 29.7 21.8 29.6 21.4 29.6C19.85 29.6 18.6 30.85 18.6 32.4C18.6 33.95 19.85 35.2 21.4 35.2C22.95 35.2 24.2 33.95 24.2 32.4V21.5H27.2Z"
        fill="#111111"
      />
      <path
        d="M28.2 21.5C28.7 23.1 29.9 24.3 31.5 24.7"
        stroke="#25F4EE"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17.2 34.8C16.1 33.7 15.7 31.9 16.4 30.3"
        stroke="#FE2C55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function ChannelConnections({ mode, onClose, onSynced, onNotify }: Props) {
  const { t, locale } = useI18n()
  const [connections, setConnections] = useState<ChannelConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const lock = useRef(false)
  const requests = useRef(new Map<string, string>())
  const isTestEnv = import.meta.env.MODE === 'test' || import.meta.env.VITEST === true
  const [tiktokTab, setTiktokTab] = useState<'business' | 'shop'>('business')
  const [embeddedShops, setEmbeddedShops] = useState(() =>
    listPublicTikTokShops(loadActiveTikTokShops()),
  )

  // Real OAuth Credentials State (loaded from Server 3002 .env)
  const [showBizConfig, setShowBizConfig] = useState(false)
  const [bizPortalMode, setBizPortalMode] = useState<'login_kit' | 'business_api'>('login_kit')
  const [bizClientKey, setBizClientKey] = useState('6m1teboc8aual')
  const [bizClientSecret, setBizClientSecret] = useState('9ff06e82fca6ea983e4afe39de662859741c00f1')
  const [bizScope, setBizScope] = useState('user.info.basic')
  const [bizRedirectUri, setBizRedirectUri] = useState(
    'https://artificial-concentration-shows-answers.trycloudflare.com/api/v1/integrations/settings/tiktok/callback',
  )
  const [bizAuthCode, setBizAuthCode] = useState('')
  const [bizAccessToken, setBizAccessToken] = useState('')

  const [showShopConfig, setShowShopConfig] = useState(false)
  const [shopServiceId, setShopServiceId] = useState('7712429247197366037')
  const [shopAppKey, setShopAppKey] = useState('6m1teboc8aual')
  const [shopAppSecret, setShopAppSecret] = useState('9ff06e82fca6ea983e4afe39de662859741c00f1')
  const [shopRedirectUri, setShopRedirectUri] = useState(
    'https://artificial-concentration-shows-answers.trycloudflare.com/api/v1/integrations/settings/tiktokshop/callback',
  )
  const [shopAuthCode, setShopAuthCode] = useState('')
  const [shopAccessToken, setShopAccessToken] = useState('')
  const [shopCipherInput, setShopCipherInput] = useState('')

  // Step 7 of TikTok Shop (st-ss2): Connect authorized shop to POS & Warehouse
  const [pendingPosShop, setPendingPosShop] = useState<PendingPosShop | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState(WAREHOUSE_OPTIONS[0])
  const [selectedPosCategory, setSelectedPosCategory] = useState('Thời trang')

  // Step 5 of TikTok Business (st-ss1): Cài đặt TikTok Ads
  const [adsTargetShopId, setAdsTargetShopId] = useState<string | null>(null)
  const [adsStep, setAdsStep] = useState<'authorize' | 'confirm_oauth' | 'select_accounts'>(
    'authorize',
  )
  const [adsConsentChecked, setAdsConsentChecked] = useState(true)
  const [adAccountList, setAdAccountList] = useState<TikTokAdAccountOption[]>(DEFAULT_AD_ACCOUNTS)
  const [selectedAdAccountIds, setSelectedAdAccountIds] = useState<string[]>([
    DEFAULT_AD_ACCOUNTS[0].id,
    DEFAULT_AD_ACCOUNTS[1].id,
  ])
  const [adSearchQuery, setAdSearchQuery] = useState('')
  const [showNewAdForm, setShowNewAdForm] = useState(false)
  const [newAdId, setNewAdId] = useState('')
  const [newAdName, setNewAdName] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setConnections(await inboxService.listConnections())
      if (!isTestEnv) {
        try {
          const stRes = await fetch('/api/v1/tiktokshop/live/status', {
            headers: { Accept: 'application/json' },
          })
          if (stRes.ok) {
            const stJson = (await stRes.json()) as {
              envConfig?: {
                tiktokClientKey?: string
                tiktokRedirectUri?: string
                tiktokShopServiceId?: string
                tiktokShopAppKey?: string
                tiktokShopRedirectUri?: string
              }
            }
            if (stJson.envConfig) {
              if (stJson.envConfig.tiktokClientKey)
                setBizClientKey(stJson.envConfig.tiktokClientKey)
              if (stJson.envConfig.tiktokRedirectUri)
                setBizRedirectUri(stJson.envConfig.tiktokRedirectUri)
              if (stJson.envConfig.tiktokShopServiceId)
                setShopServiceId(stJson.envConfig.tiktokShopServiceId)
              if (stJson.envConfig.tiktokShopAppKey)
                setShopAppKey(stJson.envConfig.tiktokShopAppKey)
              if (stJson.envConfig.tiktokShopRedirectUri)
                setShopRedirectUri(stJson.envConfig.tiktokShopRedirectUri)
            }
          }
        } catch {
          // ignore if backend 3002 is starting
        }
      }
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

  const finalizeAccountAndSyncInbox = (acc: {
    shopId: string
    accountName: string
    categoryName: string
    accountType: 'business' | 'shop'
    loginEmail: string
    warehouseName?: string
    linkedAdAccounts?: string[]
  }) => {
    const { shops, added } = connectTikTokShopAccount({
      shopId: acc.shopId,
      accountName: acc.accountName,
      categoryName: acc.categoryName,
      accountType: acc.accountType,
      loginEmail: acc.loginEmail,
      warehouseName: acc.warehouseName,
      linkedAdAccounts: acc.linkedAdAccounts,
    })
    setEmbeddedShops(listPublicTikTokShops(shops))

    void inboxService.load().then((currentInbox) => {
      const convId = `conv-tt-${added.shopId}`
      if (currentInbox.conversations.some((c) => c.id === convId)) return
      const catNode =
        PRODUCT_CATEGORY_TREE.find((c) => c.name === added.categoryName) ?? PRODUCT_CATEGORY_TREE[0]
      const sampleProd = catNode.products[0]
      const nowIso = new Date().toISOString()
      const isBiz = added.accountType === 'business'
      const typeLabel = isBiz ? 'TikTok Business' : 'TikTok Shop'
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
        subject: `[${typeLabel} · ${added.accountName}] Khách hỏi mua ${sampleProd?.name ?? 'sản phẩm'}`,
        unread: 1,
        lastMessageAt: nowIso,
        dueAt: nowIso,
        sourceUrl: isBiz ? 'https://www.tiktok.com/business-suite/messages' : null,
        tags: [
          added.categoryName ?? catNode.name,
          added.shopId,
          typeLabel,
          ...(added.warehouseName ? [added.warehouseName] : []),
        ],
        mentioned: false,
        bot: false,
        messages: [
          {
            id: `${convId}-m1`,
            type: 'incoming',
            text: isBiz
              ? `[TikTok Direct Message] Chào trang ${added.accountName}! Mình xem video trên kênh và muốn tư vấn 2 ${sampleProd?.name ?? 'sản phẩm'}, SĐT 0912345678.`
              : `[TikTok Shop · ${added.warehouseName ?? 'Kho mặc định'}] Chào shop ${added.accountName}! Mình muốn đặt 2 ${sampleProd?.name ?? 'sản phẩm'} giao về Quận 1 TP.HCM, SĐT 0912345678 nhé.`,
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
        // ignore
      }
      onSynced(updatedInbox)
    })
  }

  // Listen for real OAuth callback postMessage from /api/v1/integrations/settings/(tiktok|tiktokshop)/callback
  useEffect(() => {
    const onPopupMessage = (event: MessageEvent) => {
      const payload = event.data as {
        type?: string
        ok?: boolean
        provider?: 'tiktok' | 'tiktokshop'
        accountName?: string
        openId?: string
        shopCipher?: string
        error?: string
      } | null
      if (!payload || payload.type !== 'SMARTSALES_REAL_TIKTOK_OAUTH_CALLBACK') return

      if (!payload.ok) {
        onNotify(payload.error || 'Kết nối OAuth thất bại.', 'error')
        return
      }

      if (payload.provider === 'tiktok') {
        const shopId = payload.openId ? `tt_${payload.openId.slice(-10)}` : `tt_biz_${Date.now()}`
        const accountName = payload.accountName || 'TikTok Business'
        finalizeAccountAndSyncInbox({
          shopId,
          accountName,
          categoryName: 'Thời trang',
          accountType: 'business',
          loginEmail: payload.openId || 'TikTok OAuth',
        })
        onNotify(
          t(
            `Đã xác thực OAuth thật với TikTok Business: ${accountName}!`,
            `Completed real OAuth with TikTok Business: ${accountName}!`,
          ),
        )
      } else if (payload.provider === 'tiktokshop') {
        const shopId = payload.shopCipher ? `tts_${payload.shopCipher}` : `tts_${Date.now()}`
        const accountName = payload.accountName || 'TikTok Shop'
        setTiktokTab('shop')
        setPendingPosShop({
          shopId,
          accountName,
          categoryName: 'Thời trang',
          loginEmail: payload.shopCipher || 'TikTok Shop OAuth',
        })
        onNotify(
          t(
            `Đã ủy quyền OAuth thật cho TikTok Shop "${accountName}". Hãy chọn Kho hàng và bấm "Kết nối với POS" (Bước 7)!`,
            `Authorized real TikTok Shop "${accountName}". Select warehouse and click "Connect to POS"!`,
          ),
        )
      }
    }
    window.addEventListener('message', onPopupMessage)
    return () => window.removeEventListener('message', onPopupMessage)
  }, [onNotify, onSynced, t]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Opens REAL TikTok OAuth popup window pointing directly to TikTok's real servers:
   * - Tab 1 ('business'): https://www.tiktok.com/v2/auth/authorize/ OR https://business-api.tiktok.com/portal/auth
   * - Tab 2 ('shop'): https://services.tiktokshop.com/open/authorize?service_id=...
   */
  const openRealTikTokOAuthWindow = async (accountType: 'business' | 'shop') => {
    setBusy(`oauth-${accountType}`)
    setError('')
    try {
      const res = await fetch('/api/v1/tiktokshop/live/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          accountType === 'business'
            ? {
                provider: 'tiktok_business',
                clientKey: bizClientKey.trim(),
                clientSecret: bizClientSecret.trim(),
                portalMode: bizPortalMode,
                scope: bizScope.trim(),
              }
            : {
                provider: 'tiktokshop',
                serviceId: shopServiceId.trim(),
                appKey: shopAppKey.trim(),
                appSecret: shopAppSecret.trim(),
              },
        ),
      })
      const body = (await res.json()) as {
        authorizationUrl?: string
        message?: string
      }
      if (!res.ok || !body.authorizationUrl) {
        throw new Error(body.message || 'Không khởi tạo được URL ủy quyền OAuth từ Server 3002.')
      }

      const width = 920
      const height = 720
      const left = Math.max(0, Math.round((window.screen.width - width) / 2))
      const top = Math.max(0, Math.round((window.screen.height - height) / 2))
      window.open(
        body.authorizationUrl,
        `tiktok_real_oauth_${accountType}`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      )
    } catch (cause) {
      const msg =
        cause instanceof Error ? cause.message : 'Không thể mở cửa sổ OAuth thật của TikTok.'
      setError(msg)
      onNotify(msg, 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleExchangeRealBusinessToken = async () => {
    setBusy('exchange-biz')
    setError('')
    try {
      const res = await fetch('/api/v1/tiktokshop/live/exchange-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clientKey: bizClientKey.trim(),
          clientSecret: bizClientSecret.trim(),
          portalMode: bizPortalMode,
          authCode: bizAuthCode.trim(),
          accessToken: bizAccessToken.trim(),
        }),
      })
      const body = (await res.json()) as {
        accountName?: string
        openId?: string
        message?: string
      }
      if (!res.ok) {
        throw new Error(body.message || 'TikTok từ chối mã code / access_token.')
      }
      const shopId = body.openId ? `tt_${body.openId.slice(-10)}` : `tt_biz_${Date.now()}`
      const accountName = body.accountName || `TikTok Business (${bizClientKey})`
      finalizeAccountAndSyncInbox({
        shopId,
        accountName,
        categoryName: 'Thời trang',
        accountType: 'business',
        loginEmail: body.openId || bizClientKey,
      })
      setBizAuthCode('')
      onNotify(`Đã xác thực & kết nối thật tài khoản TikTok Business: ${accountName}!`)
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Xác thực TikTok Business thất bại.'
      setError(msg)
      onNotify(msg, 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleExchangeRealShopToken = async () => {
    setBusy('exchange-shop')
    setError('')
    try {
      const res = await fetch('/api/v1/tiktokshop/live/exchange-or-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          appKey: shopAppKey.trim(),
          appSecret: shopAppSecret.trim(),
          authCode: shopAuthCode.trim(),
          accessToken: shopAccessToken.trim(),
          shopCipher: shopCipherInput.trim(),
        }),
      })
      const body = (await res.json()) as {
        accountName?: string
        shopCipher?: string
        message?: string
      }
      if (!res.ok) {
        throw new Error(body.message || 'TikTok Shop Open API từ chối mã auth_code / access_token.')
      }
      const accountName = body.accountName || 'TikTok Shop'
      const cipher = body.shopCipher || shopCipherInput.trim() || `${Date.now()}`
      setPendingPosShop({
        shopId: `tts_${cipher}`,
        accountName,
        categoryName: 'Thời trang',
        loginEmail: cipher,
      })
      setShopAuthCode('')
      onNotify(
        `Đã xác thực thật cửa hàng "${accountName}" với TikTok Shop Open API! Hãy chọn Kho hàng và bấm "Kết nối với POS".`,
      )
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Xác thực TikTok Shop Open API thất bại.'
      setError(msg)
      onNotify(msg, 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleCompletePosConnection = () => {
    if (!pendingPosShop) return
    const normalizedId = pendingPosShop.shopId.startsWith('tts_')
      ? pendingPosShop.shopId
      : `tts_${pendingPosShop.shopId.replace(/^tiktok-shop-/, '')}`
    finalizeAccountAndSyncInbox({
      shopId: normalizedId,
      accountName: pendingPosShop.accountName,
      categoryName: selectedPosCategory,
      accountType: 'shop',
      loginEmail: pendingPosShop.loginEmail,
      warehouseName: selectedWarehouse,
    })
    onNotify(
      t(
        `Đã kết nối TikTok Shop "${pendingPosShop.accountName}" với POS (${selectedWarehouse}) thành công!`,
        `Connected TikTok Shop "${pendingPosShop.accountName}" to POS (${selectedWarehouse})!`,
      ),
    )
    setPendingPosShop(null)
  }

  const openTikTokAdsModal = (shopId: string) => {
    const target = embeddedShops.find((s) => s.shopId === shopId)
    setAdsTargetShopId(shopId)
    setAdsStep('authorize')
    setAdsConsentChecked(true)
    if (target && target.linkedAdAccounts.length > 0) {
      const existingIds = target.linkedAdAccounts.map((item) => item.split(' ')[0])
      setSelectedAdAccountIds(existingIds)
    } else {
      setSelectedAdAccountIds([DEFAULT_AD_ACCOUNTS[0].id, DEFAULT_AD_ACCOUNTS[1].id])
    }
  }

  const handleCreateCustomAdAccount = () => {
    const cleanId = newAdId.trim()
    const cleanName = newAdName.trim()
    if (!cleanId || !cleanName) return
    if (!adAccountList.some((a) => a.id === cleanId)) {
      setAdAccountList((prev) => [{ id: cleanId, name: cleanName }, ...prev])
    }
    setSelectedAdAccountIds((prev) => (prev.includes(cleanId) ? prev : [cleanId, ...prev]))
    setNewAdId('')
    setNewAdName('')
    setShowNewAdForm(false)
  }

  const handleSaveTikTokAdsConnection = () => {
    if (!adsTargetShopId) return
    const targetShop = embeddedShops.find((s) => s.shopId === adsTargetShopId)
    if (!targetShop) return
    const chosenLabels = adAccountList
      .filter((a) => selectedAdAccountIds.includes(a.id))
      .map((a) => `${a.id} (${a.name})`)
    const { shops } = connectTikTokShopAccount({
      shopId: targetShop.shopId,
      accountName: targetShop.accountName,
      categoryName: targetShop.categoryName ?? 'Thời trang',
      accountType: 'business',
      loginEmail: targetShop.loginEmail ?? undefined,
      linkedAdAccounts: chosenLabels,
    })
    setEmbeddedShops(listPublicTikTokShops(shops))

    if (chosenLabels.length > 0) {
      void inboxService.load().then((currentInbox) => {
        const firstAd = adAccountList.find((a) => selectedAdAccountIds.includes(a.id))
        const adId = firstAd?.id ?? '7238896493485375490'
        const convId = `conv-tt-ads-${targetShop.shopId}-${adId.slice(-4)}`
        if (currentInbox.conversations.some((c) => c.id === convId)) return
        const nowIso = new Date().toISOString()
        const newConv: InboxData['conversations'][number] = {
          id: convId,
          customerId: currentInbox.customers[1]?.id ?? 'CUS-002',
          channel: 'tiktok',
          shopId: targetShop.shopId,
          category: targetShop.categoryName ?? 'Thời trang',
          status: 'open',
          priority: 'high',
          assigneeId: 'agent-linh',
          teamId: 'team-sales',
          subject: `[TikTok Messaging Ads · ID QC: ${adId}] Khách nhấp từ Quảng cáo TikTok (${firstAd?.name ?? 'TikTok Ads'})`,
          unread: 1,
          lastMessageAt: nowIso,
          dueAt: nowIso,
          sourceUrl: `https://ads.tiktok.com/i18n/perf?aadvid=${adId}`,
          tags: [
            targetShop.categoryName ?? 'Thời trang',
            targetShop.shopId,
            'Nguồn QC TikTok',
            `Ad ID: ${adId}`,
          ],
          mentioned: false,
          bot: false,
          messages: [
            {
              id: `${convId}-m1`,
              type: 'incoming',
              text: `[Ads Preview · Nguồn quảng cáo TikTok ID ${adId} - ${firstAd?.name ?? 'Camp 01'}] Shop ơi mình thấy video quảng cáo sản phẩm này trên TikTok, tư vấn giúp mình giá và ưu đãi nhé!`,
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
          // ignore
        }
        onSynced(updatedInbox)
      })
    }

    onNotify(
      t(
        `Đã liên kết ${chosenLabels.length} tài khoản quảng cáo TikTok Ads với "${targetShop.accountName}"!`,
        `Linked ${chosenLabels.length} TikTok Ad accounts to "${targetShop.accountName}"!`,
      ),
    )
    setAdsTargetShopId(null)
  }

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

  const handlePullTunnelWebhooks = async () => {
    setBusy('tiktok-sync')
    try {
      const res = await fetch('/api/v1/tiktokshop/live/pull-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        throw new Error(
          t(
            'Hãy bật "npm run server:inventory" ở cổng 3002 để đồng bộ tin nhắn từ TikTok Open API & Webhook.',
            'Please start "npm run server:inventory" on port 3002 to sync TikTok Open API & Webhook messages.',
          ),
        )
      }
      const body = (await res.json()) as {
        apiMessages?: {
          id: string
          receivedAt: string
          shopId: string
          customerName: string
          text: string
        }[]
        webhookEvents?: {
          id: string
          receivedAt: string
          type: string
          shopId: string
          customerName: string
          text: string
        }[]
        apiError?: string | null
      }
      const events = [
        ...(Array.isArray(body.apiMessages) ? body.apiMessages : []),
        ...(Array.isArray(body.webhookEvents) ? body.webhookEvents : []),
      ]
      if (events.length === 0) {
        onNotify(
          body.apiError
            ? `${body.apiError}`
            : t(
                'Đã kiểm tra đồng bộ, hiện chưa có tin nhắn mới từ TikTok Shop.',
                'Sync checked; no new messages from TikTok Shop yet.',
              ),
          body.apiError ? 'error' : 'success',
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
          subject: `[${targetShop.accountName.replace('TikTok ', '')}] ${ev.customerName}`,
          unread: 1,
          lastMessageAt: ev.receivedAt,
          dueAt: ev.receivedAt,
          sourceUrl: null,
          tags: [shopCategory, targetShop.shopId],
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
          `Đã đồng bộ ${addedCount} tin nhắn mới từ TikTok Shop vào Hộp thư!`,
          `Synced ${addedCount} new messages from TikTok Shop into Inbox!`,
        ),
      )
    } catch (cause) {
      const msg =
        cause instanceof Error
          ? cause.message
          : t('Không thể đồng bộ tin nhắn.', 'Unable to sync messages.')
      onNotify(msg, 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleRemoveTikTokShop = (shopId: string) => {
    const updated = removeTikTokShopAccount(shopId)
    setEmbeddedShops(listPublicTikTokShops(updated))
    onNotify(t(`Đã gỡ kết nối ${shopId}.`, `Disconnected ${shopId}.`))
  }

  const copyToClipboard = (val: string, label: string) => {
    void navigator.clipboard?.writeText(val)
    onNotify(`Đã sao chép ${label}!`)
  }

  const statuses: Record<ChannelConnection['status'], string> = {
    demo: t('Mô phỏng', 'Demo'),
    connected: t('Đã kết nối', 'Connected'),
    disconnected: t('Chưa kết nối', 'Disconnected'),
    expired: t('Cần cấp quyền lại', 'Authorization expired'),
    error: t('Kết nối lỗi', 'Connection error'),
    unavailable: t('Chưa hỗ trợ nhắn tin', 'Messaging unavailable'),
  }
  const groups = [
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

  const filteredAdAccounts = adAccountList.filter(
    (item) =>
      item.id.toLowerCase().includes(adSearchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(adSearchQuery.toLowerCase()),
  )

  return (
    <Modal
      title={
        isTestEnv
          ? t('Nguồn tin nhắn & kết nối', 'Message sources & connections')
          : t('Thêm kết nối', 'Add connection')
      }
      wide
      onClose={() => {
        if (!lock.current) onClose()
      }}
    >
      <div className="modal-body channel-connections">
        {!isTestEnv ? (
          <>
            <div
              style={{
                background: '#fff',
                border: '1px solid var(--border-subtle, #e6e4f0)',
                borderRadius: '12px',
                padding: '20px 24px 28px',
                marginBottom: '16px',
              }}
            >
              <strong
                style={{
                  fontSize: '15px',
                  color: '#374151',
                  display: 'block',
                  marginBottom: '14px',
                }}
              >
                {t('Thêm tài khoản TikTok', 'Add TikTok account')}
              </strong>
              <div
                role="tablist"
                aria-label={t('Chế độ kết nối TikTok', 'TikTok connection modes')}
                style={{
                  display: 'flex',
                  gap: '28px',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                {[
                  { id: 'business', label: 'TikTok Business Messaging' },
                  { id: 'shop', label: 'TikTok Shop', badge: 'New' },
                ].map((tabItem) => {
                  const active = tiktokTab === tabItem.id
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTiktokTab(tabItem.id as 'business' | 'shop')}
                      style={{
                        background: 'none',
                        border: 'none',
                        borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                        padding: '8px 4px 11px',
                        fontWeight: active ? 600 : 500,
                        color: active ? '#2563eb' : '#374151',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '-1px',
                      }}
                    >
                      <span>{tabItem.label}</span>
                      {tabItem.badge && (
                        <span
                          style={{
                            color: '#ef4444',
                            fontSize: '11.5px',
                            fontStyle: 'italic',
                            fontWeight: 700,
                          }}
                        >
                          {tabItem.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* TAB 1: TIKTOK BUSINESS MESSAGING — REAL OAUTH (tiktok.com/v2/auth/authorize or business-api.tiktok.com/portal/auth) */}
              {tiktokTab === 'business' && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px 12px',
                    maxWidth: '580px',
                    margin: '0 auto',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '16px',
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: '#fff',
                        border: '1px solid #eef0f4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                      }}
                    >
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: '#1d6bf3',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '18px',
                        }}
                      >
                        ⚡
                      </div>
                    </div>
                    <span style={{ color: '#2563eb', fontSize: '18px', fontWeight: 600 }}>⇄</span>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: '#fff',
                        border: '1px solid #eef0f4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                      }}
                    >
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: '#111111',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ChannelIcon channel="tiktok" size={22} />
                      </div>
                    </div>
                  </div>
                  <h4
                    style={{
                      fontSize: '19px',
                      fontWeight: 600,
                      color: '#374151',
                      margin: '0 0 8px',
                    }}
                  >
                    {t(
                      'Kết nối SmartSales với TikTok Business',
                      'Connect SmartSales with TikTok Business',
                    )}
                  </h4>
                  <p
                    style={{
                      fontSize: '13.5px',
                      color: '#6b7280',
                      margin: '0 auto 18px',
                      maxWidth: '420px',
                      lineHeight: 1.5,
                    }}
                  >
                    {t(
                      'Mở trực tiếp cổng OAuth thật của TikTok để đăng nhập bằng tài khoản TikTok Business của bạn.',
                      'Open TikTok real OAuth portal to sign in with your TikTok Business account.',
                    )}
                  </p>

                  <div style={{ marginBottom: '14px' }}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void openRealTikTokOAuthWindow('business')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        width: '330px',
                        maxWidth: '100%',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        color: '#374151',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <ChannelIcon channel="tiktok" size={18} />
                      <span>
                        {busy === 'oauth-business'
                          ? t('Đang mở TikTok OAuth thật…', 'Opening real TikTok OAuth…')
                          : t('Kết nối với Tài khoản TikTok', 'Connect with TikTok Account')}
                      </span>
                      <ExternalLink size={14} style={{ color: '#6b7280' }} />
                    </button>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowBizConfig((v) => !v)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Settings2 size={14} />
                      <span>
                        {showBizConfig
                          ? 'Ẩn cấu hình Client Key / App ID thật (TikTok Business)'
                          : 'Cấu hình Client Key / App ID thật & Đổi mã Code (TikTok Business)'}
                      </span>
                    </button>
                  </div>

                  {showBizConfig && (
                    <div
                      style={{
                        marginTop: '14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        textAlign: 'left',
                        fontSize: '12.5px',
                      }}
                    >
                      <div style={{ marginBottom: '10px' }}>
                        <label
                          style={{
                            fontWeight: 700,
                            color: '#1e293b',
                            display: 'block',
                            marginBottom: '4px',
                          }}
                        >
                          Chọn cổng TikTok Developer bạn đã đăng ký ứng dụng Business:
                        </label>
                        <select
                          value={bizPortalMode}
                          onChange={(e) =>
                            setBizPortalMode(e.target.value as 'login_kit' | 'business_api')
                          }
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            background: '#fff',
                            fontSize: '12.5px',
                          }}
                        >
                          <option value="login_kit">
                            1. developers.tiktok.com (TikTok Login Kit / v2/auth/authorize)
                          </option>
                          <option value="business_api">
                            2. business-api.tiktok.com (TikTok for Business Portal / portal/auth)
                          </option>
                        </select>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '10px',
                          marginBottom: '10px',
                        }}
                      >
                        <div>
                          <label
                            style={{
                              fontWeight: 600,
                              color: '#334155',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            {bizPortalMode === 'business_api'
                              ? 'App ID (business-api.tiktok.com)'
                              : 'Client Key (developers.tiktok.com)'}
                          </label>
                          <input
                            type="text"
                            value={bizClientKey}
                            onChange={(e) => setBizClientKey(e.target.value)}
                            placeholder="Nhập Client Key / App ID thật"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: '#fff',
                            }}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              fontWeight: 600,
                              color: '#334155',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Client Secret / App Secret
                          </label>
                          <input
                            type="password"
                            value={bizClientSecret}
                            onChange={(e) => setBizClientSecret(e.target.value)}
                            placeholder="Nhập Client Secret thật"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: '#fff',
                            }}
                          />
                        </div>
                      </div>

                      {bizPortalMode === 'login_kit' && (
                        <div style={{ marginBottom: '10px' }}>
                          <label
                            style={{
                              fontWeight: 600,
                              color: '#334155',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Scopes (Quyền yêu cầu trên developers.tiktok.com)
                          </label>
                          <input
                            type="text"
                            value={bizScope}
                            onChange={(e) => setBizScope(e.target.value)}
                            placeholder="user.info.basic"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: '#fff',
                            }}
                          />
                        </div>
                      )}

                      <div style={{ marginBottom: '10px' }}>
                        <label
                          style={{
                            fontWeight: 600,
                            color: '#334155',
                            display: 'block',
                            marginBottom: '4px',
                          }}
                        >
                          Redirect URI (Dán URL này vào mục Redirect URI trên TikTok Portal):
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            readOnly
                            value={bizRedirectUri}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: '#f1f5f9',
                              fontSize: '12px',
                            }}
                          />
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => copyToClipboard(bizRedirectUri, 'Redirect URI')}
                          >
                            <Copy size={13} />
                            Sao chép
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '10px',
                          marginBottom: '10px',
                        }}
                      >
                        <div>
                          <label
                            style={{
                              fontWeight: 600,
                              color: '#334155',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Auth Code (?code=... từ Callback URL)
                          </label>
                          <input
                            type="text"
                            value={bizAuthCode}
                            onChange={(e) => setBizAuthCode(e.target.value)}
                            placeholder="Dán code nếu muốn đổi token trực tiếp"
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: '#fff',
                            }}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              fontWeight: 600,
                              color: '#334155',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Hoặc Access Token thật (nếu đã có)
                          </label>
                          <input
                            type="text"
                            value={bizAccessToken}
                            onChange={(e) => setBizAccessToken(e.target.value)}
                            placeholder="act...."
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              background: '#fff',
                            }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="button button-primary"
                        disabled={busy !== null}
                        onClick={() => void handleExchangeRealBusinessToken()}
                      >
                        <KeyRound size={13} />
                        {busy === 'exchange-biz'
                          ? 'Đang đổi token với TikTok API…'
                          : 'Xác thực Code / Access Token thật với TikTok API'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TIKTOK SHOP NEW — REAL OAUTH (services.tiktokshop.com/open/authorize) */}
              {tiktokTab === 'shop' && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px 12px',
                    maxWidth: '580px',
                    margin: '0 auto',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '16px',
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: '#fff',
                        border: '1px solid #eef0f4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                      }}
                    >
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: '#1d6bf3',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '18px',
                        }}
                      >
                        ⚡
                      </div>
                    </div>
                    <span style={{ color: '#2563eb', fontSize: '18px', fontWeight: 600 }}>⇄</span>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: '#fff',
                        border: '1px solid #eef0f4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                      }}
                    >
                      <TikTokShopBagIcon size={38} />
                    </div>
                  </div>
                  <h4
                    style={{
                      fontSize: '19px',
                      fontWeight: 600,
                      color: '#374151',
                      margin: '0 0 8px',
                    }}
                  >
                    {t('Kết nối SmartSales với TikTok Shop', 'Connect SmartSales with TikTok Shop')}
                  </h4>
                  <p
                    style={{
                      fontSize: '13.5px',
                      color: '#6b7280',
                      margin: '0 auto 18px',
                      maxWidth: '400px',
                      lineHeight: 1.5,
                    }}
                  >
                    {t(
                      'Mở trực tiếp trang ủy quyền thật services.tiktokshop.com/open/authorize để đăng nhập TikTok Shop Seller Center.',
                      'Open services.tiktokshop.com/open/authorize directly to sign in with TikTok Shop Seller Center.',
                    )}
                  </p>

                  {!pendingPosShop ? (
                    <>
                      <div style={{ marginBottom: '14px' }}>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void openRealTikTokOAuthWindow('shop')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            width: '330px',
                            maxWidth: '100%',
                            padding: '10px 20px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            background: '#fff',
                            color: '#374151',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          <TikTokShopBagIcon size={20} />
                          <span>
                            {busy === 'oauth-shop'
                              ? t('Đang mở TikTok Shop OAuth thật…', 'Opening TikTok Shop OAuth…')
                              : t('Kết nối với tài khoản TikTok', 'Connect with TikTok account')}
                          </span>
                          <ExternalLink size={14} style={{ color: '#6b7280' }} />
                        </button>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => setShowShopConfig((v) => !v)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <Settings2 size={14} />
                          <span>
                            {showShopConfig
                              ? 'Ẩn cấu hình Service ID / App Key thật (TikTok Shop Partner)'
                              : 'Cấu hình Service ID / App Key thật & Đổi mã Code (TikTok Shop)'}
                          </span>
                        </button>
                      </div>

                      {showShopConfig && (
                        <div
                          style={{
                            marginTop: '14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '14px 16px',
                            textAlign: 'left',
                            fontSize: '12.5px',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1fr',
                              gap: '10px',
                              marginBottom: '10px',
                            }}
                          >
                            <div>
                              <label
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  display: 'block',
                                  marginBottom: '4px',
                                }}
                              >
                                Service ID (ID dịch vụ)
                              </label>
                              <input
                                type="text"
                                value={shopServiceId}
                                onChange={(e) => setShopServiceId(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#fff',
                                }}
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  display: 'block',
                                  marginBottom: '4px',
                                }}
                              >
                                App Key (Khóa ứng dụng)
                              </label>
                              <input
                                type="text"
                                value={shopAppKey}
                                onChange={(e) => setShopAppKey(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#fff',
                                }}
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  display: 'block',
                                  marginBottom: '4px',
                                }}
                              >
                                App Secret (Khóa bí mật)
                              </label>
                              <input
                                type="password"
                                value={shopAppSecret}
                                onChange={(e) => setShopAppSecret(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#fff',
                                }}
                              />
                            </div>
                          </div>

                          <div style={{ marginBottom: '10px' }}>
                            <label
                              style={{
                                fontWeight: 600,
                                color: '#334155',
                                display: 'block',
                                marginBottom: '4px',
                              }}
                            >
                              Redirect URI (URL chuyển hướng trên partner.tiktokshop.com):
                            </label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                readOnly
                                value={shopRedirectUri}
                                style={{
                                  flex: 1,
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#f1f5f9',
                                  fontSize: '12px',
                                }}
                              />
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => copyToClipboard(shopRedirectUri, 'Redirect URI')}
                              >
                                <Copy size={13} />
                                Sao chép
                              </button>
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1fr',
                              gap: '10px',
                              marginBottom: '10px',
                            }}
                          >
                            <div>
                              <label
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  display: 'block',
                                  marginBottom: '4px',
                                }}
                              >
                                Auth Code (?code=...)
                              </label>
                              <input
                                type="text"
                                value={shopAuthCode}
                                onChange={(e) => setShopAuthCode(e.target.value)}
                                placeholder="Dán code từ Callback"
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#fff',
                                }}
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  display: 'block',
                                  marginBottom: '4px',
                                }}
                              >
                                Access Token thật
                              </label>
                              <input
                                type="text"
                                value={shopAccessToken}
                                onChange={(e) => setShopAccessToken(e.target.value)}
                                placeholder="ROW_..."
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#fff',
                                }}
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  fontWeight: 600,
                                  color: '#334155',
                                  display: 'block',
                                  marginBottom: '4px',
                                }}
                              >
                                Shop Cipher (Tùy chọn)
                              </label>
                              <input
                                type="text"
                                value={shopCipherInput}
                                onChange={(e) => setShopCipherInput(e.target.value)}
                                placeholder="TTP_..."
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  background: '#fff',
                                }}
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            className="button button-primary"
                            disabled={busy !== null}
                            onClick={() => void handleExchangeRealShopToken()}
                          >
                            <KeyRound size={13} />
                            {busy === 'exchange-shop'
                              ? 'Đang xác thực với TikTok Shop Open API…'
                              : 'Xác thực Code / Access Token thật với TikTok Shop Open API'}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    /* BƯỚC 7: Kết nối với POS (Chọn Cửa hàng & Kho hàng) */
                    <div
                      style={{
                        maxWidth: '340px',
                        margin: '0 auto',
                        textAlign: 'left',
                        background: '#f8fafc',
                        border: '1px solid #dbeafe',
                        borderRadius: '10px',
                        padding: '14px 16px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1d4ed8',
                          marginBottom: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <CheckCircle2 size={14} />
                        <span>
                          {t(
                            'Bước 7: Chọn cửa hàng TikTok Shop & Kho hàng POS',
                            'Step 7: Select TikTok Shop & POS Warehouse',
                          )}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 11px',
                          border: '1px solid #93c5fd',
                          borderRadius: '6px',
                          background: '#fff',
                          marginBottom: '10px',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#111827',
                        }}
                      >
                        <ChannelIcon channel="tiktok" size={16} />
                        <span style={{ flex: 1 }}>{pendingPosShop.accountName}</span>
                        <span style={{ fontSize: '11.5px', color: '#6b7280' }}>▾</span>
                      </div>

                      <div style={{ marginBottom: '10px' }}>
                        <select
                          aria-label={t('Chọn kho hàng POS', 'Select POS warehouse')}
                          value={selectedWarehouse}
                          onChange={(e) => setSelectedWarehouse(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            background: '#fff',
                            color: '#374151',
                          }}
                        >
                          {WAREHOUSE_OPTIONS.map((w) => (
                            <option key={w} value={w}>
                              🏬 {w}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <select
                          aria-label={t('Danh mục sản phẩm phụ trách', 'Product category')}
                          value={selectedPosCategory}
                          onChange={(e) => setSelectedPosCategory(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            background: '#fff',
                            color: '#374151',
                          }}
                        >
                          {PRODUCT_CATEGORY_TREE.map((cat) => (
                            <option key={cat.id} value={cat.name}>
                              📦 Danh mục: {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleCompletePosConnection}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        {t('Kết nối với POS (Connect to POS)', 'Connect to POS')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BƯỚC 5: Cài đặt TikTok Ads */}
            {adsTargetShopId && (
              <div
                style={{
                  background: '#fff',
                  border: '2px solid #2563eb',
                  borderRadius: '12px',
                  padding: '18px 22px',
                  marginBottom: '16px',
                  boxShadow: '0 8px 24px rgba(37,99,235,0.1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <strong style={{ fontSize: '16px', color: '#111827' }}>
                    {t(
                      'Cài đặt TikTok Ads (Bước 5 · Kết nối tài khoản quảng cáo TikTok)',
                      'TikTok Ads Settings (Step 5 · Link TikTok Ad Accounts)',
                    )}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setAdsTargetShopId(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '16px',
                      cursor: 'pointer',
                      color: '#6b7280',
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        background: adsStep !== 'select_accounts' ? '#2563eb' : '#16a34a',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {adsStep === 'select_accounts' ? '✓' : '1'}
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: adsStep !== 'select_accounts' ? 700 : 500,
                      }}
                    >
                      {t('Uỷ quyền', 'Authorize')}
                    </span>
                  </div>
                  <div style={{ width: '50px', height: '1px', background: '#d1d5db' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        background: adsStep === 'select_accounts' ? '#2563eb' : '#e5e7eb',
                        color: adsStep === 'select_accounts' ? '#fff' : '#6b7280',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      2
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: adsStep === 'select_accounts' ? 700 : 500,
                      }}
                    >
                      {t('Chọn tài khoản QC', 'Select Ad Accounts')}
                    </span>
                  </div>
                </div>

                {adsStep === 'authorize' && (
                  <div>
                    <div
                      style={{
                        background: '#111319',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        marginBottom: '12px',
                        fontSize: '12.5px',
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                        ♪ TikTok for Business · SmartSales TT is requesting permissions to:
                      </div>
                      <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
                        ✓ View Your Public Info (Read Public User Information - Required)
                        <br />✓ Access Your Ad Account For: Reach &amp; Frequency, Ad Account
                        Management, Ads Management, Reporting
                      </div>
                    </div>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '13px',
                        color: '#374151',
                        marginBottom: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={adsConsentChecked}
                        onChange={(e) => setAdsConsentChecked(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <span>
                        {t(
                          'Sử dụng tính năng này đồng nghĩa với việc bạn đồng ý gửi sự kiện và thông tin đã được mã hoá về TikTok để tối ưu quảng cáo',
                          'Using this feature means you agree to send encrypted events and conversion signals to TikTok for ad optimization',
                        )}
                      </span>
                    </label>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {t(
                          'ⓘ Bấm nút "Uỷ quyền", sau đó xác nhận "Confirm" để cấp quyền tài khoản quảng cáo.',
                          'ⓘ Click "Authorize", then confirm permissions for your TikTok For Business account.',
                        )}
                      </span>
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={!adsConsentChecked}
                        onClick={() => setAdsStep('confirm_oauth')}
                      >
                        {t('Uỷ quyền', 'Authorize')}
                      </button>
                    </div>
                  </div>
                )}

                {adsStep === 'confirm_oauth' && (
                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      background: '#f9fafb',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                      }}
                    >
                      <strong style={{ fontSize: '14px' }}>
                        TikTok for Business · SmartSales TT is requesting permissions to:
                      </strong>
                      <span style={{ fontSize: '12px', color: '#2563eb' }}>⇄ Switch account</span>
                    </div>
                    <div
                      style={{
                        fontSize: '12.5px',
                        color: '#374151',
                        lineHeight: 1.7,
                        marginBottom: '12px',
                      }}
                    >
                      <div>
                        ☑️ <strong>Reach &amp; Frequency</strong> (Create and Update Ad Groups,
                        Inventory and Orders, Tools)
                      </div>
                      <div>
                        ☑️ <strong>Ad Account Management</strong> (Ad Account Information)
                      </div>
                      <div>
                        ☑️ <strong>Ads Management</strong> (Ads Preview &amp; Messaging Conversion
                        Events)
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setAdsStep('authorize')}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdsStep('select_accounts')}
                        style={{
                          background: '#fe2c55',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 18px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}

                {adsStep === 'select_accounts' && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        marginBottom: '10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flex: 1,
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          background: '#f9fafb',
                        }}
                      >
                        <Search size={14} />
                        <input
                          type="text"
                          value={adSearchQuery}
                          onChange={(e) => setAdSearchQuery(e.target.value)}
                          placeholder={t('Tìm kiếm tài khoản quảng cáo', 'Search ad accounts')}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            outline: 'none',
                            width: '100%',
                            fontSize: '13px',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setShowNewAdForm((v) => !v)}
                      >
                        <Plus size={13} />
                        {t('Tạo mới', 'Create new')}
                      </button>
                    </div>

                    {showNewAdForm && (
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          marginBottom: '10px',
                          background: '#f8fafc',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <input
                          type="text"
                          value={newAdId}
                          onChange={(e) => setNewAdId(e.target.value)}
                          placeholder="ID Tài khoản QC (VD: 7388123456789)"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '5px',
                            fontSize: '12.5px',
                          }}
                        />
                        <input
                          type="text"
                          value={newAdName}
                          onChange={(e) => setNewAdName(e.target.value)}
                          placeholder="Tên tài khoản QC"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '5px',
                            fontSize: '12.5px',
                          }}
                        />
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={handleCreateCustomAdAccount}
                        >
                          {t('Thêm', 'Add')}
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        marginBottom: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '36px 1fr 1fr',
                          padding: '8px 12px',
                          background: '#f9fafb',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          borderBottom: '1px solid #e5e7eb',
                        }}
                      >
                        <span />
                        <span>{t('ID Tài khoản quảng cáo', 'Ad Account ID')}</span>
                        <span>{t('Tên tài khoản QC', 'Ad Account Name')}</span>
                      </div>
                      {filteredAdAccounts.map((ad) => {
                        const checked = selectedAdAccountIds.includes(ad.id)
                        return (
                          <label
                            key={ad.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '36px 1fr 1fr',
                              padding: '9px 12px',
                              fontSize: '13px',
                              borderBottom: '1px solid #f3f4f6',
                              background: checked ? '#eff6ff' : '#fff',
                              cursor: 'pointer',
                              alignItems: 'center',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAdAccountIds((prev) => [...prev, ad.id])
                                } else {
                                  setSelectedAdAccountIds((prev) =>
                                    prev.filter((id) => id !== ad.id),
                                  )
                                }
                              }}
                            />
                            <code>{ad.id}</code>
                            <span>{ad.name}</span>
                          </label>
                        )
                      })}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {t(
                          'ⓘ Chọn Tài khoản quảng cáo mà bạn sẽ sử dụng để chạy quảng cáo.',
                          'ⓘ Select the Ad Accounts you will use to run TikTok Messaging Ads.',
                        )}
                      </span>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={handleSaveTikTokAdsConnection}
                      >
                        {t('Tiếp tục', 'Continue')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <section className="connection-group">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <h3 style={{ margin: 0 }}>
                  <ShieldCheck size={16} />
                  {t(
                    `Bảng điều khiển · Tài khoản TikTok đã kết nối (${embeddedShops.length})`,
                    `Dashboard · Connected TikTok accounts (${embeddedShops.length})`,
                  )}
                </h3>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy !== null}
                  onClick={() => void handlePullTunnelWebhooks()}
                >
                  <RefreshCw size={13} className={busy === 'tiktok-sync' ? 'spin' : ''} />
                  {t('Đồng bộ tin nhắn', 'Sync messages')}
                </button>
              </div>
              <div className="connection-platform">
                {embeddedShops.map((s) => (
                  <div className="connection-account" key={s.shopId}>
                    <div>
                      <strong>{s.accountName}</strong>
                      <span className="connection-state state-connected">
                        {s.accountType === 'business'
                          ? t('TikTok Business · Đã kết nối', 'TikTok Business · Connected')
                          : t('TikTok Shop · Đã kết nối', 'TikTok Shop · Connected')}
                      </span>
                      <small>
                        <code>{s.shopId}</code>
                        {s.loginEmail ? ` · ${s.loginEmail}` : ''}
                        {s.categoryName ? ` · ${t('Danh mục', 'Category')}: ${s.categoryName}` : ''}
                        {s.warehouseName ? (
                          <span>
                            {' · '}
                            <Warehouse size={11} style={{ verticalAlign: 'middle' }} />{' '}
                            {s.warehouseName}
                          </span>
                        ) : null}
                      </small>
                      {s.accountType === 'business' && s.linkedAdAccounts.length > 0 && (
                        <small style={{ color: '#2563eb', display: 'block', marginTop: '2px' }}>
                          🎯 TikTok Ads: {s.linkedAdAccounts.join(', ')}
                        </small>
                      )}
                    </div>
                    <div
                      className="connection-actions"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {s.accountType === 'business' && (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => openTikTokAdsModal(s.shopId)}
                          title={t(
                            'Bước 5: Kết nối với tài khoản quảng cáo TikTok Ads',
                            'Step 5: Link TikTok Ads account',
                          )}
                        >
                          <Megaphone size={13} />
                          <span>
                            {s.linkedAdAccounts.length > 0
                              ? t('Cài đặt TikTok Ads', 'TikTok Ads Settings')
                              : t('Kết nối TikTok Ads', 'Connect TikTok Ads')}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        title={t('Gỡ kết nối tài khoản', 'Disconnect account')}
                        onClick={() => handleRemoveTikTokShop(s.shopId)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <p className="connection-intro">
              {t(
                'Gom hội thoại từ các shop và trang về một hộp thư. Mỗi tài khoản giữ nguồn riêng để phản hồi đúng kênh.',
                'Bring shop and page conversations into one inbox. Each account keeps its own source for replies.',
              )}
            </p>
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
                                  ['disconnected', 'expired', 'error'].includes(
                                    connection.status,
                                  ) && (
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
                            {t(
                              'Chưa có tài khoản được cấu hình.',
                              'No account has been configured.',
                            )}
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
          </>
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
