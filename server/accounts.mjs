import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { DomainError, transaction } from './database.mjs'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, permissionsForUser } from './access-control.mjs'

const deriveKey = promisify(scrypt)
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const roles = [
  'admin',
  'manager',
  'accountant',
  'staff',
  'receiver',
  'issuer',
  'counter',
  'approver',
  'viewer',
]
const fail = (status, code, message) => {
  throw new DomainError(status, code, message)
}
const hasControls = (value) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
const fields = (input, allowed) => {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    fail(400, 'INVALID_FIELDS', 'Thông tin tài khoản có trường không được hỗ trợ.')
}
const text = (value, label, min = 2, max = 200) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    hasControls(value)
  )
    fail(422, 'INVALID_INPUT', `${label} cần ${min}–${max} ký tự hợp lệ.`)
  return value.trim()
}
const emailAddress = (value) => {
  const email = text(value, 'Email', 3, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(422, 'INVALID_INPUT', 'Email không hợp lệ.')
  return email
}
const passwordValue = (value) => {
  if (
    typeof value !== 'string' ||
    value.length < 10 ||
    value.length > 128 ||
    !value.trim() ||
    hasControls(value)
  )
    fail(422, 'INVALID_PASSWORD', 'Mật khẩu cần từ 10 đến 128 ký tự.')
  return value
}
const passwordHash = async (password) => {
  const salt = randomBytes(16)
  const hash = await deriveKey(password, salt, 64, parameters)
  return `scrypt$32768$8$1$${salt.toString('base64')}$${hash.toString('base64')}`
}
const verifyPassword = async (password, encoded) => {
  const parts = encoded?.split('$')
  const valid = parts?.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$32768$8$1'
  const salt = valid ? Buffer.from(parts[4], 'base64') : Buffer.alloc(16)
  const expected = valid ? Buffer.from(parts[5], 'base64') : Buffer.alloc(64)
  const hash = await deriveKey(password, salt, 64, parameters)
  return Boolean(valid && expected.length === hash.length && timingSafeEqual(hash, expected))
}

export function createAccounts(db, { now = () => new Date() } = {}) {
  const identity = (actor) => {
    const row = db
      .prepare(
        `SELECT u.id,u.name,u.role,u.tenant_id,t.name AS company_name,c.email
      FROM users u JOIN tenants t ON t.id=u.tenant_id
      LEFT JOIN account_credentials c ON c.user_id=u.id AND c.tenant_id=u.tenant_id
      WHERE u.id=? AND u.tenant_id=? AND u.active=1`,
      )
      .get(actor.userId, actor.tenantId)
    if (!row) fail(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
    const permissions = permissionsForUser(db, row.tenant_id, row.id, row.role)
    if (['owner', 'admin'].includes(row.role)) permissions.push('account.users.manage')
    return {
      actor: { userId: row.id, tenantId: row.tenant_id, role: row.role },
      user: { id: row.id, name: row.name, email: row.email ?? null, role: row.role },
      tenant: { id: row.tenant_id, name: row.company_name },
      permissions: [...new Set(permissions)],
    }
  }
  const requireManager = (actor) => {
    const value = identity(actor)
    if (!value.permissions.includes('account.users.manage'))
      fail(403, 'FORBIDDEN', 'Bạn không có quyền quản lý tài khoản nhân viên.')
    return value
  }
  const availableEmail = (email) => {
    if (db.prepare('SELECT user_id FROM account_credentials WHERE email=?').get(email))
      fail(409, 'EMAIL_IN_USE', 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.')
  }
  const audit = (actor, action, entityId, details) =>
    db
      .prepare(
        'INSERT INTO audit_events(id,tenant_id,actor_id,action,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        actor.tenantId,
        actor.userId,
        action,
        entityId,
        JSON.stringify(details),
        now().toISOString(),
      )
  const createCredentials = (userId, tenantId, email, hash, stamp) =>
    db
      .prepare(
        'INSERT INTO account_credentials(user_id,tenant_id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .run(userId, tenantId, email, hash, stamp, stamp)
  const recordLogin = (email, user, succeeded, context = {}) =>
    db
      .prepare(
        `INSERT INTO login_events(
          id,tenant_id,user_id,email_hash,succeeded,remote_address,user_agent,created_at
        ) VALUES(?,?,?,?,?,?,?,?)`,
      )
      .run(
        randomUUID(),
        user?.tenant_id ?? null,
        user?.id ?? null,
        createHash('sha256').update(email).digest('hex'),
        Number(succeeded),
        typeof context.remoteAddress === 'string' ? context.remoteAddress.slice(0, 100) : '',
        typeof context.userAgent === 'string' ? context.userAgent.slice(0, 300) : '',
        now().toISOString(),
      )

  return {
    identity,
    async register(input) {
      fields(input, ['companyName', 'name', 'email', 'password'])
      const companyName = text(input.companyName, 'Tên doanh nghiệp')
      const name = text(input.name, 'Tên người dùng')
      const email = emailAddress(input.email)
      const password = passwordValue(input.password)
      availableEmail(email)
      const hash = await passwordHash(password)
      return transaction(db, () => {
        availableEmail(email)
        const stamp = now().toISOString()
        const tenantId = randomUUID()
        const userId = randomUUID()
        const warehouseId = randomUUID()
        const locationId = randomUUID()
        db.prepare('INSERT INTO tenants(id,name,config_json,created_at) VALUES(?,?,?,?)').run(
          tenantId,
          companyName,
          '{}',
          stamp,
        )
        db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
          userId,
          tenantId,
          name,
          'owner',
        )
        createCredentials(userId, tenantId, email, hash, stamp)
        db.prepare(
          'INSERT INTO warehouses(id,tenant_id,code,name,created_at) VALUES(?,?,?,?,?)',
        ).run(warehouseId, tenantId, 'MAIN', 'Kho mặc định', stamp)
        db.prepare(
          'INSERT INTO locations(id,tenant_id,warehouse_id,code,name,is_default) VALUES(?,?,?,?,?,1)',
        ).run(locationId, tenantId, warehouseId, 'DEFAULT', 'Vị trí mặc định')
        const actor = { userId, tenantId, role: 'owner' }
        audit(actor, 'account.register', userId, { warehouseId })
        return identity(actor)
      })
    },
    async login(input, context) {
      fields(input, ['email', 'password'])
      const email = emailAddress(input.email)
      // Reject oversized input before password derivation; all other failures use one response.
      if (typeof input.password !== 'string' || input.password.length > 128)
        fail(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')
      const row = db
        .prepare(
          `SELECT c.password_hash,u.id,u.tenant_id,u.active
        FROM account_credentials c JOIN users u ON u.id=c.user_id AND u.tenant_id=c.tenant_id WHERE c.email=?`,
        )
        .get(email)
      const valid = await verifyPassword(input.password, row?.password_hash)
      if (!row || !valid || !row.active) {
        recordLogin(email, row, false, context)
        fail(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')
      }
      recordLogin(email, row, true, context)
      return identity({ userId: row.id, tenantId: row.tenant_id })
    },
    loginEvents(actor) {
      const current = requireManager(actor)
      return {
        events: db
          .prepare(
            `SELECT e.id,e.user_id AS userId,u.name AS userName,c.email,e.succeeded,
              e.remote_address AS remoteAddress,e.user_agent AS userAgent,e.created_at AS createdAt
            FROM login_events e
            LEFT JOIN users u ON u.id=e.user_id AND u.tenant_id=e.tenant_id
            LEFT JOIN account_credentials c ON c.user_id=e.user_id AND c.tenant_id=e.tenant_id
            WHERE e.tenant_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 100`,
          )
          .all(current.tenant.id)
          .map((row) => ({ ...row, succeeded: Boolean(row.succeeded) })),
      }
    },
    permissionCatalog(actor) {
      requireManager(actor)
      return {
        permissions: ALL_PERMISSIONS,
        defaults: DEFAULT_ROLE_PERMISSIONS,
      }
    },
    listUsers(actor) {
      const current = requireManager(actor)
      const currentTime = now()
      const onlineSince = new Date(currentTime.getTime() - 5 * 60 * 1000).toISOString()
      return {
        users: db
          .prepare(
            `SELECT u.id,u.name,u.role,u.active,c.email,u.last_activity_at AS lastActivityAt,
              CASE WHEN u.active=1 AND u.last_activity_at>=?
                AND EXISTS (
                  SELECT 1 FROM access_tokens s
                  WHERE s.user_id=u.id AND s.tenant_id=u.tenant_id AND s.expires_at>?
                )
                THEN 1 ELSE 0 END AS isOnline
        FROM users u LEFT JOIN account_credentials c ON c.user_id=u.id AND c.tenant_id=u.tenant_id
        WHERE u.tenant_id=? ORDER BY u.name,u.id`,
          )
          .all(onlineSince, currentTime.toISOString(), current.tenant.id)
          .map((row) => ({
            ...row,
            active: Boolean(row.active),
            isOnline: Boolean(row.isOnline),
            lastActivityAt: row.lastActivityAt ?? null,
            email: row.email ?? null,
            permissions: permissionsForUser(db, current.tenant.id, row.id, row.role),
          })),
      }
    },
    userActivity(actor, userId) {
      const current = requireManager(actor)
      const target = db
        .prepare('SELECT id FROM users WHERE id=? AND tenant_id=?')
        .get(userId, current.tenant.id)
      if (!target) fail(404, 'NOT_FOUND', 'Không tìm thấy nhân viên trong doanh nghiệp.')
      const events = db
        .prepare(
          `SELECT id,kind,action,entity_id AS entityId,details_json AS detailsJson,succeeded,created_at AS createdAt
          FROM (
            SELECT id,'login' AS kind,
              CASE WHEN succeeded=1 THEN 'login.success' ELSE 'login.failure' END AS action,
              NULL AS entity_id,NULL AS details_json,succeeded,created_at
            FROM login_events WHERE tenant_id=? AND user_id=?
            UNION ALL
            SELECT id,'action' AS kind,action,entity_id,details_json,NULL AS succeeded,created_at
            FROM audit_events WHERE tenant_id=? AND actor_id=?
          )
          ORDER BY createdAt DESC,id DESC LIMIT 100`,
        )
        .all(current.tenant.id, userId, current.tenant.id, userId)
        .map((row) => {
          const details = row.detailsJson ? JSON.parse(row.detailsJson) : null
          return {
            id: row.id,
            kind: row.kind,
            action: row.action,
            entityId: row.entityId,
            description:
              details && typeof details.description === 'string' ? details.description : null,
            succeeded: row.succeeded === null ? null : Boolean(row.succeeded),
            createdAt: row.createdAt,
          }
        })
      return { events }
    },
    updateUserPermissions(actor, userId, input) {
      fields(input, ['overrides'])
      if (
        !Array.isArray(input.overrides) ||
        input.overrides.length > ALL_PERMISSIONS.length ||
        input.overrides.some(
          (override) =>
            !override ||
            typeof override !== 'object' ||
            Array.isArray(override) ||
            Object.keys(override).some((key) => !['permission', 'granted'].includes(key)) ||
            !ALL_PERMISSIONS.includes(override.permission) ||
            (typeof override.granted !== 'boolean' && override.granted !== null),
        )
      )
        fail(422, 'INVALID_INPUT', 'Danh sách quyền truy cập không hợp lệ.')
      if (
        new Set(input.overrides.map((override) => override.permission)).size !==
        input.overrides.length
      )
        fail(422, 'INVALID_INPUT', 'Danh sách quyền có mục trùng lặp.')
      return transaction(db, () => {
        const current = requireManager(actor)
        const target = db
          .prepare('SELECT id,role FROM users WHERE id=? AND tenant_id=?')
          .get(userId, current.tenant.id)
        if (!target) fail(404, 'NOT_FOUND', 'Không tìm thấy nhân viên trong doanh nghiệp.')
        if (
          target.id === current.user.id ||
          target.role === 'owner' ||
          (current.user.role === 'admin' && target.role === 'admin')
        )
          fail(403, 'FORBIDDEN', 'Không được thay đổi quyền truy cập cho tài khoản này.')
        const upsert = db.prepare(
          `INSERT INTO user_permission_overrides(
            tenant_id,user_id,permission,granted,updated_by,updated_at
          ) VALUES(?,?,?,?,?,?)
          ON CONFLICT(tenant_id,user_id,permission) DO UPDATE SET
            granted=excluded.granted,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        )
        const remove = db.prepare(
          'DELETE FROM user_permission_overrides WHERE tenant_id=? AND user_id=? AND permission=?',
        )
        const stamp = now().toISOString()
        for (const override of input.overrides) {
          if (override.granted === null) remove.run(current.tenant.id, userId, override.permission)
          else
            upsert.run(
              current.tenant.id,
              userId,
              override.permission,
              Number(override.granted),
              current.user.id,
              stamp,
            )
        }
        db.prepare('DELETE FROM access_tokens WHERE user_id=? AND tenant_id=?').run(
          userId,
          current.tenant.id,
        )
        audit(current.actor, 'account.user.permissions.update', userId, {
          overrides: input.overrides,
        })
        return {
          updated: true,
          permissions: permissionsForUser(db, current.tenant.id, userId, target.role),
        }
      })
    },
    async createUser(actor, input) {
      const current = requireManager(actor)
      fields(input, ['name', 'email', 'password', 'role'])
      const name = text(input.name, 'Tên nhân viên')
      const email = emailAddress(input.email)
      const password = passwordValue(input.password)
      if (!roles.includes(input.role) || (current.user.role === 'admin' && input.role === 'admin'))
        fail(403, 'FORBIDDEN', 'Bạn không được cấp vai trò này.')
      availableEmail(email)
      const hash = await passwordHash(password)
      return transaction(db, () => {
        const manager = requireManager(actor)
        if (manager.user.role === 'admin' && input.role === 'admin')
          fail(403, 'FORBIDDEN', 'Bạn không được cấp vai trò này.')
        availableEmail(email)
        const stamp = now().toISOString()
        const userId = randomUUID()
        db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
          userId,
          manager.tenant.id,
          name,
          input.role,
        )
        createCredentials(userId, manager.tenant.id, email, hash, stamp)
        audit(manager.actor, 'account.user.create', userId, { role: input.role })
        return { user: { id: userId, name, email, role: input.role, active: true } }
      })
    },
    updateUser(actor, userId, input) {
      fields(input, ['role', 'active'])
      if (!Object.keys(input).length)
        fail(422, 'INVALID_INPUT', 'Chọn vai trò hoặc trạng thái cần cập nhật.')
      if (input.role !== undefined && !roles.includes(input.role))
        fail(422, 'INVALID_INPUT', 'Vai trò không hợp lệ.')
      if (input.active !== undefined && typeof input.active !== 'boolean')
        fail(422, 'INVALID_INPUT', 'Trạng thái active phải là boolean.')
      return transaction(db, () => {
        const current = requireManager(actor)
        const target = db
          .prepare('SELECT id,role FROM users WHERE id=? AND tenant_id=?')
          .get(userId, current.tenant.id)
        if (!target) fail(404, 'NOT_FOUND', 'Không tìm thấy nhân viên trong doanh nghiệp.')
        if (
          target.id === current.user.id ||
          target.role === 'owner' ||
          (current.user.role === 'admin' && (target.role === 'admin' || input.role === 'admin'))
        )
          fail(403, 'FORBIDDEN', 'Không được thay đổi tài khoản hoặc vai trò này.')
        db.prepare(
          'UPDATE users SET role=COALESCE(?,role),active=COALESCE(?,active) WHERE id=? AND tenant_id=?',
        ).run(
          input.role ?? null,
          input.active === undefined ? null : Number(input.active),
          userId,
          current.tenant.id,
        )
        if (input.role !== undefined && input.role !== target.role)
          db.prepare('DELETE FROM user_permission_overrides WHERE tenant_id=? AND user_id=?').run(
            current.tenant.id,
            userId,
          )
        db.prepare('DELETE FROM access_tokens WHERE user_id=? AND tenant_id=?').run(
          userId,
          current.tenant.id,
        )
        audit(current.actor, 'account.user.update', userId, input)
        return { updated: true }
      })
    },
    async resetUserPassword(actor, userId, input) {
      fields(input, ['password'])
      const password = passwordValue(input.password)
      const current = requireManager(actor)
      const initialTarget = db
        .prepare('SELECT id,role FROM users WHERE id=? AND tenant_id=?')
        .get(userId, current.tenant.id)
      if (!initialTarget) fail(404, 'NOT_FOUND', 'Không tìm thấy nhân viên trong doanh nghiệp.')
      if (
        initialTarget.id === current.user.id ||
        initialTarget.role === 'owner' ||
        (current.user.role === 'admin' && initialTarget.role === 'admin')
      )
        fail(403, 'FORBIDDEN', 'Không được đặt lại mật khẩu cho tài khoản này.')
      const hash = await passwordHash(password)
      return transaction(db, () => {
        const current = requireManager(actor)
        const target = db
          .prepare('SELECT id,role FROM users WHERE id=? AND tenant_id=?')
          .get(userId, current.tenant.id)
        if (!target) fail(404, 'NOT_FOUND', 'Không tìm thấy nhân viên trong doanh nghiệp.')
        if (
          target.id === current.user.id ||
          target.role === 'owner' ||
          (current.user.role === 'admin' && target.role === 'admin')
        )
          fail(403, 'FORBIDDEN', 'Không được đặt lại mật khẩu cho tài khoản này.')
        const updated = db
          .prepare(
            'UPDATE account_credentials SET password_hash=?,updated_at=? WHERE user_id=? AND tenant_id=?',
          )
          .run(hash, now().toISOString(), userId, current.tenant.id)
        if (Number(updated.changes) !== 1)
          fail(409, 'CREDENTIALS_NOT_FOUND', 'Tài khoản chưa có thông tin đăng nhập để đặt lại.')
        db.prepare('DELETE FROM access_tokens WHERE user_id=? AND tenant_id=?').run(
          userId,
          current.tenant.id,
        )
        audit(current.actor, 'account.user.password.reset', userId, {})
        return { reset: true }
      })
    },
    async changePassword(actor, input) {
      fields(input, ['currentPassword', 'newPassword'])
      if (typeof input.currentPassword !== 'string' || input.currentPassword.length > 128)
        fail(422, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.')
      const current = identity(actor)
      const credential = db
        .prepare('SELECT password_hash FROM account_credentials WHERE user_id=? AND tenant_id=?')
        .get(current.user.id, current.tenant.id)
      if (!credential || !(await verifyPassword(input.currentPassword, credential.password_hash)))
        fail(422, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.')
      const newPassword = passwordValue(input.newPassword)
      if (await verifyPassword(newPassword, credential.password_hash))
        fail(422, 'PASSWORD_UNCHANGED', 'Mật khẩu mới phải khác mật khẩu hiện tại.')
      const hash = await passwordHash(newPassword)
      return transaction(db, () => {
        const verified = identity(actor)
        const updated = db
          .prepare(
            'UPDATE account_credentials SET password_hash=?,updated_at=? WHERE user_id=? AND tenant_id=? AND password_hash=?',
          )
          .run(
            hash,
            now().toISOString(),
            current.user.id,
            current.tenant.id,
            credential.password_hash,
          )
        if (Number(updated.changes) !== 1)
          fail(409, 'CREDENTIALS_CHANGED', 'Thông tin đăng nhập vừa được cập nhật. Hãy thử lại.')
        db.prepare('DELETE FROM access_tokens WHERE user_id=? AND tenant_id=?').run(
          verified.user.id,
          verified.tenant.id,
        )
        audit(verified.actor, 'account.password.change', verified.user.id, {})
        return { changed: true }
      })
    },
  }
}
