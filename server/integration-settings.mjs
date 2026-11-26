import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { DomainError } from './database.mjs'

const fail = (status, code, message) => {
  throw new DomainError(status, code, message)
}

const providerNames = ['gemini', 'telegram', 'shopee', 'lazada', 'tiktokshop']
const providers = new Set(providerNames)
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasControls = (value) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127
  })

const keyFromBase64 = (value) => {
  if (typeof value !== 'string') return null
  const key = Buffer.from(value, 'base64')
  return key.length === 32 && key.toString('base64') === value ? key : null
}

const cleanSecret = (value, label) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < 8 ||
    value.length > 2000 ||
    hasControls(value)
  )
    fail(422, 'INVALID_CREDENTIAL', `${label} không hợp lệ.`)
  return value.trim()
}

const cleanId = (value, label) => {
  if (typeof value !== 'string' || !/^\d{1,30}$/.test(value.trim()))
    fail(422, 'INVALID_CREDENTIAL', `${label} không hợp lệ.`)
  return value.trim()
}

const optionalSecret = (value, label) =>
  value === undefined || value === '' ? '' : cleanSecret(value, label)

const safeAccountName = (value, fallback) =>
  typeof value === 'string' && value.trim()
    ? Array.from(value)
        .filter((character) => {
          const code = character.charCodeAt(0)
          return (code >= 32 && code !== 127) || code === 9
        })
        .join('')
        .trim()
        .slice(0, 120)
    : fallback

const sign = (secret, value, uppercase = false) => {
  const digest = createHmac('sha256', secret).update(value).digest('hex')
  return uppercase ? digest.toUpperCase() : digest
}

export function createIntegrationSettings(
  db,
  {
    encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY,
    fetchImpl = globalThis.fetch,
    defaults = {
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      },
      telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN || '' },
      shopee: {},
      lazada: {},
      tiktokshop: {},
    },
    now = () => new Date(),
  } = {},
) {
  const key = keyFromBase64(encryptionKey)
  const getRow = db.prepare(
    'SELECT ciphertext,nonce,auth_tag,account_name FROM integration_credentials WHERE tenant_id=? AND provider=?',
  )
  const upsert = db.prepare(
    `INSERT INTO integration_credentials(tenant_id,provider,ciphertext,nonce,auth_tag,account_name,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(tenant_id,provider) DO UPDATE SET
       ciphertext=excluded.ciphertext,nonce=excluded.nonce,auth_tag=excluded.auth_tag,
       account_name=excluded.account_name,
       updated_at=excluded.updated_at`,
  )
  const removeRow = db.prepare(
    'DELETE FROM integration_credentials WHERE tenant_id=? AND provider=?',
  )

  const requireAdmin = (actor) => {
    if (!actor?.tenantId || !actor?.userId || !['owner', 'admin'].includes(actor.role))
      fail(403, 'FORBIDDEN', 'Chỉ owner/admin có thể quản lý tích hợp.')
  }
  const providerName = (provider) => {
    if (!providers.has(provider))
      fail(404, 'INTEGRATION_NOT_FOUND', 'Nhà cung cấp không được hỗ trợ.')
    return provider
  }
  const readStored = (actor, provider) => {
    const row = getRow.get(actor.tenantId, provider)
    if (!row) return null
    if (!key)
      fail(503, 'INTEGRATION_STORAGE_NOT_CONFIGURED', 'Máy chủ chưa cấu hình khóa mã hóa tích hợp.')
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'))
      decipher.setAAD(Buffer.from(`${actor.tenantId}:${provider}`))
      decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(row.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
      const credentials = JSON.parse(plaintext)
      if (!isRecord(credentials)) throw new Error('Invalid credentials payload')
      return credentials
    } catch {
      fail(500, 'INTEGRATION_CREDENTIALS_UNREADABLE', 'Không thể giải mã cấu hình tích hợp đã lưu.')
    }
  }
  const credentialsFor = (actor, provider) =>
    readStored(actor, provider) ?? defaults[provider] ?? {}

  const normalizeInput = (provider, input) => {
    if (!isRecord(input)) fail(400, 'INVALID_FIELDS', 'Thông tin kết nối không hợp lệ.')
    if (provider === 'gemini') {
      if (Object.keys(input).some((field) => !['apiKey', 'model'].includes(field)))
        fail(400, 'INVALID_FIELDS', 'Chỉ chấp nhận apiKey và model.')
      const model =
        input.model === undefined
          ? defaults.gemini?.model || 'gemini-3.8-flash'
          : typeof input.model === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(input.model.trim())
            ? input.model.trim()
            : null
      if (!model) fail(422, 'INVALID_CREDENTIAL', 'Tên mô hình Gemini không hợp lệ.')
      return { apiKey: cleanSecret(input.apiKey, 'Gemini API key'), model }
    }
    if (provider === 'shopee') {
      const fields = ['partnerId', 'partnerKey', 'shopId', 'accessToken', 'refreshToken']
      if (Object.keys(input).some((field) => !fields.includes(field)))
        fail(400, 'INVALID_FIELDS', 'Thông tin Shopee có trường không được hỗ trợ.')
      return {
        partnerId: cleanId(input.partnerId, 'Shopee Partner ID'),
        partnerKey: cleanSecret(input.partnerKey, 'Shopee Partner Key'),
        shopId: cleanId(input.shopId, 'Shopee Shop ID'),
        accessToken: cleanSecret(input.accessToken, 'Shopee access token'),
        refreshToken: optionalSecret(input.refreshToken, 'Shopee refresh token'),
      }
    }
    if (provider === 'lazada') {
      const fields = ['appKey', 'appSecret', 'accessToken', 'refreshToken', 'region']
      if (Object.keys(input).some((field) => !fields.includes(field)))
        fail(400, 'INVALID_FIELDS', 'Thông tin Lazada có trường không được hỗ trợ.')
      const region = input.region === undefined ? 'vn' : input.region
      if (!['vn', 'sg', 'my', 'id', 'th', 'ph'].includes(region))
        fail(422, 'INVALID_CREDENTIAL', 'Khu vực Lazada không hợp lệ.')
      return {
        appKey: cleanId(input.appKey, 'Lazada App Key'),
        appSecret: cleanSecret(input.appSecret, 'Lazada App Secret'),
        accessToken: cleanSecret(input.accessToken, 'Lazada access token'),
        refreshToken: optionalSecret(input.refreshToken, 'Lazada refresh token'),
        region,
      }
    }
    if (provider === 'tiktokshop') {
      const fields = ['appKey', 'appSecret', 'accessToken', 'shopCipher']
      if (Object.keys(input).some((field) => !fields.includes(field)))
        fail(400, 'INVALID_FIELDS', 'Thông tin TikTok Shop có trường không được hỗ trợ.')
      return {
        appKey: cleanId(input.appKey, 'TikTok Shop App Key'),
        appSecret: cleanSecret(input.appSecret, 'TikTok Shop App Secret'),
        accessToken: cleanSecret(input.accessToken, 'TikTok Shop access token'),
        shopCipher: optionalSecret(input.shopCipher, 'TikTok Shop shop cipher'),
      }
    }
    if (Object.keys(input).some((field) => field !== 'botToken'))
      fail(400, 'INVALID_FIELDS', 'Chỉ chấp nhận botToken.')
    const botToken = cleanSecret(input.botToken, 'Telegram bot token')
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken))
      fail(422, 'INVALID_CREDENTIAL', 'Telegram bot token không đúng định dạng.')
    return { botToken }
  }

  const checkProvider = async (provider, credentials) => {
    if (typeof fetchImpl !== 'function')
      fail(503, 'INTEGRATION_TEST_UNAVAILABLE', 'Máy chủ không hỗ trợ kiểm tra kết nối.')
    const timeout = { signal: AbortSignal.timeout(10000) }
    let response
    try {
      if (provider === 'gemini') {
        response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { Accept: 'application/json', 'x-goog-api-key': credentials.apiKey },
          ...timeout,
        })
      } else if (provider === 'telegram') {
        response = await fetchImpl(`https://api.telegram.org/bot${credentials.botToken}/getMe`, {
          headers: { Accept: 'application/json' },
          ...timeout,
        })
      } else if (provider === 'shopee') {
        const path = '/api/v2/shop/get_shop_info'
        const timestamp = Math.floor(now().getTime() / 1000)
        const signature = sign(
          credentials.partnerKey,
          `${credentials.partnerId}${path}${timestamp}${credentials.accessToken}${credentials.shopId}`,
        )
        const url = new URL(`https://partner.shopeemobile.com${path}`)
        url.search = new URLSearchParams({
          partner_id: credentials.partnerId,
          timestamp: String(timestamp),
          access_token: credentials.accessToken,
          shop_id: credentials.shopId,
          sign: signature,
        }).toString()
        response = await fetchImpl(url, {
          headers: { Accept: 'application/json' },
          ...timeout,
        })
      } else if (provider === 'lazada') {
        const path = '/seller/get'
        const timestamp = String(now().getTime())
        const parameters = {
          app_key: credentials.appKey,
          timestamp,
          sign_method: 'hmac',
          access_token: credentials.accessToken,
        }
        const canonical = `${path}${Object.keys(parameters)
          .sort()
          .map((key) => `${key}${parameters[key]}`)
          .join('')}`
        const parametersWithSignature = {
          ...parameters,
          sign: sign(credentials.appSecret, canonical, true),
        }
        const hosts = {
          vn: 'api.lazada.vn',
          sg: 'api.lazada.sg',
          my: 'api.lazada.com.my',
          id: 'api.lazada.co.id',
          th: 'api.lazada.co.th',
          ph: 'api.lazada.com.ph',
        }
        const url = new URL(`https://${hosts[credentials.region]}/rest${path}`)
        url.search = new URLSearchParams(parametersWithSignature).toString()
        response = await fetchImpl(url, {
          headers: { Accept: 'application/json' },
          ...timeout,
        })
      } else {
        const path = '/authorization/202309/shops'
        const timestamp = String(Math.floor(now().getTime() / 1000))
        const parameters = { app_key: credentials.appKey, timestamp }
        const canonical = `${path}${Object.keys(parameters)
          .sort()
          .map((key) => `${key}${parameters[key]}`)
          .join('')}`
        const signature = sign(
          credentials.appSecret,
          `${credentials.appSecret}${canonical}${credentials.appSecret}`,
        )
        const url = new URL(`https://open-api.tiktokglobalshop.com${path}`)
        url.search = new URLSearchParams({ ...parameters, sign: signature }).toString()
        response = await fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'x-tts-access-token': credentials.accessToken,
            'x-tts-app-key': credentials.appKey,
            'x-tts-timestamp': timestamp,
            'x-tts-signature': signature,
          },
          ...timeout,
        })
      }
    } catch {
      fail(502, 'INTEGRATION_TEST_FAILED', 'Không thể kết nối nhà cung cấp. Hãy thử lại.')
    }
    if (!response.ok)
      fail(422, 'INTEGRATION_CREDENTIAL_REJECTED', 'Nhà cung cấp từ chối thông tin xác thực.')
    let result
    try {
      result = await response.json()
    } catch {
      fail(502, 'INTEGRATION_INVALID_RESPONSE', 'Nhà cung cấp trả về dữ liệu không hợp lệ.')
    }
    if (provider === 'gemini') {
      if (!Array.isArray(result?.models))
        fail(422, 'INTEGRATION_CREDENTIAL_REJECTED', 'Gemini không chấp nhận API key này.')
      return { accountName: 'Google Gemini' }
    }
    if (provider === 'telegram') {
      if (result?.ok !== true || result.result?.is_bot !== true)
        fail(422, 'INTEGRATION_CREDENTIAL_REJECTED', 'Token không phải bot Telegram hợp lệ.')
      return { accountName: `@${safeAccountName(result.result.username, 'Telegram bot')}` }
    }
    if (provider === 'shopee') {
      if (!isRecord(result?.response) || result.error)
        fail(
          422,
          'INTEGRATION_CREDENTIAL_REJECTED',
          'Shopee không chấp nhận thông tin kết nối này.',
        )
      return {
        accountName: safeAccountName(
          result.response.shop_name,
          `Shopee shop ${credentials.shopId}`,
        ),
      }
    }
    if (provider === 'lazada') {
      if (!isRecord(result?.data) || (result.code && !['0', 0].includes(result.code)))
        fail(
          422,
          'INTEGRATION_CREDENTIAL_REJECTED',
          'Lazada không chấp nhận thông tin kết nối này.',
        )
      return {
        accountName: safeAccountName(
          result.data.name || result.data.shop_name || result.data.seller_name,
          'Lazada seller',
        ),
      }
    }
    const shops = result?.data?.shops
    if (
      !Array.isArray(shops) ||
      !shops.length ||
      (result.code !== undefined && !['0', 0].includes(result.code))
    )
      fail(422, 'INTEGRATION_CREDENTIAL_REJECTED', 'TikTok Shop không trả về shop được cấp quyền.')
    return {
      accountName: safeAccountName(shops[0]?.shop_name || shops[0]?.shop_id, 'TikTok Shop'),
    }
  }

  const encrypt = (tenantId, provider, credentials) => {
    if (!key)
      fail(
        503,
        'INTEGRATION_STORAGE_NOT_CONFIGURED',
        'Cấu hình INTEGRATION_ENCRYPTION_KEY trên máy chủ trước khi lưu API key.',
      )
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(Buffer.from(`${tenantId}:${provider}`))
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ])
    return {
      ciphertext: ciphertext.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    }
  }

  const status = (actor) => {
    requireAdmin(actor)
    const saved = Object.fromEntries(
      providerNames.map((provider) => [provider, getRow.get(actor.tenantId, provider)]),
    )
    const geminiModel =
      saved.gemini && key
        ? credentialsFor(actor, 'gemini').model
        : defaults.gemini?.model || 'gemini-3.8-flash'
    const providerStatus = (provider, defaultConfigured = false) => ({
      configured: Boolean(saved[provider] || defaultConfigured),
      source: saved[provider] ? 'workspace' : 'server',
      accountName: saved[provider]?.account_name || null,
    })
    return {
      canSaveCredentials: Boolean(key),
      encryptionKeyConfigured: Boolean(key),
      providers: {
        gemini: {
          ...providerStatus('gemini', Boolean(defaults.gemini?.apiKey)),
          model: geminiModel,
        },
        telegram: providerStatus('telegram', Boolean(defaults.telegram?.botToken)),
        shopee: providerStatus('shopee'),
        lazada: providerStatus('lazada'),
        tiktokshop: providerStatus('tiktokshop'),
      },
    }
  }

  return {
    status,
    credentialsFor,
    async test(actor, provider, input) {
      requireAdmin(actor)
      const name = providerName(provider)
      const credentials = normalizeInput(name, input)
      const { accountName } = await checkProvider(name, credentials)
      return { provider: name, accountName, tested: true }
    },
    async save(actor, provider, input) {
      requireAdmin(actor)
      const name = providerName(provider)
      if (!key)
        fail(
          503,
          'INTEGRATION_STORAGE_NOT_CONFIGURED',
          'Cấu hình INTEGRATION_ENCRYPTION_KEY trên máy chủ trước khi lưu API key.',
        )
      const savedGemini =
        name === 'gemini' &&
        isRecord(input) &&
        input.apiKey === '' &&
        typeof input.model === 'string'
          ? readStored(actor, 'gemini')
          : null
      const credentials = savedGemini
        ? normalizeInput('gemini', { apiKey: savedGemini.apiKey, model: input.model })
        : normalizeInput(name, input)
      const connection = await checkProvider(name, credentials)
      const encrypted = encrypt(actor.tenantId, name, credentials)
      const timestamp = now().toISOString()
      upsert.run(
        actor.tenantId,
        name,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authTag,
        connection.accountName,
        timestamp,
        timestamp,
      )
      return { provider: name, accountName: connection.accountName, status: status(actor) }
    },
    remove(actor, provider) {
      requireAdmin(actor)
      const name = providerName(provider)
      removeRow.run(actor.tenantId, name)
      return status(actor)
    },
  }
}
