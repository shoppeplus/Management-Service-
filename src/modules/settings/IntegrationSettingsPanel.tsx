import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Webhook,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { CHANNELS, SOCIAL_CHANNELS } from '../../lib/inbox'
import type { Channel, ChannelConnection } from '../../types/inbox'
import { APP_MODE, inboxService } from '../../services/inboxService'
import { canAccessModule, useAppAccess } from '../operations/access'
import { useI18n } from '../../i18n'
import {
  integrationSettingsService,
  type IntegrationProvider,
  type IntegrationSettingsStatus,
  type ProviderCredentials,
} from './service'
import './integration-settings.css'

type Props = {
  onManageChannels?: () => void
}

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

type MarketplaceProvider = 'shopee' | 'lazada' | 'tiktokshop'
type MarketplaceDraft = Record<string, string>
type CredentialDrafts = {
  geminiKey: string
  geminiModel: string
  telegramToken: string
  shopee: MarketplaceDraft
  lazada: MarketplaceDraft
  tiktokshop: MarketplaceDraft
}
type CredentialField = {
  name: string
  label: string
  secret?: boolean
  optional?: boolean
  options?: { value: string; label: string }[]
}

const marketplaceCredentialFields: Record<MarketplaceProvider, CredentialField[]> = {
  shopee: [
    { name: 'partnerId', label: 'Shopee Partner ID' },
    { name: 'partnerKey', label: 'Shopee Partner Key', secret: true },
    { name: 'shopId', label: 'Shopee Shop ID' },
    { name: 'accessToken', label: 'Shopee access token', secret: true },
    { name: 'refreshToken', label: 'Shopee refresh token', secret: true, optional: true },
  ],
  lazada: [
    { name: 'appKey', label: 'Lazada App Key' },
    { name: 'appSecret', label: 'Lazada App Secret', secret: true },
    { name: 'accessToken', label: 'Lazada access token', secret: true },
    { name: 'refreshToken', label: 'Lazada refresh token', secret: true, optional: true },
    {
      name: 'region',
      label: 'Lazada region',
      options: [
        { value: 'vn', label: 'Vietnam' },
        { value: 'sg', label: 'Singapore' },
        { value: 'my', label: 'Malaysia' },
        { value: 'id', label: 'Indonesia' },
        { value: 'th', label: 'Thailand' },
        { value: 'ph', label: 'Philippines' },
      ],
    },
  ],
  tiktokshop: [
    { name: 'appKey', label: 'TikTok Shop App Key' },
    { name: 'appSecret', label: 'TikTok Shop App Secret', secret: true },
    { name: 'accessToken', label: 'TikTok Shop access token', secret: true },
    { name: 'shopCipher', label: 'Shop cipher', secret: true, optional: true },
  ],
}

function ProviderState({ configured }: { configured: boolean | null }) {
  const { t } = useI18n()
  if (configured === null)
    return (
      <span className="integration-status is-unknown">
        <CircleHelp size={13} aria-hidden="true" />
        {t('Chưa kiểm tra', 'Not checked')}
      </span>
    )
  return (
    <span className={`integration-status ${configured ? 'is-ready' : 'is-missing'}`}>
      {configured ? (
        <CheckCircle2 size={13} aria-hidden="true" />
      ) : (
        <AlertTriangle size={13} aria-hidden="true" />
      )}
      {configured ? t('Đã cấu hình', 'Configured') : t('Chưa cấu hình', 'Not configured')}
    </span>
  )
}

function ChannelStatus({
  channel,
  connection,
}: {
  channel: Channel
  connection?: ChannelConnection
}) {
  const { t } = useI18n()
  if (APP_MODE === 'demo')
    return (
      <span className="integration-status is-demo">{t('Mô phỏng Demo', 'Demo simulation')}</span>
    )
  if (!connection) {
    return (
      <span
        className={`integration-status ${channel === 'telegram' ? 'is-missing' : 'is-planned'}`}
      >
        {channel === 'telegram'
          ? t('Chưa kết nối', 'Not connected')
          : t('Chưa có connector', 'Connector not implemented')}
      </span>
    )
  }
  const statusLabels: Record<ChannelConnection['status'], string> = {
    demo: t('Mô phỏng Demo', 'Demo simulation'),
    connected: t('Đã kết nối', 'Connected'),
    disconnected: t('Chưa kết nối', 'Not connected'),
    expired: t('Cần cấp quyền lại', 'Authorization expired'),
    error: t('Có lỗi', 'Error'),
    unavailable: t('Chưa hỗ trợ', 'Unavailable'),
  }
  const statusClass =
    connection.status === 'connected'
      ? 'is-ready'
      : connection.status === 'error' || connection.status === 'expired'
        ? 'is-missing'
        : connection.status === 'unavailable'
          ? 'is-planned'
          : 'is-unknown'
  return (
    <span className={`integration-status ${statusClass}`}>{statusLabels[connection.status]}</span>
  )
}

function MarketplaceCredentialForm({
  provider,
  title,
  status,
  fields,
  values,
  busy,
  canSave,
  ready,
  onChange,
  onTest,
  onSave,
  onRemove,
}: {
  provider: MarketplaceProvider
  title: string
  status: IntegrationSettingsStatus['providers'][MarketplaceProvider] | null
  fields: CredentialField[]
  values: MarketplaceDraft
  busy: IntegrationProvider | null
  canSave: boolean
  ready: boolean
  onChange: (name: string, value: string) => void
  onTest: () => void
  onSave: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="integration-credential-card">
      <div className="integration-marketplace-heading">
        <div>
          <strong>{title}</strong>
          <small>
            {status?.source === 'workspace'
              ? t('Cấu hình doanh nghiệp', 'Workspace credentials')
              : t('Chưa lưu thông tin riêng', 'No workspace credentials')}
          </small>
          {status?.accountName && <small>{status.accountName}</small>}
        </div>
        <ProviderState configured={status?.configured ?? null} />
      </div>
      {fields.map((field) => (
        <label key={field.name}>
          {field.label}
          {field.options ? (
            <select
              value={values[field.name] ?? field.options[0].value}
              onChange={(event) => onChange(field.name, event.target.value)}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.secret ? 'password' : 'text'}
              autoComplete="new-password"
              value={values[field.name] ?? ''}
              onChange={(event) => onChange(field.name, event.target.value)}
              placeholder={
                field.optional
                  ? t('Không bắt buộc', 'Optional')
                  : status?.configured
                    ? t('Đã có cấu hình · nhập để thay thế', 'Configured · enter to replace')
                    : t(
                        'Nhập từ cổng nhà phát triển của sàn',
                        'Enter from the marketplace developer portal',
                      )
              }
            />
          )}
        </label>
      ))}
      <div className="integration-credential-actions">
        <button
          className="button button-secondary"
          type="button"
          aria-label={t(`Kiểm tra kết nối ${title}`, `Test ${title} connection`)}
          disabled={busy !== null || !ready}
          onClick={onTest}
        >
          {busy === provider
            ? t('Đang kiểm tra…', 'Testing…')
            : t('Kiểm tra kết nối', 'Test connection')}
        </button>
        <button
          className="button button-primary"
          type="button"
          aria-label={t(`Lưu kết nối ${title}`, `Save ${title} connection`)}
          disabled={busy !== null || !canSave || !ready}
          onClick={onSave}
        >
          {t('Kiểm tra và lưu', 'Verify and save')}
        </button>
        {status?.source === 'workspace' && (
          <button
            className="button button-secondary"
            type="button"
            disabled={busy !== null}
            onClick={onRemove}
          >
            {t('Ngắt kết nối', 'Disconnect')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function IntegrationSettingsPanel({ onManageChannels }: Props) {
  const { t } = useI18n()
  const access = useAppAccess()
  const canManageIntegrations = canAccessModule('Admin', access)
  const [settingsStatus, setSettingsStatus] = useState<IntegrationSettingsStatus | null>(null)
  const [connections, setConnections] = useState<ChannelConnection[]>([])
  const [providerError, setProviderError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [credentialBusy, setCredentialBusy] = useState<IntegrationProvider | null>(null)
  const [credentialError, setCredentialError] = useState('')
  const [credentialNotice, setCredentialNotice] = useState('')
  const [drafts, setDrafts] = useState<CredentialDrafts>({
    geminiKey: '',
    geminiModel: 'gemini-3.8-flash',
    telegramToken: '',
    shopee: {
      partnerId: '',
      partnerKey: '',
      shopId: '',
      accessToken: '',
      refreshToken: '',
    },
    lazada: {
      appKey: '',
      appSecret: '',
      accessToken: '',
      refreshToken: '',
      region: 'vn',
    },
    tiktokshop: {
      appKey: '',
      appSecret: '',
      accessToken: '',
      shopCipher: '',
    },
  })

  const load = useCallback(async () => {
    setLoading(true)
    setProviderError('')
    setConnectionError('')
    if (APP_MODE === 'live' && !canManageIntegrations) {
      setSettingsStatus(null)
      setConnections([])
      setLoading(false)
      return
    }
    const [providers, channels] = await Promise.allSettled([
      APP_MODE === 'live' ? integrationSettingsService.status() : Promise.resolve(null),
      inboxService.listConnections(),
    ])
    if (providers.status === 'fulfilled') {
      const currentStatus = providers.value
      setSettingsStatus(currentStatus)
      if (currentStatus) {
        setDrafts((current) => ({
          ...current,
          geminiModel: currentStatus.providers.gemini.model ?? current.geminiModel,
        }))
      }
    } else {
      setSettingsStatus(null)
      setProviderError(
        errorMessage(
          providers.reason,
          t('Không tải được cấu hình tích hợp.', 'Unable to load integration settings.'),
        ),
      )
    }
    if (channels.status === 'fulfilled') setConnections(channels.value)
    else {
      setConnections([])
      setConnectionError(
        errorMessage(
          channels.reason,
          t('Không tải được trạng thái kênh.', 'Unable to load channel status.'),
        ),
      )
    }
    setLoading(false)
  }, [canManageIntegrations, t])

  useEffect(() => {
    void load()
  }, [load])

  const credentialsFor = (provider: IntegrationProvider): ProviderCredentials => {
    if (provider === 'gemini') return { apiKey: drafts.geminiKey, model: drafts.geminiModel }
    if (provider === 'telegram') return { botToken: drafts.telegramToken }
    if (provider === 'shopee')
      return {
        partnerId: drafts.shopee.partnerId,
        partnerKey: drafts.shopee.partnerKey,
        shopId: drafts.shopee.shopId,
        accessToken: drafts.shopee.accessToken,
        refreshToken: drafts.shopee.refreshToken,
      }
    if (provider === 'lazada')
      return {
        appKey: drafts.lazada.appKey,
        appSecret: drafts.lazada.appSecret,
        accessToken: drafts.lazada.accessToken,
        refreshToken: drafts.lazada.refreshToken,
        region: drafts.lazada.region,
      }
    return {
      appKey: drafts.tiktokshop.appKey,
      appSecret: drafts.tiktokshop.appSecret,
      accessToken: drafts.tiktokshop.accessToken,
      shopCipher: drafts.tiktokshop.shopCipher,
    }
  }

  const updateMarketplaceDraft = (provider: MarketplaceProvider, name: string, value: string) =>
    setDrafts((current) => ({
      ...current,
      [provider]: { ...current[provider], [name]: value },
    }))

  const marketplaceCredentialsReady = (provider: MarketplaceProvider) => {
    const values = drafts[provider]
    return marketplaceCredentialFields[provider]
      .filter((field) => !field.optional)
      .every((field) => Boolean(values[field.name]?.trim()))
  }

  const testCredentials = async (provider: IntegrationProvider) => {
    setCredentialBusy(provider)
    setCredentialError('')
    setCredentialNotice('')
    try {
      const result = await integrationSettingsService.test(provider, credentialsFor(provider))
      setCredentialNotice(
        t(`Kết nối ${result.accountName} hoạt động.`, `${result.accountName} connection verified.`),
      )
    } catch (cause) {
      setCredentialError(
        errorMessage(cause, t('Không kiểm tra được kết nối.', 'Unable to test the connection.')),
      )
    } finally {
      setCredentialBusy(null)
    }
  }

  const saveCredentials = async (provider: IntegrationProvider) => {
    setCredentialBusy(provider)
    setCredentialError('')
    setCredentialNotice('')
    try {
      const result = await integrationSettingsService.save(provider, credentialsFor(provider))
      setSettingsStatus(result.status)
      setDrafts((current) => ({
        ...current,
        ...(provider === 'gemini' ? { geminiKey: '' } : {}),
        ...(provider === 'telegram' ? { telegramToken: '' } : {}),
        ...(provider === 'shopee'
          ? {
              shopee: {
                partnerId: '',
                partnerKey: '',
                shopId: '',
                accessToken: '',
                refreshToken: '',
              },
            }
          : {}),
        ...(provider === 'lazada'
          ? {
              lazada: {
                appKey: '',
                appSecret: '',
                accessToken: '',
                refreshToken: '',
                region: 'vn',
              },
            }
          : {}),
        ...(provider === 'tiktokshop'
          ? {
              tiktokshop: { appKey: '', appSecret: '', accessToken: '', shopCipher: '' },
            }
          : {}),
      }))
      setCredentialNotice(
        t(
          `Đã kiểm tra và lưu kết nối ${result.accountName}.`,
          `${result.accountName} was verified and saved.`,
        ),
      )
    } catch (cause) {
      setCredentialError(
        errorMessage(cause, t('Không lưu được cấu hình.', 'Unable to save the configuration.')),
      )
    } finally {
      setCredentialBusy(null)
    }
  }

  const removeCredentials = async (provider: IntegrationProvider) => {
    setCredentialBusy(provider)
    setCredentialError('')
    setCredentialNotice('')
    try {
      setSettingsStatus(await integrationSettingsService.remove(provider))
      setCredentialNotice(t('Đã ngắt cấu hình đã lưu.', 'Saved credentials disconnected.'))
    } catch (cause) {
      setCredentialError(
        errorMessage(cause, t('Không ngắt được kết nối.', 'Unable to disconnect the integration.')),
      )
    } finally {
      setCredentialBusy(null)
    }
  }

  const canSaveCredentials = Boolean(settingsStatus?.canSaveCredentials)
  const canSaveGemini =
    canSaveCredentials &&
    Boolean(drafts.geminiModel.trim()) &&
    Boolean(
      drafts.geminiKey.trim() || settingsStatus?.providers.gemini.source === 'workspace',
    )
  const sourceLabel = (provider: IntegrationProvider) =>
    settingsStatus?.providers[provider].source === 'workspace'
      ? t('Cấu hình của doanh nghiệp', 'Workspace configuration')
      : t('Cấu hình máy chủ', 'Server configuration')

  const connectionFor = (channel: Channel) => connections.find((item) => item.channel === channel)
  const channelRow = (channel: Channel) => {
    const info = CHANNELS.find((item) => item.id === channel)!
    const connection = connectionFor(channel)
    return (
      <div className="integration-channel-row" key={channel}>
        <span className="integration-channel-name">{info.label}</span>
        <ChannelStatus channel={channel} connection={connection} />
        {connection?.accountName && <small>{connection.accountName}</small>}
      </div>
    )
  }
  const connectedCount = connections.filter((item) => item.status === 'connected').length

  return (
    <div className="integration-settings">
      <div className="integration-settings-intro">
        <div>
          <span className="integration-settings-eyebrow">
            {t('TRUNG TÂM TÍCH HỢP', 'INTEGRATION CENTER')}
          </span>
          <h3>{t('Kết nối API và dịch vụ', 'API and service connections')}</h3>
          <p>
            {t(
              'Theo dõi các kết nối hiện có, xem yêu cầu cấu hình và quản lý dịch vụ tập trung tại đây.',
              'Review current connections, setup requirements, and manage integrations from one place.',
            )}
          </p>
        </div>
        <button
          className="button button-secondary integration-refresh"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle size={14} className="spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={14} aria-hidden="true" />
          )}
          {t('Làm mới trạng thái', 'Refresh status')}
        </button>
      </div>

      <div className="integration-overview">
        <div>
          <span>{t('Chế độ ứng dụng', 'Application mode')}</span>
          <strong>{APP_MODE === 'live' ? t('Live', 'Live') : t('Demo', 'Demo')}</strong>
        </div>
        <div>
          <span>{t('Kênh đang kết nối', 'Connected channels')}</span>
          <strong>
            {APP_MODE === 'demo' ? t('Mô phỏng', 'Simulated') : loading ? '…' : `${connectedCount}`}
          </strong>
        </div>
        <div>
          <span>{t('Khóa API', 'API secrets')}</span>
          <strong>{t('Chỉ lưu phía máy chủ', 'Server-side only')}</strong>
        </div>
      </div>

      {credentialError && (
        <p className="integration-inline-error" role="alert">
          {credentialError}
        </p>
      )}
      {credentialNotice && (
        <p className="integration-inline-success" role="status">
          {credentialNotice}
        </p>
      )}

      <section className="integration-settings-section">
        <header>
          <span className="integration-section-icon ai">
            <Bot size={17} aria-hidden="true" />
          </span>
          <div>
            <h4>{t('AI và phân tích thị trường', 'AI and market intelligence')}</h4>
            <p>
              {t(
                'Gemini tự tìm kiếm trên web và tạo bản phân tích tóm tắt.',
                'Gemini searches the web and produces a concise analysis.',
              )}
            </p>
          </div>
        </header>
        {providerError && (
          <p className="integration-inline-error" role="alert">
            {providerError}
          </p>
        )}
        {APP_MODE === 'live' && !canManageIntegrations && (
          <p className="integration-inline-error" role="status">
            {t(
              'Chỉ owner/admin có thể xem và quản lý tích hợp.',
              'Only owners/admins can view and manage integrations.',
            )}
          </p>
        )}
        <div className="integration-provider-grid">
          <div className="integration-provider-row">
            <div>
              <strong>Google Gemini</strong>
              <small>{settingsStatus?.providers.gemini.model ?? 'GEMINI_MODEL'}</small>
            </div>
            <div>
              <ProviderState configured={settingsStatus?.providers.gemini.configured ?? null} />
              <small>{sourceLabel('gemini')}</small>
            </div>
          </div>
        </div>
        <p className="integration-security-note">
          <ShieldCheck size={15} aria-hidden="true" />
          {t(
            'Nhập API key tại đây để kiểm tra và lưu mã hóa phía máy chủ. Khóa không được đọc lại hoặc lưu trong trình duyệt.',
            'Enter API keys here to test and save them encrypted on the server. Keys are never revealed or stored in the browser.',
          )}
        </p>
        {APP_MODE === 'live' && canManageIntegrations && !canSaveCredentials && (
          <p className="integration-capability-note" role="alert">
            {t(
              'Máy chủ chưa cấu hình INTEGRATION_ENCRYPTION_KEY. Bạn vẫn có thể kiểm tra kết nối, nhưng cần thêm khóa vào .env và khởi động lại API để lưu.',
              'INTEGRATION_ENCRYPTION_KEY is not configured on the server. You can still test connections, but add the key to .env and restart the API before saving.',
            )}
          </p>
        )}
        {APP_MODE === 'live' && canManageIntegrations && (
          <div className="integration-credential-grid">
            <div className="integration-credential-card">
              <div>
                <strong>Google Gemini</strong>
                <small>{sourceLabel('gemini')}</small>
              </div>
              <label>
                {t('Gemini API key', 'Gemini API key')}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={drafts.geminiKey}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, geminiKey: event.target.value }))
                  }
                  placeholder={
                    settingsStatus?.providers.gemini.configured
                      ? t('Đã có khóa · nhập để thay thế', 'Configured · enter to replace')
                      : 'AIza…'
                  }
                />
              </label>
              <label>
                {t('Tên mô hình Gemini', 'Gemini model')}
                <input
                  value={drafts.geminiModel}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, geminiModel: event.target.value }))
                  }
                  placeholder="gemini-3.8-flash"
                />
              </label>
              <div className="integration-credential-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={credentialBusy !== null || !drafts.geminiKey.trim()}
                  onClick={() => void testCredentials('gemini')}
                >
                  {credentialBusy === 'gemini'
                    ? t('Đang kiểm tra…', 'Testing…')
                    : t('Kiểm tra kết nối', 'Test connection')}
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    credentialBusy !== null ||
                    !canSaveGemini
                  }
                  onClick={() => void saveCredentials('gemini')}
                >
                  {t('Lưu cấu hình', 'Save configuration')}
                </button>
                {settingsStatus?.providers.gemini.source === 'workspace' && (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={credentialBusy !== null}
                    onClick={() => void removeCredentials('gemini')}
                  >
                    {t('Ngắt kết nối', 'Disconnect')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {APP_MODE === 'live' && settingsStatus && !canSaveCredentials && (
          <p className="integration-inline-error" role="status">
            {t(
              'Để lưu khóa tại đây, quản trị máy chủ cần tạo INTEGRATION_ENCRYPTION_KEY trong .env rồi khởi động lại API.',
              'To save keys here, a server administrator must set INTEGRATION_ENCRYPTION_KEY in .env and restart the API.',
            )}
          </p>
        )}
        {APP_MODE === 'demo' && (
          <p className="integration-capability-note">
            {t(
              'Chuyển sang Live để nhập và lưu API key thật. Demo không kết nối dịch vụ bên ngoài.',
              'Switch to Live to enter and save real API keys. Demo does not connect to external services.',
            )}
          </p>
        )}
        <div className="integration-actions">
          <span>
            <code>GEMINI_API_KEY</code>
            <code>GEMINI_MODEL</code>
          </span>
          <Link className="button button-secondary" to="/market-intelligence">
            {t('Mở phân tích AI', 'Open AI analysis')}
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="integration-settings-section">
        <header>
          <span className="integration-section-icon marketplace">
            <ShoppingBag size={17} aria-hidden="true" />
          </span>
          <div>
            <h4>{t('Sàn thương mại điện tử', 'Marketplaces')}</h4>
            <p>
              {t(
                'Các sàn cần ứng dụng API/OAuth riêng, quyền truy cập và callback do từng nhà cung cấp cấp.',
                'Each marketplace requires its own API/OAuth app, permissions, and provider-issued callback.',
              )}
            </p>
          </div>
        </header>
        {APP_MODE === 'live' && canManageIntegrations && (
          <div className="integration-marketplace-grid">
            <MarketplaceCredentialForm
              provider="shopee"
              title="Shopee"
              status={settingsStatus?.providers.shopee ?? null}
              fields={marketplaceCredentialFields.shopee}
              values={drafts.shopee}
              busy={credentialBusy}
              canSave={canSaveCredentials}
              ready={marketplaceCredentialsReady('shopee')}
              onChange={(name, value) => updateMarketplaceDraft('shopee', name, value)}
              onTest={() => void testCredentials('shopee')}
              onSave={() => void saveCredentials('shopee')}
              onRemove={() => void removeCredentials('shopee')}
            />
            <MarketplaceCredentialForm
              provider="lazada"
              title="Lazada"
              status={settingsStatus?.providers.lazada ?? null}
              fields={marketplaceCredentialFields.lazada}
              values={drafts.lazada}
              busy={credentialBusy}
              canSave={canSaveCredentials}
              ready={marketplaceCredentialsReady('lazada')}
              onChange={(name, value) => updateMarketplaceDraft('lazada', name, value)}
              onTest={() => void testCredentials('lazada')}
              onSave={() => void saveCredentials('lazada')}
              onRemove={() => void removeCredentials('lazada')}
            />
            <MarketplaceCredentialForm
              provider="tiktokshop"
              title="TikTok Shop"
              status={settingsStatus?.providers.tiktokshop ?? null}
              fields={marketplaceCredentialFields.tiktokshop}
              values={drafts.tiktokshop}
              busy={credentialBusy}
              canSave={canSaveCredentials}
              ready={marketplaceCredentialsReady('tiktokshop')}
              onChange={(name, value) => updateMarketplaceDraft('tiktokshop', name, value)}
              onTest={() => void testCredentials('tiktokshop')}
              onSave={() => void saveCredentials('tiktokshop')}
              onRemove={() => void removeCredentials('tiktokshop')}
            />
          </div>
        )}
        {APP_MODE === 'demo' && (
          <p className="integration-capability-note">
            {t(
              'Kết nối sàn thật chỉ hoạt động ở chế độ Live và cần App credentials cùng access token do sàn cấp.',
              'Real marketplace connections are available in Live mode and require app credentials and a provider-issued access token.',
            )}
          </p>
        )}
        <p className="integration-capability-note">
          {t(
            'Nút kiểm tra gọi API chỉ đọc để xác minh tài khoản. Cấu hình token OAuth/thông tin ứng dụng được mã hóa trên máy chủ; việc đồng bộ đơn hàng/sản phẩm là luồng riêng.',
            'Connection tests call read-only seller APIs. OAuth tokens and app secrets are encrypted server-side; order/product sync is a separate workflow.',
          )}
        </p>
      </section>

      <section className="integration-settings-section">
        <header>
          <span className="integration-section-icon messaging">
            <MessageSquare size={17} aria-hidden="true" />
          </span>
          <div>
            <h4>{t('Mạng xã hội và hộp thư', 'Social and messaging channels')}</h4>
            <p>
              {t(
                'Kết nối tài khoản nhận tin và phản hồi khách hàng.',
                'Connect accounts for receiving and replying to customer messages.',
              )}
            </p>
          </div>
        </header>
        {connectionError && (
          <p className="integration-inline-error" role="alert">
            {connectionError}
          </p>
        )}
        {APP_MODE === 'live' && canManageIntegrations && (
          <div className="integration-credential-card integration-telegram-card">
            <div>
              <strong>Telegram Bot API</strong>
              <small>{sourceLabel('telegram')}</small>
            </div>
            <label>
              {t('Telegram bot token', 'Telegram bot token')}
              <input
                type="password"
                autoComplete="new-password"
                value={drafts.telegramToken}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, telegramToken: event.target.value }))
                }
                placeholder={
                  settingsStatus?.providers.telegram.configured
                    ? t('Đã có token · nhập để thay thế', 'Configured · enter to replace')
                    : t('Nhập bot token từ BotFather', 'Enter bot token from BotFather')
                }
              />
            </label>
            <div className="integration-credential-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={credentialBusy !== null || !drafts.telegramToken.trim()}
                onClick={() => void testCredentials('telegram')}
              >
                {credentialBusy === 'telegram'
                  ? t('Đang kiểm tra…', 'Testing…')
                  : t('Kiểm tra bot', 'Test bot')}
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  credentialBusy !== null || !canSaveCredentials || !drafts.telegramToken.trim()
                }
                onClick={() => void saveCredentials('telegram')}
              >
                {t('Lưu cấu hình', 'Save configuration')}
              </button>
              {settingsStatus?.providers.telegram.source === 'workspace' && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={credentialBusy !== null}
                  onClick={() => void removeCredentials('telegram')}
                >
                  {t('Ngắt kết nối', 'Disconnect')}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="integration-channel-grid">
          {SOCIAL_CHANNELS.map(channelRow)}
          {(['livechat', 'email'] as Channel[]).map(channelRow)}
        </div>
        <div className="integration-actions">
          <p>
            {t(
              'Telegram dùng bot token phía máy chủ và đồng bộ khi bấm thủ công. Các kênh khác cần OAuth/webhook chính thức trước khi hoạt động Live.',
              'Telegram uses a server-side bot token and syncs only on demand. Other channels need official OAuth/webhook integrations before Live use.',
            )}
          </p>
          {onManageChannels ? (
            <button className="button button-secondary" type="button" onClick={onManageChannels}>
              {t('Quản lý nguồn tin nhắn', 'Manage message sources')}
            </button>
          ) : (
            <Link className="button button-secondary" to="/inbox">
              {t('Mở Hộp thư', 'Open Inbox')}
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      <section className="integration-settings-section future">
        <header>
          <span className="integration-section-icon other">
            <Webhook size={17} aria-hidden="true" />
          </span>
          <div>
            <h4>
              {t('Thanh toán, vận chuyển và API ngoài', 'Payments, shipping, and external APIs')}
            </h4>
            <p>
              {t(
                'Chưa có connector Live. Mỗi tích hợp sẽ có trạng thái, quyền, kiểm tra kết nối và webhook riêng tại đây khi được triển khai.',
                'No Live connectors are available yet. Each integration will get its own status, permissions, connection test, and webhook settings here when implemented.',
              )}
            </p>
          </div>
        </header>
        <div className="integration-future-list">
          <span>
            <CreditCard size={14} aria-hidden="true" />
            {t('Cổng thanh toán', 'Payment gateways')}
          </span>
          <span>
            <Truck size={14} aria-hidden="true" />
            {t('Đơn vị vận chuyển', 'Shipping carriers')}
          </span>
          <span>
            <Webhook size={14} aria-hidden="true" />
            {t('Webhook và API tùy chỉnh', 'Webhooks and custom APIs')}
          </span>
        </div>
      </section>

      <p className="integration-footnote">
        {t(
          'Không hiển thị hoặc lưu API key ở localStorage. Chỉ owner/admin được quản lý tích hợp; không bật kết nối giả nếu backend chưa hỗ trợ.',
          'API keys are never displayed or stored in localStorage. Only owners/admins manage integrations; unsupported backends are not shown as connected.',
        )}
      </p>
    </div>
  )
}
