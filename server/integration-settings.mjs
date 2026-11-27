import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { DomainError, transaction } from './database.mjs'

const fail = (status, code, message) => {
  throw new DomainError(status, code, message)
}

const providerNames = ['gemini', 'telegram', 'shopee', 'lazada', 'tiktok', 'tiktokshop']
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

const cleanClientKey = (value, label) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value.trim()))
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
      tiktok: {
        clientKey: process.env.TIKTOK_CLIENT_KEY || '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
      },
      tiktokshop: {},
    },
    redirectUris = {
      tiktok: process.env.TIKTOK_REDIRECT_URI || '',
      tiktokshop: process.env.TIKTOK_SHOP_REDIRECT_URI || '',
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
  const insertOAuthState = db.prepare(
    `INSERT INTO tiktok_oauth_states(
      state_hash,tenant_id,user_id,provider,ciphertext,nonce,auth_tag,expires_at,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`,
  )
  const getOAuthState = db.prepare(
    'SELECT * FROM tiktok_oauth_states WHERE state_hash=? AND provider=?',
  )
  const removeOAuthState = db.prepare('DELETE FROM tiktok_oauth_states WHERE state_hash=?')

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
    if (provider === 'tiktok') {
      const fields = [
        'clientKey',
        'clientSecret',
        'accessToken',
        'refreshToken',
        'openId',
        'scope',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
      ]
      if (Object.keys(input).some((field) => !fields.includes(field)))
        fail(400, 'INVALID_FIELDS', 'Thông tin TikTok có trường không được hỗ trợ.')
      return {
        clientKey: cleanClientKey(input.clientKey, 'TikTok Client Key'),
        clientSecret: cleanSecret(input.clientSecret, 'TikTok Client Secret'),
        accessToken: cleanSecret(input.accessToken, 'TikTok access token'),
        refreshToken: optionalSecret(input.refreshToken, 'TikTok refresh token'),
        openId: cleanClientKey(input.openId, 'TikTok open ID'),
        scope: typeof input.scope === 'string' ? input.scope.slice(0, 1000) : '',
        accessTokenExpiresAt:
          typeof input.accessTokenExpiresAt === 'string' ? input.accessTokenExpiresAt : '',
        refreshTokenExpiresAt:
          typeof input.refreshTokenExpiresAt === 'string' ? input.refreshTokenExpiresAt : '',
      }
    }
    if (provider === 'tiktokshop') {
      const fields = [
        'appKey',
        'appSecret',
        'accessToken',
        'refreshToken',
        'shopCipher',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
      ]
      if (Object.keys(input).some((field) => !fields.includes(field)))
        fail(400, 'INVALID_FIELDS', 'Thông tin TikTok Shop có trường không được hỗ trợ.')
      return {
        appKey: cleanClientKey(input.appKey, 'TikTok Shop App Key'),
        appSecret: cleanSecret(input.appSecret, 'TikTok Shop App Secret'),
        accessToken: cleanSecret(input.accessToken, 'TikTok Shop access token'),
        refreshToken: optionalSecret(input.refreshToken, 'TikTok Shop refresh token'),
        shopCipher: optionalSecret(input.shopCipher, 'TikTok Shop shop cipher'),
        accessTokenExpiresAt:
          typeof input.accessTokenExpiresAt === 'string' ? input.accessTokenExpiresAt : '',
        refreshTokenExpiresAt:
          typeof input.refreshTokenExpiresAt === 'string' ? input.refreshTokenExpiresAt : '',
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
      } else if (provider === 'tiktok') {
        response = await fetchImpl(
          'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${credentials.accessToken}`,
            },
            ...timeout,
          },
        )
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
    if (provider === 'tiktok') {
      if (typeof result?.data?.user?.open_id !== 'string')
        fail(422, 'INTEGRATION_CREDENTIAL_REJECTED', 'TikTok không chấp nhận quyền người dùng.')
      return {
        accountName: safeAccountName(
          result.data.user.display_name,
          `TikTok ${result.data.user.open_id.slice(-6)}`,
        ),
      }
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
      shopCipher:
        typeof shops[0]?.cipher === 'string'
          ? shops[0].cipher
          : typeof shops[0]?.shop_cipher === 'string'
            ? shops[0].shop_cipher
            : '',
    }
  }

  const encryptWithAad = (aad, value) => {
    if (!key)
      fail(
        503,
        'INTEGRATION_STORAGE_NOT_CONFIGURED',
        'Cấu hình INTEGRATION_ENCRYPTION_KEY trên máy chủ trước khi lưu API key.',
      )
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(Buffer.from(aad))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return {
      ciphertext: ciphertext.toString('base64'),
      nonce: nonce.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    }
  }

  const encrypt = (tenantId, provider, credentials) =>
    encryptWithAad(`${tenantId}:${provider}`, credentials)

  const redirectUriFor = (provider) => {
    const redirectUri = redirectUris[provider]
    let parsed
    try {
      parsed = new URL(redirectUri)
    } catch {
      fail(503, 'OAUTH_REDIRECT_NOT_CONFIGURED', `Chưa cấu hình URL chuyển hướng ${provider}.`)
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      fail(503, 'OAUTH_REDIRECT_INVALID', `URL chuyển hướng ${provider} phải là HTTPS tĩnh.`)
    return parsed.href
  }

  const readOAuthCredentials = (row) => {
    if (!key)
      fail(503, 'INTEGRATION_STORAGE_NOT_CONFIGURED', 'Máy chủ chưa cấu hình khóa mã hóa tích hợp.')
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'))
      decipher.setAAD(Buffer.from(`${row.tenant_id}:oauth:${row.provider}:${row.state_hash}`))
      decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(row.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
      const credentials = JSON.parse(plaintext)
      if (!isRecord(credentials)) throw new Error('Invalid OAuth credentials')
      return credentials
    } catch {
      fail(500, 'OAUTH_STATE_UNREADABLE', 'Không thể xác minh yêu cầu OAuth đã bắt đầu.')
    }
  }

  const saveOAuthState = (actor, provider, credentials) => {
    const state = randomBytes(32).toString('base64url')
    const stateHash = createHash('sha256').update(state).digest('hex')
    const encrypted = encryptWithAad(
      `${actor.tenantId}:oauth:${provider}:${stateHash}`,
      credentials,
    )
    const createdAt = now()
    db.prepare('DELETE FROM tiktok_oauth_states WHERE expires_at<=?').run(createdAt.toISOString())
    insertOAuthState.run(
      stateHash,
      actor.tenantId,
      actor.userId,
      provider,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString(),
      createdAt.toISOString(),
    )
    return state
  }

  const consumeOAuthState = (provider, state) => {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(state))
      fail(400, 'OAUTH_STATE_INVALID', 'Yêu cầu OAuth không hợp lệ hoặc đã hết hạn.')
    const stateHash = createHash('sha256').update(state).digest('hex')
    const row = transaction(db, () => {
      const found = getOAuthState.get(stateHash, provider)
      if (found) removeOAuthState.run(stateHash)
      return found
    })
    if (!row || row.expires_at <= now().toISOString())
      fail(400, 'OAUTH_STATE_INVALID', 'Yêu cầu OAuth không hợp lệ hoặc đã hết hạn.')
    return { row, credentials: readOAuthCredentials(row) }
  }

  const readProviderJson = async (response, code) => {
    if (!response.ok) fail(502, code, 'Nhà cung cấp không chấp nhận yêu cầu OAuth.')
    try {
      return await response.json()
    } catch {
      fail(502, 'OAUTH_INVALID_RESPONSE', 'Nhà cung cấp trả về dữ liệu OAuth không hợp lệ.')
    }
  }

  const storeOAuthCredentials = (tenantId, provider, credentials, accountName) => {
    const encrypted = encrypt(tenantId, provider, credentials)
    const timestamp = now().toISOString()
    upsert.run(
      tenantId,
      provider,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      accountName,
      timestamp,
      timestamp,
    )
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
        tiktok: providerStatus('tiktok'),
        tiktokshop: providerStatus('tiktokshop'),
      },
    }
  }

  return {
    status,
    credentialsFor,
    beginOAuth(actor, provider, input) {
      requireAdmin(actor)
      if (!['tiktok', 'tiktokshop'].includes(provider))
        fail(404, 'INTEGRATION_NOT_FOUND', 'Nhà cung cấp không được hỗ trợ.')
      if (!isRecord(input)) fail(400, 'INVALID_FIELDS', 'Thông tin OAuth không hợp lệ.')
      const redirectUri = redirectUriFor(provider)
      let credentials
      let authorizationUrl
      if (provider === 'tiktok') {
        if (
          Object.keys(input).some(
            (field) => !['clientKey', 'clientSecret', 'scope', 'portalMode'].includes(field),
          )
        )
          fail(400, 'INVALID_FIELDS', 'TikTok OAuth có trường không được hỗ trợ.')
        const portalMode = input.portalMode === 'business_api' ? 'business_api' : 'login_kit'
        const scope =
          typeof input.scope === 'string' && input.scope.trim()
            ? input.scope.trim()
            : 'user.info.basic'
        credentials = {
          clientKey: cleanClientKey(
            input.clientKey || defaults.tiktok?.clientKey,
            'TikTok Client Key',
          ),
          clientSecret: cleanSecret(
            input.clientSecret || defaults.tiktok?.clientSecret,
            'TikTok Client Secret',
          ),
          redirectUri,
          portalMode,
        }
        if (portalMode === 'business_api') {
          authorizationUrl = new URL('https://business-api.tiktok.com/portal/auth')
          authorizationUrl.search = new URLSearchParams({
            app_id: credentials.clientKey,
            redirect_uri: redirectUri,
            state: '',
          }).toString()
        } else {
          authorizationUrl = new URL('https://www.tiktok.com/v2/auth/authorize/')
          authorizationUrl.search = new URLSearchParams({
            client_key: credentials.clientKey,
            response_type: 'code',
            scope,
            redirect_uri: redirectUri,
            state: '',
          }).toString()
        }
      } else {
        if (Object.keys(input).some((field) => !['appKey', 'appSecret'].includes(field)))
          fail(400, 'INVALID_FIELDS', 'TikTok Shop OAuth chỉ nhận App Key và App Secret.')
        credentials = {
          appKey: cleanClientKey(input.appKey, 'TikTok Shop App Key'),
          appSecret: cleanSecret(input.appSecret, 'TikTok Shop App Secret'),
          redirectUri,
        }
        authorizationUrl = new URL('https://services.tiktokshop.com/open/authorize')
        authorizationUrl.search = new URLSearchParams({
          service_id: process.env.TIKTOK_SHOP_SERVICE_ID || credentials.appKey,
          state: '',
        }).toString()
      }
      const state = saveOAuthState(actor, provider, credentials)
      authorizationUrl.searchParams.set('state', state)
      return { authorizationUrl: authorizationUrl.href }
    },
    async completeOAuth(provider, params) {
      if (!['tiktok', 'tiktokshop'].includes(provider))
        fail(404, 'INTEGRATION_NOT_FOUND', 'Nhà cung cấp không được hỗ trợ.')
      for (const name of ['state', 'code', 'error'])
        if (params.getAll(name).length > 1)
          fail(400, 'OAUTH_CALLBACK_INVALID', 'Phản hồi OAuth có tham số lặp.')
      const { row, credentials } = consumeOAuthState(provider, params.get('state'))
      const initiator = db
        .prepare('SELECT role,active FROM users WHERE id=? AND tenant_id=?')
        .get(row.user_id, row.tenant_id)
      if (!initiator || initiator.active !== 1 || !['owner', 'admin'].includes(initiator.role))
        fail(403, 'FORBIDDEN', 'Người bắt đầu kết nối không còn quyền quản lý tích hợp.')
      if (params.get('error'))
        fail(400, 'OAUTH_DENIED', 'Bạn đã hủy hoặc TikTok từ chối yêu cầu kết nối.')
      const code = params.get('code') || params.get('auth_code')
      if (typeof code !== 'string' || !code.trim() || code.length > 4096 || hasControls(code))
        fail(400, 'OAUTH_CODE_INVALID', 'TikTok không trả về mã ủy quyền hợp lệ.')
      const redirectUri = credentials.redirectUri
      const timeout = { signal: AbortSignal.timeout(10000) }
      let accountName
      let savedCredentials
      if (provider === 'tiktok') {
        if (credentials.portalMode === 'business_api') {
          let response
          try {
            response = await fetchImpl(
              'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
              {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  app_id: credentials.clientKey,
                  secret: credentials.clientSecret,
                  auth_code: code,
                }),
                ...timeout,
              },
            )
          } catch {
            fail(
              502,
              'OAUTH_EXCHANGE_FAILED',
              'Không thể đổi mã OAuth TikTok Business API. Hãy thử lại.',
            )
          }
          const bizJson = await readProviderJson(response, 'OAUTH_EXCHANGE_FAILED')
          const accessToken = bizJson?.data?.access_token
          if (typeof accessToken !== 'string' || !accessToken.trim()) {
            fail(
              502,
              'OAUTH_INVALID_RESPONSE',
              `TikTok Business API từ chối mã auth_code: ${bizJson?.message || 'Không có access_token'}`,
            )
          }
          const advertiserIds = Array.isArray(bizJson?.data?.advertiser_ids)
            ? bizJson.data.advertiser_ids.map(String)
            : []
          const openId = advertiserIds[0] || `biz_${Date.now()}`
          savedCredentials = {
            clientKey: credentials.clientKey,
            clientSecret: credentials.clientSecret,
            accessToken: cleanSecret(accessToken, 'TikTok access token'),
            refreshToken: '',
            openId: cleanClientKey(openId, 'TikTok open ID'),
            scope: Array.isArray(bizJson?.data?.scope) ? bizJson.data.scope.join(',') : '',
            accessTokenExpiresAt: '',
            refreshTokenExpiresAt: '',
          }
          accountName = `TikTok Business (${openId})`
        } else {
          const body = new URLSearchParams({
            client_key: credentials.clientKey,
            client_secret: credentials.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          })
          let response
          try {
            response = await fetchImpl('https://open.tiktokapis.com/v2/oauth/token/', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body,
              ...timeout,
            })
          } catch {
            fail(
              502,
              'OAUTH_EXCHANGE_FAILED',
              'Không thể đổi mã OAuth TikTok. Hãy thử kết nối lại.',
            )
          }
          const token = await readProviderJson(response, 'OAUTH_EXCHANGE_FAILED')
          if (
            token?.error ||
            typeof token?.access_token !== 'string' ||
            typeof token?.refresh_token !== 'string' ||
            typeof token?.open_id !== 'string' ||
            !Number.isFinite(token?.expires_in) ||
            !Number.isFinite(token?.refresh_expires_in)
          )
            fail(502, 'OAUTH_INVALID_RESPONSE', 'TikTok trả về thông tin tài khoản không hợp lệ.')
          const openId = cleanClientKey(token.open_id, 'TikTok open ID')
          savedCredentials = {
            clientKey: credentials.clientKey,
            clientSecret: credentials.clientSecret,
            accessToken: cleanSecret(token.access_token, 'TikTok access token'),
            refreshToken: cleanSecret(token.refresh_token, 'TikTok refresh token'),
            openId,
            scope: typeof token.scope === 'string' ? token.scope.slice(0, 1000) : '',
            accessTokenExpiresAt: new Date(
              now().getTime() + Number(token.expires_in) * 1000,
            ).toISOString(),
            refreshTokenExpiresAt: new Date(
              now().getTime() + Number(token.refresh_expires_in) * 1000,
            ).toISOString(),
          }
          const accountSuffix = openId.replace(/[^A-Za-z0-9]/g, '').slice(-6)
          accountName = `TikTok account ${accountSuffix}`
        }
      } else {
        const tokenUrl = new URL('https://auth.tiktok-shops.com/api/v2/token/get')
        tokenUrl.search = new URLSearchParams({
          app_key: credentials.appKey,
          app_secret: credentials.appSecret,
          auth_code: code,
          grant_type: 'authorized_code',
        }).toString()
        let response
        try {
          response = await fetchImpl(tokenUrl, {
            headers: { Accept: 'application/json' },
            ...timeout,
          })
        } catch {
          fail(502, 'OAUTH_EXCHANGE_FAILED', 'Không thể đổi mã OAuth TikTok Shop. Hãy thử lại.')
        }
        const token = await readProviderJson(response, 'OAUTH_EXCHANGE_FAILED')
        if (
          !token?.data ||
          !['0', 0].includes(token.code) ||
          typeof token.data.access_token !== 'string' ||
          typeof token.data.refresh_token !== 'string'
        )
          fail(502, 'OAUTH_INVALID_RESPONSE', 'TikTok Shop trả về thông tin token không hợp lệ.')
        savedCredentials = {
          appKey: credentials.appKey,
          appSecret: credentials.appSecret,
          accessToken: cleanSecret(token.data.access_token, 'TikTok Shop access token'),
          refreshToken: cleanSecret(token.data.refresh_token, 'TikTok Shop refresh token'),
          shopCipher: '',
          accessTokenExpiresAt: String(token.data.access_token_expire_in ?? ''),
          refreshTokenExpiresAt: String(token.data.refresh_token_expire_in ?? ''),
        }
        const shop = await checkProvider('tiktokshop', savedCredentials)
        savedCredentials.shopCipher = shop.shopCipher
        accountName = shop.accountName
      }
      storeOAuthCredentials(row.tenant_id, provider, savedCredentials, accountName)
      return { provider, accountName }
    },
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
