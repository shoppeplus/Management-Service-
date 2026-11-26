import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
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

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://inventory.local')
      const method = request.method
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
      const origin = request.headers.origin
      const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
      if (mutation && origin && !allowedOrigins.includes(origin))
        throw fail(403, 'ORIGIN_DENIED', 'Nguồn gửi yêu cầu không được phép.')
      if (mutation && !bearer && cookieToken(request) && !origin)
        throw fail(403, 'ORIGIN_REQUIRED', 'Thiếu nguồn gửi yêu cầu cho phiên trình duyệt.')

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
        return send(response, 200, accounting.trialBalance(actor, Object.fromEntries(url.searchParams)))
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
