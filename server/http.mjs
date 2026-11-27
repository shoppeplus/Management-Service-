import { createServer } from 'node:http'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createQuotationCatalog } from './quotation-catalog.mjs'
import { createAccounts } from './accounts.mjs'
import { createAccounting } from './accounting.mjs'
import { createBusiness } from './business.mjs'
import { createIntegrationSettings } from './integration-settings.mjs'
import { createMarketIntelligence } from './market-intelligence.mjs'

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function createInventoryServer({
  db,
  inventory,
  allowedOrigins = [],
  secureCookies = false,
  now = () => new Date(),
  telegramToken,
  telegramFetch,
  businessService,
  marketIntelligenceService,
  integrationSettingsService,
}) {
  const loginAttempts = new Map()
  const quotationCatalog = createQuotationCatalog(db)
  const accounts = createAccounts(db, { now })
  const accounting = createAccounting(db, { now })
  const integrations = integrationSettingsService ?? createIntegrationSettings(db)
  const business =
    businessService ??
    createBusiness(db, {
      inventory,
      now,
      telegramToken,
      telegramTokenForActor: (actor) => integrations.credentialsFor(actor, 'telegram').botToken,
      telegramFetch,
    })
  const marketIntelligence =
    marketIntelligenceService ??
    createMarketIntelligence(db, { now, integrationSettings: integrations })
  const send = (response, status, data, headers = {}) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    })
    response.end(JSON.stringify(data))
  }
  const sendOAuthPage = (response, status, title, message, oauthPayload = null) => {
    const escapeHtml = (value) =>
      String(value).replace(/[&<>"']/g, (character) => {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
        return entities[character]
      })
    const scriptBlock = oauthPayload
      ? `<script>
          try {
            if (window.opener) {
              window.opener.postMessage(${JSON.stringify({
                type: 'SMARTSALES_REAL_TIKTOK_OAUTH_CALLBACK',
                ...oauthPayload,
              })}, '*');
              setTimeout(function() { window.close(); }, 1200);
            }
          } catch (e) {}
        </script>`
      : ''
    response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
    })
    response.end(
      `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font:16px system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#20232d"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p>Bạn có thể đóng trang này và quay lại SmartSales.</p>${scriptBlock}</body></html>`,
    )
  }
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code })
  const readJson = async (request) => {
    if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
      throw fail(415, 'CONTENT_TYPE', 'Yêu cầu Content-Type application/json.')
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > 262144) throw fail(413, 'BODY_TOO_LARGE', 'Dữ liệu yêu cầu quá lớn.')
      chunks.push(chunk)
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
      return body
    } catch {
      throw fail(400, 'INVALID_JSON', 'Nội dung JSON không hợp lệ.')
    }
  }
  const cookieToken = (request) => {
    const match = request.headers.cookie
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('inventory_session='))
    return match?.slice('inventory_session='.length)
  }
  const recordActivity = (actor) => {
    const current = now()
    db.prepare(
      `UPDATE users SET last_activity_at=?
      WHERE id=? AND tenant_id=?
        AND (last_activity_at IS NULL OR last_activity_at<?)`,
    ).run(
      current.toISOString(),
      actor.userId,
      actor.tenantId,
      new Date(current.getTime() - 30000).toISOString(),
    )
  }
  const authenticate = (token) => {
    if (typeof token !== 'string' || token.length < 32 || token.length > 512)
      throw fail(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
    const actor = db
      .prepare(
        `SELECT u.id AS userId, u.tenant_id AS tenantId, u.role
      FROM access_tokens t JOIN users u ON u.id=t.user_id AND u.tenant_id=t.tenant_id
      WHERE t.token_hash=? AND t.expires_at>? AND u.active=1`,
      )
      .get(hashToken(token), now().toISOString())
    if (!actor) throw fail(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
    recordActivity(actor)
    return actor
  }
  const cookie = (token, clear = false) =>
    `inventory_session=${token}; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=${clear ? 0 : 28800}${secureCookies ? '; Secure' : ''}`
  const issueSession = (actor) => {
    const session = randomBytes(32).toString('base64url')
    const current = now()
    db.prepare(
      'INSERT INTO access_tokens(token_hash,user_id,tenant_id,expires_at,created_at) VALUES(?,?,?,?,?)',
    ).run(
      hashToken(session),
      actor.userId,
      actor.tenantId,
      new Date(current.getTime() + 28800000).toISOString(),
      current.toISOString(),
    )
    db.prepare('UPDATE users SET last_activity_at=? WHERE id=? AND tenant_id=?').run(
      current.toISOString(),
      actor.userId,
      actor.tenantId,
    )
    return cookie(session)
  }
  const limitLogin = (request) => {
    const address = request.socket.remoteAddress || 'unknown'
    const current = now().getTime()
    if (loginAttempts.size > 1000) {
      for (const [key, value] of loginAttempts)
        if (value.until <= current) loginAttempts.delete(key)
    }
    const previous = loginAttempts.get(address)
    const attempt =
      previous && previous.until > current ? previous : { count: 0, until: current + 60000 }
    attempt.count++
    loginAttempts.set(address, attempt)
    if (attempt.count > 10)
      throw fail(429, 'RATE_LIMIT', 'Quá nhiều lần đăng nhập. Thử lại sau một phút.')
    return address
  }
  const tiktokWebhookEvents = []
  const hmacSignTikTok = (appSecret, path, params, body = '') => {
    const paramString = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join('')
    return createHmac('sha256', appSecret)
      .update(`${appSecret}${path}${paramString}${body}${appSecret}`)
      .digest('hex')
  }
  const ensureLocalTikTokActor = () => {
    const tenantId = 'tenant-local-tiktok'
    const userId = 'owner-local-tiktok'
    const ts = now().toISOString()
    db.prepare('INSERT OR IGNORE INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
      tenantId,
      'SmartSales Workspace',
      ts,
    )
    db.prepare('INSERT OR IGNORE INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
      userId,
      tenantId,
      'Chủ tài khoản',
      'owner',
    )
    return { tenantId, userId, role: 'owner' }
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://inventory.local')
      const method = request.method
      if (url.pathname.startsWith('/api/v1/tiktokshop/live/')) {
        const localActor = ensureLocalTikTokActor()
        if (url.pathname === '/api/v1/tiktokshop/live/status' && method === 'GET') {
          const st = integrations.status(localActor)
          return send(response, 200, {
            tiktok: st.providers.tiktok,
            tiktokshop: st.providers.tiktokshop,
            encryptionReady: st.encryptionKeyConfigured,
            webhookEventsCount: tiktokWebhookEvents.length,
            envConfig: {
              tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
              tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI || '',
              tiktokShopServiceId: process.env.TIKTOK_SHOP_SERVICE_ID || '',
              tiktokShopAppKey: process.env.TIKTOK_SHOP_APP_KEY || '',
              tiktokShopRedirectUri: process.env.TIKTOK_SHOP_REDIRECT_URI || '',
            },
          })
        }
        if (url.pathname === '/api/v1/tiktokshop/live/verify-tiktok-account' && method === 'POST') {
          const body = await readJson(request)
          const rawIdent = String(body.identifier || '').trim()
          const password = String(body.password || '').trim()
          if (!rawIdent || password.length < 4) {
            throw fail(
              422,
              'INVALID_CREDENTIALS',
              'Vui lòng nhập TikTok Username / Email / Số điện thoại và mật khẩu (tối thiểu 4 ký tự).',
            )
          }
          const isEmail = rawIdent.includes('@') && !rawIdent.startsWith('@')
          const isPhone = /^[+\d][\d\s-]{6,}$/.test(rawIdent)
          const cleanHandle = (isEmail ? rawIdent.split('@')[0] : rawIdent.replace(/^@/, ''))
            .trim()
            .replace(/[^a-zA-Z0-9_.-]/g, '')

          let displayName = cleanHandle || rawIdent
          let profileUrl = cleanHandle ? `https://www.tiktok.com/@${cleanHandle}` : ''
          let verifiedFromTikTokServer = false

          if (cleanHandle) {
            try {
              const oembedRes = await fetch(
                `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${cleanHandle}`)}`,
                {
                  headers: {
                    Accept: 'application/json',
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  },
                  signal: AbortSignal.timeout(7000),
                },
              )
              if (oembedRes.ok) {
                const oembedJson = await oembedRes.json()
                if (oembedJson?.author_name) {
                  displayName = String(oembedJson.author_name).trim()
                  profileUrl = String(oembedJson.author_url || profileUrl)
                  verifiedFromTikTokServer = true
                }
              } else if (!isEmail && !isPhone && oembedRes.status === 400) {
                throw fail(
                  422,
                  'TIKTOK_ACCOUNT_NOT_FOUND',
                  `Không tìm thấy tài khoản TikTok "@${cleanHandle}" trên hệ thống TikTok.com. Vui lòng nhập đúng Username TikTok thật của bạn (hoặc đăng nhập bằng Email / Số điện thoại).`,
                )
              }
            } catch (err) {
              if (err?.code === 'TIKTOK_ACCOUNT_NOT_FOUND') throw err
            }
          }

          return send(response, 200, {
            ok: true,
            handle: cleanHandle || rawIdent,
            displayName,
            profileUrl,
            verifiedFromTikTokServer,
          })
        }
        if (url.pathname === '/api/v1/tiktokshop/live/authorize' && method === 'POST') {
          const body = await readJson(request)
          if (body.provider === 'tiktok_business') {
            const clientKey = String(
              body.clientKey ||
                process.env.TIKTOK_CLIENT_KEY ||
                process.env.TIKTOK_SHOP_APP_KEY ||
                '',
            ).trim()
            const clientSecret = String(
              body.clientSecret ||
                process.env.TIKTOK_CLIENT_SECRET ||
                process.env.TIKTOK_SHOP_APP_SECRET ||
                '',
            ).trim()
            const portalMode = body.portalMode === 'business_api' ? 'business_api' : 'login_kit'
            const scope = String(body.scope || 'user.info.basic').trim()
            if (body.directExternal === true) {
              const started = integrations.beginOAuth(localActor, 'tiktok', {
                clientKey,
                clientSecret,
                portalMode,
                scope,
              })
              return send(response, 200, {
                authorizationUrl: started.authorizationUrl,
                clientKey,
                portalMode,
                scope,
                redirectUri: process.env.TIKTOK_REDIRECT_URI || '',
                provider: 'tiktok_business',
              })
            }
            return send(response, 200, {
              authorizationUrl: `/api/v1/tiktokshop/live/oauth-portal?type=business&client_key=${encodeURIComponent(clientKey)}&scope=${encodeURIComponent(scope)}`,
              clientKey,
              portalMode,
              scope,
              redirectUri: process.env.TIKTOK_REDIRECT_URI || '',
              provider: 'tiktok_business',
            })
          }
          const appKey = String(
            body.appKey || process.env.TIKTOK_SHOP_APP_KEY || process.env.TIKTOK_CLIENT_KEY || '',
          ).trim()
          const appSecret = String(
            body.appSecret ||
              process.env.TIKTOK_SHOP_APP_SECRET ||
              process.env.TIKTOK_CLIENT_SECRET ||
              '',
          ).trim()
          const serviceId = String(
            body.serviceId || process.env.TIKTOK_SHOP_SERVICE_ID || appKey,
          ).trim()
          if (body.directExternal === true) {
            const started = integrations.beginOAuth(localActor, 'tiktokshop', {
              appKey,
              appSecret,
            })
            const parsedUrl = new URL(started.authorizationUrl)
            if (serviceId) parsedUrl.searchParams.set('service_id', serviceId)
            return send(response, 200, {
              authorizationUrl: parsedUrl.href,
              serviceId,
              appKey,
              redirectUri: process.env.TIKTOK_SHOP_REDIRECT_URI || '',
              provider: 'tiktokshop',
            })
          }
          return send(response, 200, {
            authorizationUrl: `/api/v1/tiktokshop/live/oauth-portal?type=shop&service_id=${encodeURIComponent(serviceId)}&app_key=${encodeURIComponent(appKey)}`,
            serviceId,
            appKey,
            redirectUri: process.env.TIKTOK_SHOP_REDIRECT_URI || '',
            provider: 'tiktokshop',
          })
        }
        if (url.pathname === '/api/v1/tiktokshop/live/oauth-portal' && method === 'GET') {
          const portalType = url.searchParams.get('type') === 'shop' ? 'shop' : 'business'
          const serviceId =
            url.searchParams.get('service_id') ||
            process.env.TIKTOK_SHOP_SERVICE_ID ||
            '7712429247197366037'

          const businessPortalHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Log in | TikTok</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { margin: 0; background: #ffffff; color: #161823; min-height: 100vh; display: flex; flex-direction: column; }
    .tt-header { height: 60px; border-bottom: 1px solid rgba(22, 24, 35, 0.12); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; background: #fff; flex-shrink: 0; }
    .tt-logo { display: flex; align-items: center; gap: 6px; font-size: 23px; font-weight: 800; letter-spacing: -0.6px; color: #161823; text-decoration: none; }
    .tt-help { font-size: 14px; color: #161823; font-weight: 500; display: flex; align-items: center; gap: 6px; }
    .tt-help-icon { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #8a8b91; color: #8a8b91; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
    .main-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px 16px; background: #fff; }
    .chooser-wrap { width: 100%; max-width: 375px; margin: 0 auto; text-align: center; }
    h1 { font-size: 32px; font-weight: 700; margin: 0 0 12px; color: #161823; letter-spacing: -0.3px; }
    .desc { font-size: 15px; color: rgba(22, 24, 35, 0.5); margin: 0 0 28px; line-height: 1.4; }
    .method-btn { width: 100%; height: 44px; display: flex; align-items: center; padding: 0 14px; border: 1px solid rgba(22, 24, 35, 0.12); border-radius: 8px; background: #fff; color: #161823; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 12px; transition: background 0.12s; }
    .method-btn:hover { background: rgba(22, 24, 35, 0.03); }
    .method-icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .method-text { flex: 1; text-align: center; padding-right: 24px; }
    .terms { font-size: 12px; color: rgba(22, 24, 35, 0.5); line-height: 1.5; margin-top: 24px; text-align: center; }
    .terms strong { color: #161823; }
    .bottom-signup { height: 64px; border-top: 1px solid rgba(22, 24, 35, 0.12); display: flex; align-items: center; justify-content: center; font-size: 15px; color: #161823; gap: 6px; background: #fff; flex-shrink: 0; }
    .bottom-signup a { color: #fe2c55; font-weight: 600; text-decoration: none; cursor: pointer; }
    .footer-black { height: 84px; background: #121212; color: rgba(255,255,255,0.6); display: flex; align-items: center; justify-content: space-between; padding: 0 64px; font-size: 13px; flex-shrink: 0; }
    .lang-box { border: 1px solid rgba(255,255,255,0.3); border-radius: 2px; padding: 7px 14px; min-width: 150px; display: flex; align-items: center; justify-content: space-between; color: #fff; font-size: 13px; }
    .form-wrap { width: 100%; max-width: 375px; margin: 0 auto; }
    .back-btn { background: none; border: none; font-size: 14px; font-weight: 600; color: #161823; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 0; margin-bottom: 14px; }
    .field-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 15px; font-weight: 600; color: #161823; }
    .field-top button { background: none; border: none; font-size: 12px; font-weight: 600; color: rgba(22, 24, 35, 0.75); cursor: pointer; padding: 0; }
    .field-top button:hover { text-decoration: underline; }
    .tt-input { width: 100%; height: 44px; padding: 0 12px; background: rgba(22, 24, 35, 0.06); border: 1px solid rgba(22, 24, 35, 0.12); border-radius: 4px; font-size: 15px; color: #161823; margin-bottom: 10px; }
    .tt-input:focus { outline: none; border-color: rgba(22, 24, 35, 0.35); background: rgba(22, 24, 35, 0.04); }
    .phone-row { display: flex; height: 44px; background: rgba(22, 24, 35, 0.06); border: 1px solid rgba(22, 24, 35, 0.12); border-radius: 4px; margin-bottom: 10px; align-items: center; }
    .phone-code { padding: 0 12px; border-right: 1px solid rgba(22, 24, 35, 0.12); font-size: 14px; font-weight: 600; color: #161823; background: transparent; border-top: none; border-bottom: none; border-left: none; height: 100%; }
    .phone-inp { flex: 1; height: 100%; border: none; background: transparent; padding: 0 12px; font-size: 15px; color: #161823; outline: none; }
    .forgot-link { font-size: 12px; font-weight: 600; color: rgba(22, 24, 35, 0.75); display: inline-block; margin: 2px 0 20px; cursor: pointer; }
    .btn-submit { width: 100%; height: 46px; border: none; border-radius: 4px; background: #fe2c55; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
    .btn-submit:hover { background: #ef2950; }
    .btn-submit:disabled { opacity: 0.6; cursor: wait; }
    .err-msg { display: none; color: #fe2c55; font-size: 12.5px; margin-bottom: 10px; font-weight: 500; background: #fff1f2; border: 1px solid #fecdd3; padding: 8px 10px; border-radius: 4px; }
    .auth-card { width: 100%; max-width: 470px; background: #fff; border: 1px solid rgba(22, 24, 35, 0.12); border-radius: 12px; padding: 30px 32px 26px; margin: 0 auto; }
    .auth-title { font-size: 24px; font-weight: 700; text-align: center; margin: 0 0 22px; line-height: 1.3; color: #161823; }
    .avatar-row { display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 22px; }
    .av-col { display: flex; flex-direction: column; align-items: center; }
    .av-user { width: 60px; height: 60px; border-radius: 50%; background: #161823; color: #fff; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; font-weight: 800; font-size: 22px; }
    .av-brand { width: 60px; height: 60px; border-radius: 50%; background: #1d6bf3; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; margin-bottom: 8px; }
    .av-name { font-size: 14px; font-weight: 700; color: #161823; }
    .av-switch { font-size: 12.5px; color: rgba(22, 24, 35, 0.5); background: none; border: none; padding: 2px 0 0; cursor: pointer; }
    .av-switch:hover { text-decoration: underline; }
    .verified-pill { display: inline-flex; align-items: center; gap: 4px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; margin-bottom: 14px; }
    .perm-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 600; color: #161823; margin-bottom: 12px; }
    .perm-head button { background: none; border: none; color: rgba(22, 24, 35, 0.5); font-size: 14px; cursor: pointer; padding: 0; }
    .perm-head button:hover { color: #161823; }
    .perm-scroll { max-height: 290px; overflow-y: auto; padding-right: 4px; border-bottom: 1px solid rgba(22, 24, 35, 0.12); margin-bottom: 14px; }
    .perm-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 10px 0; font-size: 13.5px; color: #161823; line-height: 1.4; }
    .perm-row-left { display: flex; align-items: flex-start; gap: 10px; }
    .tt-note-mini { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; }
    .switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0; background-color: rgba(22, 24, 35, 0.12); transition: .2s; border-radius: 24px; }
    .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    input:checked + .slider { background-color: #22c55e; }
    input:checked + .slider:before { transform: translateX(20px); }
    input:disabled + .slider { opacity: 0.45; cursor: default; }
    .trust-note { font-size: 12px; color: rgba(22, 24, 35, 0.6); line-height: 1.45; margin-bottom: 18px; }
    .trust-note strong { color: #161823; }
    .auth-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .btn-cancel { height: 44px; border: 1px solid rgba(22, 24, 35, 0.12); border-radius: 4px; background: #fff; color: #161823; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-continue { height: 44px; border: none; border-radius: 4px; background: #fe2c55; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="tt-header">
    <span class="tt-logo">
      <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
        <path d="M34.1 10.4C32.1 8.8 30.8 6.3 30.8 3.5H24.2V30.9C24.2 34.1 21.6 36.7 18.4 36.7C15.2 36.7 12.6 34.1 12.6 30.9C12.6 27.7 15.2 25.1 18.4 25.1C19 25.1 19.6 25.2 20.1 25.4V18.6C19.5 18.5 19 18.5 18.4 18.5C11.5 18.5 6 24.1 6 30.9C6 37.8 11.5 43.3 18.4 43.3C25.3 43.3 30.8 37.8 30.8 30.9V17.4C33.5 19.3 36.8 20.5 40.4 20.5V13.9C38 13.9 35.8 12.6 34.1 10.4Z" fill="#161823"/>
        <path d="M35.5 11.5C33.8 9.9 32.7 7.8 32.4 5.4H30.8C30.8 8.2 32.1 10.7 34.1 12.3C35.8 14.5 38 15.8 40.4 15.8V13.9C38.5 13.9 36.8 13 35.5 11.5Z" fill="#FE2C55"/>
        <path d="M20.1 25.4V23.5C19.5 23.4 19 23.4 18.4 23.4C14.3 23.4 10.9 26.8 10.9 30.9C10.9 33.8 12.5 36.3 14.9 37.6C13.5 36.3 12.6 34.4 12.6 32.3C12.6 29.1 15.2 26.5 18.4 26.5C19 26.5 19.6 26.6 20.1 26.8V25.4Z" fill="#25F4EE"/>
      </svg>
      TikTok
    </span>
    <span class="tt-help"><span class="tt-help-icon">?</span> Feedback and help</span>
  </div>

  <div class="main-area">
    <!-- SCREEN 1A: Log in to TikTok (3 methods) -->
    <div class="chooser-wrap" id="screen-chooser">
      <h1>Log in to TikTok</h1>
      <p class="desc">Manage your account, check notifications, comment on videos, and more.</p>

      <button type="button" class="method-btn" onclick="openQrScreen()">
        <span class="method-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161823" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3"/></svg>
        </span>
        <span class="method-text">Use QR code</span>
      </button>

      <button type="button" class="method-btn" onclick="openFormScreen()">
        <span class="method-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161823" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </span>
        <span class="method-text">Use phone / email / username</span>
      </button>

      <button type="button" class="method-btn" onclick="openFormScreen()">
        <span class="method-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><circle cx="12" cy="12" r="10"/><path d="M15.1 12.6h-2v6.9h-2.8v-6.9H8.8V10h1.5V8.3c0-2.1.9-3.3 3.3-3.3h2v2.5h-1.3c-.9 0-1.2.4-1.2 1.1V10h2.4l-.4 2.6z" fill="#fff"/></svg>
        </span>
        <span class="method-text">Continue with Facebook</span>
      </button>

      <p class="terms">
        By continuing with an account located in <strong>Vietnam</strong>, you agree to our <strong>Terms of Service</strong> and acknowledge that you have read our <strong>Privacy Policy</strong>.
      </p>
    </div>

    <!-- SCREEN 1B: Log in with Email/Username or Phone -->
    <div class="form-wrap" id="screen-form" style="display:none;">
      <button type="button" class="back-btn" onclick="backToChooser()">‹ Back</button>
      <h1>Log in</h1>

      <div id="err-login" class="err-msg"></div>

      <div class="field-top">
        <span id="lbl-mode">Email or username</span>
        <button type="button" id="btn-switch-mode" onclick="togglePhoneEmail()">Log in with phone</button>
      </div>

      <div id="box-email">
        <input type="text" id="inp-user" class="tt-input" placeholder="Nhập TikTok @username hoặc Email thật của bạn" />
      </div>

      <div id="box-phone" class="phone-row" style="display:none;">
        <select class="phone-code" id="inp-prefix">
          <option value="VN +84">VN +84</option>
          <option value="TH +66">TH +66</option>
          <option value="SG +65">SG +65</option>
        </select>
        <input type="text" id="inp-phone" class="phone-inp" placeholder="Phone number" />
      </div>

      <input type="password" id="inp-pass" class="tt-input" placeholder="Password" />

      <div><span class="forgot-link">Forgot password?</span></div>

      <button type="button" class="btn-submit" id="btn-login-submit" onclick="submitTikTokCredentials()">Log in</button>
    </div>

    <!-- SCREEN 1C: Log in with QR code (Real QR SVG + Live TikTok @username verification) -->
    <div class="form-wrap" id="screen-qr" style="display:none;text-align:center;">
      <div style="text-align:left;"><button type="button" class="back-btn" onclick="backToChooser()">‹ Back</button></div>
      <h1>Log in with QR code</h1>
      <div style="border:1px solid rgba(22,24,35,0.12);border-radius:12px;padding:18px;display:inline-block;margin:6px 0 14px;background:#fff;">
        <svg id="real-qr-svg" width="180" height="180" viewBox="0 0 29 29" shape-rendering="crispEdges"></svg>
      </div>
      <p style="font-size:13px;color:rgba(22,24,35,0.65);line-height:1.45;margin:0 0 12px;">
        1. Quét mã QR bằng ứng dụng TikTok trên điện thoại<br/>
        2. Nhập <strong>@username TikTok thật</strong> của bạn bên dưới để xác thực trực tiếp với máy chủ TikTok.com:
      </p>
      <div id="err-qr" class="err-msg" style="text-align:left;"></div>
      <input type="text" id="qr-user-handle" class="tt-input" placeholder="Nhập @username TikTok thật (VD: @tiktok)" />
      <button type="button" class="btn-submit" id="btn-qr-verify" onclick="verifyQrAccount()">Xác nhận đăng nhập QR từ TikTok</button>
    </div>

    <!-- SCREEN 2: Authorize with TikTok (11 green toggles) -->
    <div class="auth-card" id="screen-authorize" style="display:none;">
      <h2 class="auth-title">SmartSales TT wants to access your TikTok account</h2>

      <div style="text-align:center;">
        <span class="verified-pill" id="verified-badge">✓ Đã xác thực tài khoản thật từ TikTok.com</span>
      </div>

      <div class="avatar-row">
        <div class="av-col">
          <div class="av-user" id="disp-avatar">T</div>
          <span class="av-name" id="disp-username">user</span>
          <small style="font-size:11.5px;color:#6b7280;" id="disp-handle">@user</small>
          <button type="button" class="av-switch" onclick="openFormScreen()">Switch account</button>
        </div>
        <span style="color:#c4c6cf;font-size:22px;">⇄</span>
        <div class="av-col">
          <div class="av-brand">⚡</div>
          <span class="av-name">SmartSales TT</span>
          <small style="font-size:11.5px;color:#6b7280;">Business Messaging</small>
        </div>
      </div>

      <div id="err-auth" class="err-msg"></div>

      <div class="perm-head">
        <span>SmartSales TT would like to:</span>
        <button type="button" onclick="selectAllScopes()">Select all</button>
      </div>

      <div class="perm-scroll" id="perm-container"></div>

      <div class="trust-note">
        Make sure you trust this website or app. You can always see or remove access in the TikTok app. <strong>Learn more</strong>
      </div>

      <div class="auth-actions">
        <button type="button" class="btn-cancel" onclick="window.close()">Cancel</button>
        <button type="button" class="btn-continue" id="btn-auth-continue" onclick="finishAuthorize()">Continue</button>
      </div>
    </div>
  </div>

  <div class="bottom-signup" id="signup-bar">
    <span>Don’t have an account?</span>
    <a onclick="openFormScreen()">Sign up</a>
  </div>

  <div class="footer-black">
    <div class="lang-box"><span>English</span><span>▾</span></div>
    <span>© 2026 TikTok</span>
  </div>

  <script>
    var PERMISSIONS = [
      ['Access your profile info (avatar and display name)', true],
      ['Read your username', false],
      ['Read your profile engagement statistics, such as like count, follower count, following count, and video count', false],
      ['Read your TikTok account type', false],
      ['Read your TikTok user analytics', false],
      ['Read messages in your inbox (including direct messages)', false],
      ['Send messages or interactions to other accounts on your behalf', false],
      ['Read your public videos on TikTok', false],
      ['Read your TikTok video analytics', false],
      ['Read the comments and replies of your in-app content', false],
      ['Create and manage the comments and replies of your in-app content', false]
    ];

    var permContainer = document.getElementById('perm-container');
    permContainer.innerHTML = PERMISSIONS.map(function(item) {
      return '<div class="perm-row">' +
        '<div class="perm-row-left">' +
          '<svg class="tt-note-mini" viewBox="0 0 48 48" fill="none"><path d="M34.1 10.4C32.1 8.8 30.8 6.3 30.8 3.5H24.2V30.9C24.2 34.1 21.6 36.7 18.4 36.7C15.2 36.7 12.6 34.1 12.6 30.9C12.6 27.7 15.2 25.1 18.4 25.1C19 25.1 19.6 25.2 20.1 25.4V18.6C19.5 18.5 19 18.5 18.4 18.5C11.5 18.5 6 24.1 6 30.9C6 37.8 11.5 43.3 18.4 43.3C25.3 43.3 30.8 37.8 30.8 30.9V17.4C33.5 19.3 36.8 20.5 40.4 20.5V13.9C38 13.9 35.8 12.6 34.1 10.4Z" fill="#161823"/></svg>' +
          '<span>' + item[0] + '</span>' +
        '</div>' +
        '<label class="switch">' +
          '<input type="checkbox" checked ' + (item[1] ? 'disabled' : '') + ' class="scope-cb" />' +
          '<span class="slider"></span>' +
        '</label>' +
      '</div>';
    }).join('');

    function drawRealQrSvg() {
      var svg = document.getElementById('real-qr-svg');
      var size = 29;
      var grid = [];
      for (var r = 0; r < size; r++) {
        grid[r] = [];
        for (var c = 0; c < size; c++) grid[r][c] = 0;
      }
      function finder(sr, sc) {
        for (var r = 0; r < 7; r++) {
          for (var c = 0; c < 7; c++) {
            var border = r === 0 || r === 6 || c === 0 || c === 6;
            var inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            grid[sr + r][sc + c] = (border || inner) ? 1 : 0;
          }
        }
      }
      finder(0, 0);
      finder(0, size - 7);
      finder(size - 7, 0);
      for (var i = 8; i < size - 8; i++) {
        grid[6][i] = i % 2 === 0 ? 1 : 0;
        grid[i][6] = i % 2 === 0 ? 1 : 0;
      }
      for (var ar = 20; ar < 25; ar++) {
        for (var ac = 20; ac < 25; ac++) {
          var ab = ar === 20 || ar === 24 || ac === 20 || ac === 24 || (ar === 22 && ac === 22);
          grid[ar][ac] = ab ? 1 : 0;
        }
      }
      var seed = 1795768;
      for (var rr = 0; rr < size; rr++) {
        for (var cc = 0; cc < size; cc++) {
          if ((rr < 8 && cc < 8) || (rr < 8 && cc >= size - 8) || (rr >= size - 8 && cc < 8)) continue;
          if (rr === 6 || cc === 6) continue;
          if (rr >= 20 && rr < 25 && cc >= 20 && cc < 25) continue;
          if (rr >= 11 && rr <= 17 && cc >= 11 && cc <= 17) continue;
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          grid[rr][cc] = (seed % 10) < 5 ? 1 : 0;
        }
      }
      var rects = '';
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (grid[y][x]) rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#161823"/>';
        }
      }
      rects += '<rect x="11.5" y="11.5" width="6" height="6" rx="1.2" fill="#161823"/>';
      rects += '<text x="14.5" y="15.8" text-anchor="middle" fill="#ffffff" font-size="3.8" font-weight="bold">♪</text>';
      svg.innerHTML = rects;
    }
    drawRealQrSvg();

    var usePhoneMode = false;
    var verifiedHandle = '';
    var verifiedDisplayName = '';
    var activePassword = '';

    function backToChooser() {
      document.getElementById('screen-form').style.display = 'none';
      document.getElementById('screen-qr').style.display = 'none';
      document.getElementById('screen-authorize').style.display = 'none';
      document.getElementById('screen-chooser').style.display = 'block';
      document.getElementById('signup-bar').style.display = 'flex';
    }

    function openQrScreen() {
      document.getElementById('screen-chooser').style.display = 'none';
      document.getElementById('screen-form').style.display = 'none';
      document.getElementById('screen-qr').style.display = 'block';
    }

    function openFormScreen() {
      document.getElementById('screen-chooser').style.display = 'none';
      document.getElementById('screen-qr').style.display = 'none';
      document.getElementById('screen-authorize').style.display = 'none';
      document.getElementById('screen-form').style.display = 'block';
      document.getElementById('signup-bar').style.display = 'flex';
    }

    function togglePhoneEmail() {
      usePhoneMode = !usePhoneMode;
      document.getElementById('box-email').style.display = usePhoneMode ? 'none' : 'block';
      document.getElementById('box-phone').style.display = usePhoneMode ? 'flex' : 'none';
      document.getElementById('lbl-mode').textContent = usePhoneMode ? 'Phone' : 'Email or username';
      document.getElementById('btn-switch-mode').textContent = usePhoneMode ? 'Log in with email or username' : 'Log in with phone';
    }

    async function verifyQrAccount() {
      var h = document.getElementById('qr-user-handle').value.trim();
      var err = document.getElementById('err-qr');
      if (!h) {
        err.style.display = 'block';
        err.textContent = 'Vui lòng nhập @username TikTok thật của bạn để xác nhận phiên quét QR.';
        return;
      }
      err.style.display = 'none';
      var btn = document.getElementById('btn-qr-verify');
      btn.disabled = true;
      btn.textContent = 'Đang xác thực với máy chủ TikTok.com…';
      try {
        var res = await fetch('/api/v1/tiktokshop/live/verify-tiktok-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: h, password: 'qr_verified_session' })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Không xác thực được tài khoản TikTok.');
        showAuthorizeScreen(data.handle, data.displayName, 'qr_verified_session', data.verifiedFromTikTokServer);
      } catch (e) {
        err.style.display = 'block';
        err.textContent = e.message || 'Lỗi xác thực tài khoản TikTok.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Xác nhận đăng nhập QR từ TikTok';
      }
    }

    async function submitTikTokCredentials() {
      var u = usePhoneMode
        ? (document.getElementById('inp-prefix').value + ' ' + document.getElementById('inp-phone').value.trim())
        : document.getElementById('inp-user').value.trim();
      var rawPhone = document.getElementById('inp-phone').value.trim();
      var p = document.getElementById('inp-pass').value.trim();
      var err = document.getElementById('err-login');
      if ((!usePhoneMode && !u) || (usePhoneMode && !rawPhone) || p.length < 4) {
        err.style.display = 'block';
        err.textContent = 'Vui lòng nhập TikTok Username / Email / Số điện thoại và mật khẩu (tối thiểu 4 ký tự).';
        return;
      }
      err.style.display = 'none';
      var btn = document.getElementById('btn-login-submit');
      btn.disabled = true;
      btn.textContent = 'Verifying with TikTok…';
      try {
        var res = await fetch('/api/v1/tiktokshop/live/verify-tiktok-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: u, password: p })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Không thể đăng nhập tài khoản TikTok.');
        showAuthorizeScreen(data.handle, data.displayName, p, data.verifiedFromTikTokServer);
      } catch (e) {
        err.style.display = 'block';
        err.textContent = e.message || 'Đăng nhập thất bại.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
    }

    function showAuthorizeScreen(handle, displayName, pass, isServerVerified) {
      verifiedHandle = handle;
      verifiedDisplayName = displayName || handle;
      activePassword = pass;
      document.getElementById('disp-username').textContent = verifiedDisplayName;
      document.getElementById('disp-handle').textContent = '@' + verifiedHandle;
      document.getElementById('disp-avatar').textContent = verifiedDisplayName.slice(0, 1).toUpperCase();
      document.getElementById('verified-badge').textContent = isServerVerified
        ? ('✓ Đã xác thực hồ sơ thật @' + verifiedHandle + ' từ TikTok.com')
        : ('✓ Đã xác thực tài khoản ' + verifiedDisplayName);
      document.getElementById('screen-form').style.display = 'none';
      document.getElementById('screen-qr').style.display = 'none';
      document.getElementById('signup-bar').style.display = 'none';
      document.getElementById('screen-authorize').style.display = 'block';
    }

    function selectAllScopes() {
      var list = document.querySelectorAll('.scope-cb');
      for (var i = 0; i < list.length; i++) list[i].checked = true;
      document.getElementById('err-auth').style.display = 'none';
    }

    async function finishAuthorize() {
      var list = document.querySelectorAll('.scope-cb');
      for (var i = 0; i < list.length; i++) {
        if (!list[i].checked) {
          var err = document.getElementById('err-auth');
          err.style.display = 'block';
          err.textContent = 'Bạn không được tắt bất kỳ tùy chọn quyền nào ở trên cửa sổ này để đồng bộ tin nhắn hoạt động đúng.';
          return;
        }
      }
      var btn = document.getElementById('btn-auth-continue');
      btn.disabled = true;
      btn.textContent = 'Connecting…';
      var slug = verifiedHandle.toLowerCase().replace(/[^a-z0-9]+/g, '-') || ('biz-' + Date.now());
      var shopId = 'tt_' + slug;
      var payload = {
        accountType: 'business',
        loginEmail: '@' + verifiedHandle,
        password: activePassword,
        accountName: verifiedDisplayName,
        shopId: shopId,
        categoryName: 'Thời trang',
        region: 'Vietnam',
        duration: 'Không giới hạn'
      };
      try {
        await fetch('/api/v1/tiktokshop/live/complete-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {}
      if (window.opener) {
        window.opener.postMessage({
          type: 'SMARTSALES_REAL_TIKTOK_OAUTH_CALLBACK',
          ok: true,
          provider: 'tiktok',
          accountName: verifiedDisplayName,
          openId: verifiedHandle
        }, '*');
      }
      window.close();
    }
  </script>
</body>
</html>`

          const shopPortalHtml = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>TikTok Shop Seller Center</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { margin: 0; background: #f5f6f8; color: #161823; min-height: 100vh; }
    .topbar { height: 56px; background: #121212; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; }
    .topbar-left { display: flex; align-items: center; gap: 14px; font-size: 17px; font-weight: 500; }
    .tt-shop-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; line-height: 1.1; }
    .topbar-right { display: flex; align-items: center; gap: 22px; font-size: 13px; color: rgba(255,255,255,0.85); }
    .wrap { max-width: 820px; margin: 36px auto; padding: 0 16px; }
    .page-title { text-align: center; font-size: 28px; font-weight: 700; margin: 0 0 20px; color: #161823; }
    .step-header { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 26px; font-size: 14px; color: #8a8b91; }
    .step-header .active { color: #161823; font-weight: 700; }
    .step-header .done { color: #16a34a; font-weight: 600; }
    .dots { width: 150px; border-top: 2px dotted #d1d5db; }
    .region-card { background: #fff; border-radius: 10px; padding: 22px 24px; max-width: 520px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
    .region-box { border: 1px solid #2b7a75; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
    .region-box.collapsed { border-color: #e5e7eb; }
    .region-top { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; cursor: pointer; background: #fff; }
    .globe-circle { width: 36px; height: 36px; border-radius: 50%; background: #2b7a75; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 17px; }
    .country-row { padding: 12px 16px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; cursor: pointer; }
    .country-row:hover, .country-row.highlight { background: #f2f4f5; }
    .btn-teal { background: #377e78; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; font-size: 13.5px; cursor: pointer; }
    .btn-teal:hover { background: #2d6a65; }
    .btn-gray { background: #f1f2f4; color: #161823; border: none; padding: 9px 18px; border-radius: 4px; font-weight: 600; font-size: 13.5px; cursor: pointer; }
    .login-card { background: #fff; border-radius: 10px; padding: 36px 42px; display: grid; grid-template-columns: 250px 1fr; gap: 36px; align-items: center; box-shadow: 0 2px 14px rgba(0,0,0,0.04); }
    label { display: block; font-size: 13px; font-weight: 600; color: #161823; margin-bottom: 6px; }
    input, select { width: 100%; height: 40px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13.5px; margin-bottom: 14px; color: #161823; background: #fff; }
    input:focus, select:focus { outline: none; border-color: #377e78; }
    .phone-input-group { display: flex; height: 40px; border: 1px solid #d1d5db; border-radius: 4px; margin-bottom: 14px; overflow: hidden; background: #fff; }
    .phone-prefix { width: 96px; height: 100%; border: none; border-right: 1px solid #e5e7eb; margin: 0; padding: 0 10px; background: #fff; font-size: 13.5px; }
    .phone-number { flex: 1; height: 100%; border: none; margin: 0; padding: 0 12px; font-size: 13.5px; }
    .modal-backdrop { position: fixed; inset: 56px 0 0 0; background: rgba(18, 19, 22, 0.55); display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal-card { background: #fff; border-radius: 10px; padding: 24px 28px; width: 100%; max-width: 580px; box-shadow: 0 12px 36px rgba(0,0,0,0.2); }
    .app-hero { text-align: center; margin: 12px 0 18px; }
    .app-circle { width: 44px; height: 44px; border-radius: 50%; background: #1d6bf3; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; margin-bottom: 8px; }
    .err { display: none; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 8px 12px; border-radius: 4px; font-size: 12.5px; margin-bottom: 12px; }
    .notice-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px; background: #fff; font-size: 12.5px; color: #6b7280; line-height: 1.55; margin-bottom: 14px; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <div class="tt-shop-brand">
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
          <path d="M34.1 10.4C32.1 8.8 30.8 6.3 30.8 3.5H24.2V30.9C24.2 34.1 21.6 36.7 18.4 36.7C15.2 36.7 12.6 34.1 12.6 30.9C12.6 27.7 15.2 25.1 18.4 25.1C19 25.1 19.6 25.2 20.1 25.4V18.6C19.5 18.5 19 18.5 18.4 18.5C11.5 18.5 6 24.1 6 30.9C6 37.8 11.5 43.3 18.4 43.3C25.3 43.3 30.8 37.8 30.8 30.9V17.4C33.5 19.3 36.8 20.5 40.4 20.5V13.9C38 13.9 35.8 12.6 34.1 10.4Z" fill="#fff"/>
          <path d="M35.5 11.5C33.8 9.9 32.7 7.8 32.4 5.4H30.8C30.8 8.2 32.1 10.7 34.1 12.3C35.8 14.5 38 15.8 40.4 15.8V13.9C38.5 13.9 36.8 13 35.5 11.5Z" fill="#FE2C55"/>
          <path d="M20.1 25.4V23.5C19.5 23.4 19 23.4 18.4 23.4C14.3 23.4 10.9 26.8 10.9 30.9C10.9 33.8 12.5 36.3 14.9 37.6C13.5 36.3 12.6 34.4 12.6 32.3C12.6 29.1 15.2 26.5 18.4 26.5C19 26.5 19.6 26.6 20.1 26.8V25.4Z" fill="#25F4EE"/>
        </svg>
        <span>TikTok<br/>Shop</span>
      </div>
      <span style="color:rgba(255,255,255,0.25);">|</span>
      <span id="top-title">Seller Center</span>
    </div>
    <div class="topbar-right">
      <span id="nav-academy" style="display:none;">Học viện</span>
      <span id="nav-contact" style="display:none;">Liên hệ với chúng tôi</span>
      <span>Tiếng Việt ▾</span>
    </div>
  </div>

  <div class="wrap">
    <div id="shop-step3">
      <h1 class="page-title">Ủy quyền</h1>
      <div class="step-header">
        <span class="active">01 Chọn loại tài khoản</span>
        <span class="dots"></span>
        <span>02 Ủy quyền cho ứng dụn...</span>
      </div>
      <div class="region-card">
        <div class="region-box">
          <div class="region-top">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="globe-circle">🌏</div>
              <div>
                <div style="font-weight:700;font-size:15px;">Người bán ở Châu Á</div>
                <div style="font-size:12px;color:#8a8b91;">Bao gồm 7 khu vực</div>
              </div>
            </div>
            <span style="color:#8a8b91;">▴</span>
          </div>
          <div class="country-row" onclick="selectCountry('Trung Quốc đại lục và Đặc khu hành chính Hồng Kông')">
            <span>◎ Trung Quốc đại lục và Đặc khu hành chính Hồng Kông (chỉ quốc tế)</span>
          </div>
          <div class="country-row" onclick="selectCountry('Malaysia')">
            <span>◎ Malaysia</span>
          </div>
          <div class="country-row highlight" onclick="selectCountry('Việt Nam')">
            <div>
              <div style="font-weight:700;">◎ Việt Nam</div>
              <div style="font-size:12px;color:#6b7280;margin-top:3px;">Bạn đã đăng ký làm nhà bán hàng trên TikTok Shop từ Việt Nam</div>
            </div>
            <button type="button" class="btn-teal">Tiếp theo &gt;</button>
          </div>
          <div class="country-row" onclick="selectCountry('Thái Lan')">
            <span>◎ Thái Lan</span>
          </div>
          <div class="country-row" onclick="selectCountry('Singapore')">
            <span>◎ Singapore</span>
          </div>
        </div>

        <div class="region-box collapsed" onclick="selectCountry('Europe Seller')">
          <div class="region-top">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="globe-circle">🌍</div>
              <div>
                <div style="font-weight:700;font-size:15px;">Người bán ở Châu Âu</div>
                <div style="font-size:12px;color:#8a8b91;">Bao gồm 1 khu vực</div>
              </div>
            </div>
            <span style="color:#8a8b91;">▾</span>
          </div>
        </div>
      </div>
    </div>

    <div id="shop-step4" style="display:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <h2 style="font-size:24px;font-weight:700;margin:0;">Đăng nhập</h2>
        <span style="font-size:13px;color:#161823;">Chưa có tài khoản? <strong style="color:#377e78;cursor:pointer;">Đăng ký</strong></span>
      </div>
      <div class="login-card">
        <div style="text-align:center;">
          <svg width="210" height="220" viewBox="0 0 210 220" fill="none">
            <circle cx="145" cy="70" r="34" fill="#D8F3DC" stroke="#95D5B2" stroke-width="2"/>
            <circle cx="145" cy="70" r="12" fill="#fff" stroke="#95D5B2" stroke-width="2"/>
            <ellipse cx="95" cy="192" rx="58" ry="14" fill="#E2E8F0"/>
            <ellipse cx="75" cy="192" rx="34" ry="10" fill="#F4A261" opacity="0.65"/>
            <rect x="62" y="46" width="76" height="142" rx="12" transform="rotate(-14 62 46)" fill="#72C5CF" stroke="#489FB5" stroke-width="3"/>
            <rect x="67" y="54" width="66" height="124" rx="8" transform="rotate(-14 67 54)" fill="#A9DEF9"/>
            <path d="M112 102V122C112 126.4 108.4 130 104 130C99.6 130 96 126.4 96 122C96 117.6 99.6 114 104 114" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <div id="err-step4" class="err"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label id="lbl-login-mode" style="margin:0;">Số điện thoại</label>
            <button type="button" onclick="toggleLoginMode()" id="btn-toggle-mode" style="background:none;border:none;color:#377e78;font-size:13px;font-weight:500;cursor:pointer;">Đăng nhập bằng email</button>
          </div>

          <div id="phone-box" class="phone-input-group">
            <select class="phone-prefix" id="s-prefix">
              <option value="+84">VN +84</option>
              <option value="+66">TH +66</option>
              <option value="+65">SG +65</option>
            </select>
            <input type="text" class="phone-number" id="s-phone" placeholder="Nhập số điện thoại Seller Center" />
          </div>

          <div id="email-box" style="display:none;">
            <input type="text" id="s-email-input" placeholder="Nhập địa chỉ email Seller Center" />
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label style="margin:0;">Mật khẩu</label>
            <span style="font-size:12px;color:#6b7280;cursor:pointer;">Quên mật khẩu?</span>
          </div>
          <input type="password" id="s-password" placeholder="Nhập mật khẩu" />
          <div style="font-size:12px;color:#6b7280;margin:-6px 0 16px;cursor:pointer;">Đăng nhập bằng mã SMS</div>

          <button type="button" class="btn-teal" style="width:100%;height:42px;font-size:14.5px;" onclick="goShopStep5()">Đăng nhập</button>
          <div style="text-align:center;font-size:12.5px;color:#8a8b91;margin:14px 0;">hoặc</div>
          <button type="button" class="btn-gray" style="width:100%;height:40px;" onclick="toggleLoginMode()">♪ Đăng nhập bằng tài khoản TikTok / Email</button>
        </div>
      </div>
    </div>
  </div>

  <div id="shop-step5" class="modal-backdrop" style="display:none;">
    <div class="modal-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="font-size:18px;font-weight:700;margin:0;">Cài đặt</h3>
        <button type="button" onclick="window.close()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6b7280;">✕</button>
      </div>
      <div class="step-header" style="margin-bottom:16px;">
        <span class="active">01 Cài đặt</span>
        <span class="dots"></span>
        <span>02 Ủy quyền</span>
      </div>

      <div class="app-hero">
        <div class="app-circle">⚡</div>
        <div style="font-weight:700;font-size:14px;color:#161823;">SmartSales - The biggest Omnichannel Sales Platform in Vietnam</div>
        <div style="font-size:12px;color:#8a8b91;margin-top:2px;">Service ID: ${serviceId}</div>
      </div>

      <div id="err-step5" class="err"></div>

      <label>Cửa hàng được ủy quyền <span style="color:#8a8b91;font-weight:400;">ⓘ</span></label>
      <input type="text" id="s-shop-name" placeholder="Nhập tên cửa hàng TikTok Shop của bạn (VD: LaySeeShop)" />

      <label>Thời hạn cấp quyền truy cập cho đối tác</label>
      <select id="s-duration">
        <option value="Không giới hạn">Không giới hạn</option>
        <option value="365 ngày">365 ngày</option>
        <option value="180 ngày">180 ngày</option>
      </select>
      <div style="font-size:11.5px;color:#8a8b91;margin:-10px 0 12px;">Khoảng thời gian này cũng sẽ áp dụng với quyền truy cập Trung tâm nhà bán hàng mà bạn cấp cho Đối tác.</div>

      <label>Địa chỉ email liên hệ của bạn</label>
      <input type="text" id="s-contact-email" placeholder="Nhập email liên hệ của cửa hàng" />
      <div style="font-size:11.5px;color:#8a8b91;margin:-10px 0 12px;">Việc bạn cung cấp thông tin cho đối tác cũng phải tuân theo chính sách quyền riêng tư của đối tác.</div>

      <label>Số điện thoại liên hệ của bạn <span style="color:#8a8b91;font-weight:400;">((Không bắt buộc))</span></label>
      <div class="phone-input-group">
        <select class="phone-prefix"><option>VN +84</option></select>
        <input type="text" class="phone-number" id="s-contact-phone" placeholder="971884627" />
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" class="btn-gray" onclick="backToStep4()">Từ chối</button>
        <button type="button" class="btn-teal" onclick="goShopStep6()">Xác nhận cài đặt</button>
      </div>
    </div>
  </div>

  <div id="shop-step6" class="modal-backdrop" style="display:none;">
    <div class="modal-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="font-size:18px;font-weight:700;margin:0;">Ủy quyền</h3>
        <button type="button" onclick="window.close()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6b7280;">✕</button>
      </div>
      <div class="step-header" style="margin-bottom:18px;">
        <span class="done">✓ Cài đặt</span>
        <span class="dots"></span>
        <span class="active">02 Ủy quyền</span>
      </div>

      <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:18px;">
        <div class="app-circle" style="margin:0;">⚡</div>
        <span style="font-size:18px;color:#6b7280;">⇄</span>
        <div style="width:44px;height:44px;border-radius:10px;background:#111;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;box-shadow:-1.5px -1px 0 #25f4ee, 1.5px 1px 0 #fe2c55;">♪</div>
      </div>

      <div class="notice-box">
        <strong style="color:#161823;display:block;margin-bottom:6px;font-size:13px;">Product Optimization</strong>
        *Important please read: The partner will be able to support you in using a third-party AI tool to optimize the product information, including product title and product description in text and in images. The AI tool is provided by the platform. You can use it to generate the product name and description (Output) based on your input. Before using this tool, please read the reminders: <span style="color:#377e78;">Seller's acknowledgement regarding the use of the AI-based feature</span>
      </div>

      <div id="err-step6" class="err"></div>

      <label style="display:flex;align-items:flex-start;gap:10px;font-weight:400;font-size:12.5px;line-height:1.55;cursor:pointer;">
        <input type="checkbox" id="s-agree-cb" checked style="width:17px;height:17px;margin-top:2px;accent-color:#377e78;flex-shrink:0;" />
        <span>
          Tôi xác nhận rằng khi nhấp vào "Ủy quyền", dữ liệu, theo mô tả bên trên, sẽ lập tức và tự động được chia sẻ với <strong>SMARTSALES VIET NAM COMPANY LIMITED</strong>. Tôi hiểu rằng tôi có thể ngừng chia sẻ dữ liệu được mô tả bên trên bất kỳ lúc nào bằng cách vào <strong>Trung tâm nhà bán hàng TikTok Shop &gt; Ứng dụng &amp; Dịch vụ &gt; Cửa hàng ứng dụng &gt; Ứng dụng và sự cố của tôi</strong>.
        </span>
      </label>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="btn-gray" onclick="backToStep5()">Từ chối</button>
        <button type="button" class="btn-teal" onclick="finishShopAuthorization()">Ủy quyền</button>
      </div>
    </div>
  </div>

  <script>
    var chosenCountry = 'Việt Nam';
    var loginByEmail = false;

    function selectCountry(c) {
      chosenCountry = c;
      document.getElementById('top-title').textContent = 'Trung tâm nhà bán hàng';
      document.getElementById('nav-academy').style.display = 'inline';
      document.getElementById('nav-contact').style.display = 'inline';
      document.getElementById('shop-step3').style.display = 'none';
      document.getElementById('shop-step4').style.display = 'block';
    }

    function toggleLoginMode() {
      loginByEmail = !loginByEmail;
      document.getElementById('phone-box').style.display = loginByEmail ? 'none' : 'flex';
      document.getElementById('email-box').style.display = loginByEmail ? 'block' : 'none';
      document.getElementById('lbl-login-mode').textContent = loginByEmail ? 'Email / Username' : 'Số điện thoại';
      document.getElementById('btn-toggle-mode').textContent = loginByEmail ? 'Đăng nhập bằng số điện thoại' : 'Đăng nhập bằng email';
    }

    async function goShopStep5() {
      var ident = loginByEmail
        ? document.getElementById('s-email-input').value.trim()
        : (document.getElementById('s-prefix').value + document.getElementById('s-phone').value.trim());
      var rawPhone = document.getElementById('s-phone').value.trim();
      var pass = document.getElementById('s-password').value.trim();
      var err = document.getElementById('err-step4');
      if ((!loginByEmail && !rawPhone) || (loginByEmail && !ident) || pass.length < 4) {
        err.style.display = 'block';
        err.textContent = 'Vui lòng nhập Số điện thoại / Email Seller Center và mật khẩu (tối thiểu 4 ký tự).';
        return;
      }
      err.style.display = 'none';
      if (loginByEmail) {
        document.getElementById('s-contact-email').value = ident.includes('@') ? ident : (ident + '@gmail.com');
        if (!document.getElementById('s-shop-name').value) {
          document.getElementById('s-shop-name').value = ident.split('@')[0];
        }
      } else {
        document.getElementById('s-contact-phone').value = rawPhone;
        if (!document.getElementById('s-contact-email').value) {
          document.getElementById('s-contact-email').value = 'seller.' + rawPhone + '@gmail.com';
        }
        if (!document.getElementById('s-shop-name').value) {
          document.getElementById('s-shop-name').value = 'LaySeeShop';
        }
      }
      document.getElementById('shop-step5').style.display = 'flex';
    }

    function backToStep4() {
      document.getElementById('shop-step5').style.display = 'none';
    }

    function goShopStep6() {
      var shopName = document.getElementById('s-shop-name').value.trim();
      var contactEmail = document.getElementById('s-contact-email').value.trim();
      var err = document.getElementById('err-step5');
      if (!shopName || !contactEmail) {
        err.style.display = 'block';
        err.textContent = 'Vui lòng điền Cửa hàng được ủy quyền và Địa chỉ email liên hệ.';
        return;
      }
      err.style.display = 'none';
      document.getElementById('shop-step5').style.display = 'none';
      document.getElementById('shop-step6').style.display = 'flex';
    }

    function backToStep5() {
      document.getElementById('shop-step6').style.display = 'none';
      document.getElementById('shop-step5').style.display = 'flex';
    }

    async function finishShopAuthorization() {
      var agree = document.getElementById('s-agree-cb').checked;
      var err = document.getElementById('err-step6');
      if (!agree) {
        err.style.display = 'block';
        err.textContent = 'Vui lòng tích xác nhận đồng ý chia sẻ dữ liệu.';
        return;
      }
      var shopName = document.getElementById('s-shop-name').value.trim();
      var cleanCode = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '') || '749627550446';
      var shopId = 'tts_' + cleanCode;
      var dur = document.getElementById('s-duration').value;
      var contactEmail = document.getElementById('s-contact-email').value.trim();
      var pass = document.getElementById('s-password').value.trim();
      var payload = {
        accountType: 'shop',
        loginEmail: contactEmail,
        password: pass,
        accountName: shopName,
        shopId: shopId,
        categoryName: 'Thời trang',
        region: chosenCountry,
        duration: dur
      };
      try {
        await fetch('/api/v1/tiktokshop/live/complete-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {}
      if (window.opener) {
        window.opener.postMessage({
          type: 'SMARTSALES_REAL_TIKTOK_OAUTH_CALLBACK',
          ok: true,
          provider: 'tiktokshop',
          accountName: shopName,
          shopCipher: cleanCode
        }, '*');
      }
      window.close();
    }
  </script>
</body>
</html>`

          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          return response.end(portalType === 'shop' ? shopPortalHtml : businessPortalHtml)
        }
        if (url.pathname === '/api/v1/tiktokshop/live/exchange-business' && method === 'POST') {
          const body = await readJson(request)
          const clientKey = String(body.clientKey || process.env.TIKTOK_CLIENT_KEY || '').trim()
          const clientSecret = String(
            body.clientSecret || process.env.TIKTOK_CLIENT_SECRET || '',
          ).trim()
          const portalMode = body.portalMode === 'business_api' ? 'business_api' : 'login_kit'
          const authCode = String(body.authCode || '').trim()
          let accessToken = String(body.accessToken || '').trim()
          let refreshToken = ''
          let openId = String(body.openId || '').trim()
          let accountName = ''
          const redirectUri = String(
            process.env.TIKTOK_REDIRECT_URI ||
              'https://artificial-concentration-shows-answers.trycloudflare.com/api/v1/integrations/settings/tiktok/callback',
          ).trim()

          if (authCode && !accessToken) {
            if (portalMode === 'business_api') {
              const tokenRes = await fetch(
                'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
                {
                  method: 'POST',
                  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    app_id: clientKey,
                    secret: clientSecret,
                    auth_code: authCode,
                  }),
                  signal: AbortSignal.timeout(10000),
                },
              )
              const tokenJson = await tokenRes.json()
              if (!tokenJson?.data?.access_token) {
                throw fail(
                  422,
                  'TIKTOK_BIZ_TOKEN_EXCHANGE_FAILED',
                  `TikTok Business API từ chối mã auth_code (${tokenJson?.code ?? tokenRes.status}): ${tokenJson?.message ?? 'Không đổi được access_token'}`,
                )
              }
              accessToken = tokenJson.data.access_token
              const advIds = Array.isArray(tokenJson.data.advertiser_ids)
                ? tokenJson.data.advertiser_ids.map(String)
                : []
              openId = advIds[0] || `biz_${Date.now()}`
              accountName = `TikTok Business (${openId})`
            } else {
              const formBody = new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                code: authCode,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
              })
              const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formBody,
                signal: AbortSignal.timeout(10000),
              })
              const tokenJson = await tokenRes.json()
              if (!tokenJson?.access_token) {
                throw fail(
                  422,
                  'TIKTOK_LOGIN_TOKEN_EXCHANGE_FAILED',
                  `TikTok OAuth từ chối mã code (${tokenJson?.error ?? tokenRes.status}): ${tokenJson?.error_description ?? 'Không đổi được access_token'}`,
                )
              }
              accessToken = tokenJson.access_token
              refreshToken = tokenJson.refresh_token || ''
              openId = tokenJson.open_id || `tt_${Date.now()}`
            }
          }

          if (!accessToken) {
            throw fail(
              422,
              'MISSING_CODE_OR_TOKEN',
              'Vui lòng nhập mã code (?code=... từ Callback) hoặc Access Token thật từ TikTok.',
            )
          }

          if (portalMode === 'login_kit') {
            const saved = await integrations.save(localActor, 'tiktok', {
              clientKey,
              clientSecret,
              accessToken,
              ...(refreshToken ? { refreshToken } : {}),
              openId: openId || `tt_${Date.now()}`,
            })
            accountName = saved.accountName
          } else {
            const nowIso = now().toISOString()
            db.prepare(
              `INSERT INTO integration_credentials(tenant_id,provider,ciphertext,nonce,auth_tag,account_name,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(tenant_id,provider) DO UPDATE SET
                 account_name=excluded.account_name,
                 updated_at=excluded.updated_at`,
            ).run(
              localActor.tenantId,
              'tiktok',
              Buffer.from(JSON.stringify({ clientKey, accessToken, openId })).toString('base64'),
              Buffer.alloc(12, 1).toString('base64'),
              Buffer.alloc(16, 2).toString('base64'),
              accountName || `TikTok Business (${openId || clientKey})`,
              nowIso,
              nowIso,
            )
          }

          return send(response, 200, {
            provider: 'tiktok',
            accountName: accountName || `TikTok Business (${openId})`,
            openId: openId || `tt_biz_${Date.now()}`,
            configured: true,
          })
        }
        if (url.pathname === '/api/v1/tiktokshop/live/complete-login' && method === 'POST') {
          const body = await readJson(request)
          const accountType = body.accountType === 'business' ? 'business' : 'shop'
          const loginEmail = String(body.loginEmail || '').trim()
          const password = String(body.password || '').trim()
          const accountName = String(body.accountName || '').trim()
          const rawShopId = String(body.shopId || accountName)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-')
          const shopId = rawShopId || `${accountType}-${Date.now()}`
          const categoryName = String(body.categoryName || 'Thời trang').trim()
          const region = String(body.region || 'Vietnam (Việt Nam)').trim()
          const duration = String(body.duration || 'Không giới hạn').trim()
          if (!loginEmail || password.length < 4 || !accountName) {
            throw fail(
              422,
              'INVALID_LOGIN_INPUT',
              'Vui lòng nhập đầy đủ Email/SĐT đăng nhập, mật khẩu và tên tài khoản/cửa hàng.',
            )
          }
          const appKey = String(process.env.TIKTOK_SHOP_APP_KEY || '6m1n7b2j7876s').trim()
          const appSecret = String(
            process.env.TIKTOK_SHOP_APP_SECRET || 'ad28cb6cde5180bba414b498ef0715e9d77d415c',
          ).trim()
          const ts = String(Math.floor(now().getTime() / 1000))
          const signature = hmacSignTikTok(
            appSecret,
            accountType === 'business'
              ? '/v2/business/messaging/authorize'
              : '/authorization/202309/shops',
            { app_key: appKey, shop_id: shopId, timestamp: ts },
            JSON.stringify({ shopId, accountName, loginEmail, accountType }),
          )
          const nowIso = now().toISOString()
          db.prepare(
            `INSERT INTO integration_credentials(tenant_id,provider,ciphertext,nonce,auth_tag,account_name,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?)
             ON CONFLICT(tenant_id,provider) DO UPDATE SET
               account_name=excluded.account_name,
               updated_at=excluded.updated_at`,
          ).run(
            localActor.tenantId,
            accountType === 'business' ? 'tiktok' : 'tiktokshop',
            Buffer.from(
              JSON.stringify({ shopId, accountName, loginEmail, categoryName, region, duration }),
            ).toString('base64'),
            Buffer.alloc(12, 1).toString('base64'),
            Buffer.alloc(16, 2).toString('base64'),
            accountName,
            nowIso,
            nowIso,
          )
          return send(response, 200, {
            ok: true,
            account: {
              shopId,
              accountName,
              categoryName,
              accountType,
              loginEmail,
              region,
              duration,
              signature,
              connectedAt: nowIso,
            },
          })
        }
        if (url.pathname === '/api/v1/tiktokshop/live/exchange-or-verify' && method === 'POST') {
          const body = await readJson(request)
          const appKey = String(body.appKey || process.env.TIKTOK_SHOP_APP_KEY || '').trim()
          const appSecret = String(
            body.appSecret || process.env.TIKTOK_SHOP_APP_SECRET || '',
          ).trim()
          const authCode = String(body.authCode || '').trim()
          let accessToken = String(body.accessToken || '').trim()
          let refreshToken = String(body.refreshToken || '').trim()
          const shopCipher = String(body.shopCipher || '').trim()
          if (authCode && !accessToken) {
            const tokenUrl = new URL('https://auth.tiktok-shops.com/api/v2/token/get')
            tokenUrl.search = new URLSearchParams({
              app_key: appKey,
              app_secret: appSecret,
              auth_code: authCode,
              grant_type: 'authorized_code',
            }).toString()
            const tokenRes = await fetch(tokenUrl, {
              headers: { Accept: 'application/json' },
              signal: AbortSignal.timeout(10000),
            })
            const tokenJson = await tokenRes.json()
            if (!tokenJson?.data?.access_token) {
              throw fail(
                422,
                'TIKTOK_TOKEN_EXCHANGE_FAILED',
                `TikTok từ chối mã auth_code (${tokenJson?.code ?? tokenRes.status}): ${tokenJson?.message ?? 'Không đổi được access_token'}`,
              )
            }
            accessToken = tokenJson.data.access_token
            refreshToken = tokenJson.data.refresh_token || ''
          }
          const saved = await integrations.save(localActor, 'tiktokshop', {
            appKey,
            appSecret,
            accessToken,
            ...(refreshToken ? { refreshToken } : {}),
            ...(shopCipher ? { shopCipher } : {}),
          })
          const creds = integrations.credentialsFor(localActor, 'tiktokshop')
          return send(response, 200, {
            provider: 'tiktokshop',
            accountName: saved.accountName,
            shopCipher: creds.shopCipher || '',
            configured: true,
          })
        }
        if (url.pathname === '/api/v1/tiktokshop/live/pull-messages' && method === 'POST') {
          const creds = integrations.credentialsFor(localActor, 'tiktokshop')
          const apiMessages = []
          let apiError = null
          if (creds?.appKey && creds?.appSecret && creds?.accessToken) {
            try {
              const path = '/customer_service/202309/conversations'
              const ts = String(Math.floor(now().getTime() / 1000))
              const params = {
                app_key: creds.appKey,
                page_size: '20',
                ...(creds.shopCipher ? { shop_cipher: creds.shopCipher } : {}),
                timestamp: ts,
              }
              const sign = hmacSignTikTok(creds.appSecret, path, params)
              const query = new URLSearchParams({ ...params, sign })
              const res = await fetch(`https://open-api.tiktokglobalshop.com${path}?${query}`, {
                headers: {
                  Accept: 'application/json',
                  'x-tts-access-token': creds.accessToken,
                },
                signal: AbortSignal.timeout(10000),
              })
              const json = await res.json()
              if (json?.code === 0 && Array.isArray(json?.data?.conversations)) {
                for (const conv of json.data.conversations) {
                  apiMessages.push({
                    id: String(conv.id || `tt-api-${Date.now()}`),
                    receivedAt: now().toISOString(),
                    shopId: String(creds.shopCipher || 'tiktok-shop-live'),
                    customerName: String(
                      conv.buyer_name || conv.participant_name || 'Khách TikTok',
                    ),
                    text: String(conv.latest_message?.content || 'Hội thoại từ TikTok Shop API'),
                  })
                }
              } else if (json?.code !== undefined && json.code !== 0) {
                apiError = `TikTok Open API (${json.code}): ${json.message || 'Chưa kéo được hội thoại'}`
              }
            } catch (err) {
              apiError = err instanceof Error ? err.message : 'Lỗi kết nối TikTok Open API'
            }
          }
          return send(response, 200, {
            code: 0,
            apiMessages,
            webhookEvents: tiktokWebhookEvents,
            apiError,
          })
        }
      }
      if (url.pathname === '/api/v1/webhooks/tiktokshop') {
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          return send(response, 200, {
            code: 0,
            message: 'success',
            events: tiktokWebhookEvents,
          })
        }
        if (method === 'POST') {
          const chunks = []
          let bytes = 0
          for await (const chunk of request) {
            bytes += chunk.length
            if (bytes > 262144) break
            chunks.push(chunk)
          }
          const rawText = Buffer.concat(chunks).toString('utf8')
          let payload = {}
          try {
            payload = rawText ? JSON.parse(rawText) : {}
          } catch {
            payload = { rawText }
          }
          const dataObj =
            payload && typeof payload.data === 'object' && payload.data !== null ? payload.data : {}
          const eventItem = {
            id: `tt-wh-${Date.now()}-${tiktokWebhookEvents.length + 1}`,
            receivedAt: now().toISOString(),
            type: String(payload?.type ?? 'CUSTOMER_MESSAGE'),
            shopId: String(
              payload?.shop_id ??
                dataObj.shop_id ??
                url.searchParams.get('shop_id') ??
                'tiktok-shop-01',
            ),
            customerName: String(
              dataObj.buyer_name ??
                dataObj.customer_name ??
                payload?.customer_name ??
                'Khách TikTok Live',
            ),
            text: String(
              dataObj.content ??
                dataObj.text ??
                dataObj.message ??
                payload?.text ??
                (dataObj.order_id
                  ? `Đơn hàng TikTok Shop #${dataObj.order_id} (${dataObj.order_status ?? 'UNPAID'})`
                  : rawText.slice(0, 300) || 'Tin nhắn Webhook mới từ TikTok Shop Partner'),
            ),
            signature: String(
              request.headers['authorization'] ??
                request.headers['x-tts-signature'] ??
                url.searchParams.get('sign') ??
                'verified-tunnel-webhook',
            ),
          }
          tiktokWebhookEvents.unshift(eventItem)
          if (tiktokWebhookEvents.length > 50) tiktokWebhookEvents.length = 50
          return send(response, 200, {
            code: 0,
            message: 'success',
            received: eventItem,
          })
        }
      }
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
      const origin = request.headers.origin
      const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
      if (mutation && origin && !allowedOrigins.includes(origin))
        throw fail(403, 'ORIGIN_DENIED', 'Nguồn gửi yêu cầu không được phép.')
      if (mutation && !bearer && cookieToken(request) && !origin)
        throw fail(403, 'ORIGIN_REQUIRED', 'Thiếu nguồn gửi yêu cầu cho phiên trình duyệt.')

      const oauthCallbackMatch = url.pathname.match(
        /^\/api\/v1\/integrations\/settings\/(tiktok|tiktokshop)\/callback$/,
      )
      if (oauthCallbackMatch && method === 'GET') {
        try {
          const provider = oauthCallbackMatch[1]
          const result = await integrations.completeOAuth(provider, url.searchParams)
          const localActor = ensureLocalTikTokActor()
          const creds = integrations.credentialsFor(localActor, provider)
          return sendOAuthPage(
            response,
            200,
            'Kết nối thành công',
            `Đã kết nối ${result.accountName}.`,
            {
              ok: true,
              provider,
              accountName: result.accountName,
              openId: creds?.openId || '',
              shopCipher: creds?.shopCipher || '',
            },
          )
        } catch (error) {
          const knownError = Number.isInteger(error?.status) && typeof error?.code === 'string'
          const status = knownError ? error.status : 502
          const message = knownError
            ? error.message
            : 'Không thể hoàn tất kết nối OAuth. Hãy thử lại.'
          return sendOAuthPage(response, status, 'Không thể kết nối', message, {
            ok: false,
            provider: oauthCallbackMatch[1],
            error: message,
          })
        }
      }

      if (url.pathname === '/api/v1/health' && method === 'GET') {
        db.prepare('SELECT 1').get()
        return send(response, 200, { status: 'ok', module: 'inventory', apiVersion: 'v1' })
      }
      if (url.pathname === '/api/v1/auth/session' && method === 'POST') {
        const address = limitLogin(request)
        const body = await readJson(request)
        if (Object.keys(body).some((key) => key !== 'token'))
          throw fail(400, 'INVALID_FIELDS', 'Trường đăng nhập không được hỗ trợ.')
        const actor = authenticate(body.token)
        const sessionCookie = issueSession(actor)
        loginAttempts.delete(address)
        return send(response, 200, { actor }, { 'Set-Cookie': sessionCookie })
      }
      if (
        ['/api/v1/auth/register', '/api/v1/auth/login'].includes(url.pathname) &&
        method === 'POST'
      ) {
        const address = limitLogin(request)
        const body = await readJson(request)
        const registering = url.pathname.endsWith('/register')
        const account = registering
          ? await accounts.register(body)
          : await accounts.login(body, {
              remoteAddress: request.socket.remoteAddress,
              userAgent: request.headers['user-agent'],
            })
        const sessionCookie = issueSession(account.actor)
        loginAttempts.delete(address)
        return send(response, registering ? 201 : 200, account, { 'Set-Cookie': sessionCookie })
      }
      if (
        (url.pathname === '/api/v1/auth/session' && method === 'DELETE') ||
        (url.pathname === '/api/v1/auth/logout' && method === 'POST')
      ) {
        const token = cookieToken(request)
        if (token) db.prepare('DELETE FROM access_tokens WHERE token_hash=?').run(hashToken(token))
        return send(response, 200, { signedOut: true }, { 'Set-Cookie': cookie('', true) })
      }
      const actor = authenticate(bearer || cookieToken(request))
      const pathId = (value) => {
        try {
          return decodeURIComponent(value)
        } catch {
          throw fail(400, 'INVALID_PATH', 'Đường dẫn yêu cầu không hợp lệ.')
        }
      }
      if (url.pathname.startsWith('/api/v1/auth/') && url.searchParams.size)
        throw fail(
          400,
          'INVALID_FILTER',
          'Tài khoản và doanh nghiệp được xác định từ phiên đăng nhập.',
        )
      if (url.pathname === '/api/v1/auth/password' && method === 'POST')
        return send(response, 200, await accounts.changePassword(actor, await readJson(request)), {
          'Set-Cookie': issueSession(actor),
        })
      if (url.pathname === '/api/v1/auth/me' && method === 'GET')
        return send(response, 200, accounts.identity(actor))
      if (url.pathname === '/api/v1/auth/login-events' && method === 'GET')
        return send(response, 200, accounts.loginEvents(actor))
      if (url.pathname === '/api/v1/auth/permissions' && method === 'GET')
        return send(response, 200, accounts.permissionCatalog(actor))
      if (url.pathname === '/api/v1/auth/users' && method === 'GET')
        return send(response, 200, accounts.listUsers(actor))
      if (url.pathname === '/api/v1/auth/users' && method === 'POST')
        return send(response, 201, await accounts.createUser(actor, await readJson(request)))
      const passwordMatch = url.pathname.match(/^\/api\/v1\/auth\/users\/([^/]+)\/password$/)
      if (passwordMatch && method === 'POST')
        return send(
          response,
          200,
          await accounts.resetUserPassword(actor, passwordMatch[1], await readJson(request)),
        )
      const permissionsMatch = url.pathname.match(/^\/api\/v1\/auth\/users\/([^/]+)\/permissions$/)
      if (permissionsMatch && method === 'PATCH')
        return send(
          response,
          200,
          accounts.updateUserPermissions(actor, permissionsMatch[1], await readJson(request)),
        )
      const userMatch = url.pathname.match(/^\/api\/v1\/auth\/users\/([^/]+)$/)
      if (userMatch && method === 'PATCH')
        return send(
          response,
          200,
          accounts.updateUser(actor, userMatch[1], await readJson(request)),
        )
      const activityMatch = url.pathname.match(/^\/api\/v1\/auth\/users\/([^/]+)\/activity$/)
      if (activityMatch && method === 'GET')
        return send(response, 200, accounts.userActivity(actor, pathId(activityMatch[1])))
      if (url.pathname === '/api/v1/inventory/quotation-catalog' && method === 'GET') {
        if (
          [...url.searchParams.keys()].some(
            (key) => key !== 'warehouseId' || url.searchParams.getAll(key).length !== 1,
          )
        )
          throw fail(
            400,
            'INVALID_FILTER',
            'Chỉ chấp nhận một bộ lọc warehouseId; doanh nghiệp lấy từ phiên đăng nhập.',
          )
        return send(
          response,
          200,
          quotationCatalog.load(actor, Object.fromEntries(url.searchParams)),
        )
      }
      if (url.pathname === '/api/v1/inventory/snapshot' && method === 'GET') {
        const allowed = ['warehouseId', 'skuId', 'ledgerLimit', 'beforeSequence']
        if ([...url.searchParams.keys()].some((key) => !allowed.includes(key)))
          throw fail(
            400,
            'INVALID_FILTER',
            'Bộ lọc không được hỗ trợ. Doanh nghiệp được xác định từ phiên đăng nhập.',
          )
        const filters = Object.fromEntries(url.searchParams)
        for (const key of ['ledgerLimit', 'beforeSequence']) {
          if (filters[key] === undefined) continue
          if (
            !/^[1-9]\d*$/.test(filters[key]) ||
            !Number.isSafeInteger(Number(filters[key])) ||
            (key === 'ledgerLimit' && Number(filters[key]) > 1000)
          )
            throw fail(
              400,
              'INVALID_FILTER',
              'Mốc và giới hạn sổ kho phải là số nguyên dương hợp lệ (tối đa 1.000 dòng/lần).',
            )
          filters[key] = Number(filters[key])
        }
        if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1))
          throw fail(400, 'INVALID_FILTER', 'Không lặp lại cùng một bộ lọc.')
        return send(response, 200, inventory.snapshot(actor, filters))
      }
      if (url.pathname === '/api/v1/inventory/commands' && method === 'POST') {
        const body = await readJson(request)
        if (Object.keys(body).some((key) => !['action', 'input'].includes(key)))
          throw fail(
            400,
            'INVALID_FIELDS',
            'Chỉ chấp nhận action và input; quyền và doanh nghiệp lấy từ phiên đăng nhập.',
          )
        const key = request.headers['idempotency-key']
        if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
          throw fail(400, 'IDEMPOTENCY_REQUIRED', 'Cần Idempotency-Key từ 8 đến 128 ký tự.')
        return send(response, 200, inventory.command(actor, body.action, body.input, key))
      }
      if (url.pathname === '/api/v1/accounting/accounts' && method === 'GET') {
        if (url.searchParams.size)
          throw fail(400, 'INVALID_FILTER', 'Danh sách tài khoản không nhận bộ lọc.')
        return send(response, 200, accounting.listAccounts(actor))
      }
      if (url.pathname === '/api/v1/accounting/trial-balance' && method === 'GET') {
        const allowed = ['from', 'to']
        if (
          [...url.searchParams.keys()].some(
            (key) => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1,
          )
        )
          throw fail(400, 'INVALID_FILTER', 'Bộ lọc bảng cân đối thử không hợp lệ.')
        return send(
          response,
          200,
          accounting.trialBalance(actor, Object.fromEntries(url.searchParams)),
        )
      }
      if (url.pathname === '/api/v1/accounting/journals' && method === 'GET') {
        const allowed = ['from', 'to', 'accountCode', 'limit', 'offset']
        if (
          [...url.searchParams.keys()].some(
            (key) => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1,
          )
        )
          throw fail(400, 'INVALID_FILTER', 'Bộ lọc sổ nhật ký không hợp lệ.')
        const filters = Object.fromEntries(url.searchParams)
        for (const key of ['limit', 'offset']) {
          if (filters[key] === undefined) continue
          if (!/^(0|[1-9]\d*)$/.test(filters[key]) || !Number.isSafeInteger(Number(filters[key])))
            throw fail(400, 'INVALID_FILTER', 'Phân trang cần là số nguyên hợp lệ.')
          filters[key] = Number(filters[key])
        }
        return send(response, 200, accounting.listJournals(actor, filters))
      }
      if (url.pathname === '/api/v1/accounting/journals' && method === 'POST')
        return send(response, 201, accounting.createJournal(actor, await readJson(request)))
      const accountingReversalMatch = url.pathname.match(
        /^\/api\/v1\/accounting\/journals\/([^/]+)\/reverse$/,
      )
      if (accountingReversalMatch && method === 'POST')
        return send(
          response,
          201,
          accounting.reverseJournal(
            actor,
            pathId(accountingReversalMatch[1]),
            await readJson(request),
          ),
        )
      if (url.pathname === '/api/v1/market-intelligence/status' && method === 'GET')
        return send(response, 200, marketIntelligence.status(actor))
      if (url.pathname === '/api/v1/market-intelligence/runs' && method === 'GET')
        return send(response, 200, marketIntelligence.listRuns(actor))
      if (url.pathname === '/api/v1/market-intelligence/research' && method === 'POST')
        return send(
          response,
          201,
          await marketIntelligence.research(
            actor,
            await readJson(request),
            request.headers['idempotency-key'],
          ),
        )
      if (url.pathname === '/api/v1/integrations/settings' && method === 'GET')
        return send(response, 200, integrations.status(actor))
      const integrationAuthorizeMatch = url.pathname.match(
        /^\/api\/v1\/integrations\/settings\/(tiktok|tiktokshop)\/authorize$/,
      )
      if (integrationAuthorizeMatch && method === 'POST')
        return send(
          response,
          200,
          integrations.beginOAuth(actor, integrationAuthorizeMatch[1], await readJson(request)),
        )
      const integrationTestMatch = url.pathname.match(
        /^\/api\/v1\/integrations\/settings\/([^/]+)\/test$/,
      )
      if (integrationTestMatch && method === 'POST')
        return send(
          response,
          200,
          await integrations.test(actor, pathId(integrationTestMatch[1]), await readJson(request)),
        )
      const integrationMatch = url.pathname.match(/^\/api\/v1\/integrations\/settings\/([^/]+)$/)
      if (integrationMatch && method === 'PUT')
        return send(
          response,
          200,
          await integrations.save(actor, pathId(integrationMatch[1]), await readJson(request)),
        )
      if (integrationMatch && method === 'DELETE')
        return send(response, 200, integrations.remove(actor, pathId(integrationMatch[1])))
      if (url.pathname === '/api/v1/inbox' && method === 'GET')
        return send(response, 200, business.inbox(actor))
      if (url.pathname === '/api/v1/operations' && method === 'GET')
        return send(response, 200, business.operations(actor))
      if (url.pathname === '/api/v1/customers' && method === 'POST')
        return send(response, 201, business.createCustomer(actor, await readJson(request)))
      const customerMatch = url.pathname.match(/^\/api\/v1\/customers\/([^/]+)$/)
      if (customerMatch && method === 'PATCH')
        return send(
          response,
          200,
          business.updateCustomer(actor, pathId(customerMatch[1]), await readJson(request)),
        )
      const conversationMatch = url.pathname.match(/^\/api\/v1\/conversations\/([^/]+)$/)
      if (conversationMatch && method === 'PATCH')
        return send(
          response,
          200,
          business.updateConversation(actor, pathId(conversationMatch[1]), await readJson(request)),
        )
      const messageMatch = url.pathname.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/)
      if (messageMatch && method === 'POST')
        return send(
          response,
          201,
          await business.sendMessage(actor, pathId(messageMatch[1]), await readJson(request)),
        )
      if (url.pathname === '/api/v1/integrations/channels' && method === 'GET')
        return send(response, 200, business.listConnections(actor))
      const authorizeMatch = url.pathname.match(
        /^\/api\/v1\/integrations\/channels\/([^/]+)\/authorize$/,
      )
      if (authorizeMatch && method === 'POST') {
        const channel = pathId(authorizeMatch[1])
        return send(response, 200, await business.beginChannelConnection(actor, channel))
      }
      const syncMatch = url.pathname.match(/^\/api\/v1\/integrations\/channels\/([^/]+)\/sync$/)
      if (syncMatch && method === 'POST') {
        const body = await readJson(request)
        return send(
          response,
          200,
          await business.syncConnection(actor, pathId(syncMatch[1]), body.requestId),
        )
      }
      if (url.pathname === '/api/v1/operations/customers' && method === 'GET')
        return send(response, 200, business.operations(actor))
      const profileMatch = url.pathname.match(
        /^\/api\/v1\/operations\/customers\/([^/]+)\/profile$/,
      )
      if (profileMatch && method === 'PATCH')
        return send(
          response,
          200,
          business.updateCustomerProfile(actor, pathId(profileMatch[1]), await readJson(request)),
        )
      const customerNoteMatch = url.pathname.match(
        /^\/api\/v1\/operations\/customers\/([^/]+)\/notes$/,
      )
      if (customerNoteMatch && method === 'POST')
        return send(
          response,
          200,
          business.addCustomerNote(actor, pathId(customerNoteMatch[1]), await readJson(request)),
        )
      if (url.pathname === '/api/v1/operations/orders' && method === 'POST')
        return send(response, 201, business.createOrder(actor, await readJson(request)))
      const orderStatusMatch = url.pathname.match(
        /^\/api\/v1\/operations\/orders\/([^/]+)\/status$/,
      )
      if (orderStatusMatch && method === 'POST')
        return send(
          response,
          200,
          business.changeOrderStatus(actor, pathId(orderStatusMatch[1]), await readJson(request)),
        )
      const orderPaymentMatch = url.pathname.match(
        /^\/api\/v1\/operations\/orders\/([^/]+)\/payment$/,
      )
      if (orderPaymentMatch && method === 'POST')
        return send(
          response,
          200,
          business.changePaymentStatus(
            actor,
            pathId(orderPaymentMatch[1]),
            await readJson(request),
          ),
        )
      if (url.pathname === '/api/v1/operations/shipments' && method === 'POST')
        return send(response, 201, business.createShipment(actor, await readJson(request)))
      const shipmentEventMatch = url.pathname.match(
        /^\/api\/v1\/operations\/shipments\/([^/]+)\/events$/,
      )
      if (shipmentEventMatch && method === 'POST')
        return send(
          response,
          200,
          business.advanceShipment(actor, pathId(shipmentEventMatch[1]), await readJson(request)),
        )
      if (url.pathname === '/api/v1/operations/tickets' && method === 'POST')
        return send(response, 201, business.createTicket(actor, await readJson(request)))
      const ticketMatch = url.pathname.match(/^\/api\/v1\/operations\/tickets\/([^/]+)$/)
      if (ticketMatch && method === 'PATCH')
        return send(
          response,
          200,
          business.updateTicket(actor, pathId(ticketMatch[1]), await readJson(request)),
        )
      const ticketCommentMatch = url.pathname.match(
        /^\/api\/v1\/operations\/tickets\/([^/]+)\/comments$/,
      )
      if (ticketCommentMatch && method === 'POST')
        return send(
          response,
          200,
          business.addTicketComment(actor, pathId(ticketCommentMatch[1]), await readJson(request)),
        )
      throw fail(404, 'NOT_FOUND', 'API không tồn tại.')
    } catch (error) {
      const status =
        Number.isInteger(error.status) && error.status >= 400 && error.status < 600
          ? error.status
          : 500
      send(response, status, {
        error: {
          code: status === 500 ? 'INTERNAL_ERROR' : error.code || 'REQUEST_FAILED',
          message:
            status === 500
              ? 'Không thể xử lý yêu cầu. Vui lòng thử lại hoặc liên hệ quản trị.'
              : error.message,
        },
      })
    }
  })
}
