import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.mjs'
import { createInventory } from './inventory.mjs'
import { createInventoryServer, hashToken } from './http.mjs'

const origin = 'http://127.0.0.1:5173'
const timestamp = '2026-11-18T02:00:00.000Z'
const registration = (suffix = 'a') => ({
  companyName: `Doanh nghiệp ${suffix.toUpperCase()}`,
  name: 'Người quản lý',
  email: `owner-${suffix}@example.com`,
  password: 'test-only-password-1234',
})

describe('Global business accounts and tenant permissions', () => {
  let db
  let server
  let baseUrl
  let currentTime
  const request = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...(method === 'GET' ? {} : { Origin: origin }),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      headers: response.headers,
    }
  }
  const register = (suffix = 'a') =>
    request('/auth/register', { method: 'POST', body: registration(suffix) })
  const login = (email, password = registration().password) =>
    request('/auth/login', { method: 'POST', body: { email, password } })

  beforeEach(async () => {
    db = openDatabase()
    currentTime = new Date(timestamp)
    server = createInventoryServer({
      db,
      inventory: createInventory(db),
      allowedOrigins: [origin],
      secureCookies: true,
      now: () => currentTime,
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })
  afterEach(async () => {
    if (server) {
      const closed = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
      server.closeAllConnections()
      await closed
    }
    db?.close()
  })

  it('registers an owner with a separate empty default warehouse and an authenticated session', async () => {
    const result = await register()
    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({
      user: { name: 'Người quản lý', email: 'owner-a@example.com', role: 'owner' },
      tenant: { name: 'Doanh nghiệp A' },
    })
    expect(result.body.permissions).toEqual(
      expect.arrayContaining(['account.users.manage', 'sku.create', 'document.post']),
    )
    expect(result.headers.get('set-cookie')).toContain('HttpOnly')
    expect(result.headers.get('set-cookie')).toContain('SameSite=Strict')
    expect(result.headers.get('set-cookie')).toContain('Secure')
    expect(result.headers.get('cache-control')).toBe('no-store')
    const snapshot = await request('/inventory/snapshot', { cookie: result.cookie })
    expect(snapshot.status).toBe(200)
    expect(snapshot.body.warehouses).toEqual([
      expect.objectContaining({ code: 'MAIN', name: 'Kho mặc định', active: true }),
    ])
    expect(snapshot.body.locations).toEqual([
      expect.objectContaining({ code: 'DEFAULT', isDefault: true }),
    ])
    expect(snapshot.body.skus).toEqual([])
    expect(snapshot.body.balances).toEqual([])
    expect(snapshot.body.permissions).toContain('sku.create')
    const credential = db.prepare('SELECT * FROM account_credentials').get()
    expect(credential.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(credential.password_hash).not.toContain(registration().password)
    expect(JSON.stringify(result.body)).not.toContain('password')
    expect(JSON.stringify(db.prepare('SELECT * FROM audit_events').all())).not.toContain(
      registration().password,
    )
    const token = result.cookie.slice('inventory_session='.length)
    expect(db.prepare('SELECT token_hash FROM access_tokens').get().token_hash).toBe(
      hashToken(token),
    )
    expect(await request('/auth/me', { cookie: result.cookie })).toMatchObject({
      status: 200,
      body: result.body,
    })
  })

  it('normalizes email, rejects duplicate registrations without extra tenants, and signs in with a new session', async () => {
    const owner = await register()
    const duplicate = await request('/auth/register', {
      method: 'POST',
      body: { ...registration(), email: '  OWNER-A@EXAMPLE.COM  ' },
    })
    expect(duplicate).toMatchObject({ status: 409, body: { error: { code: 'EMAIL_IN_USE' } } })
    expect(db.prepare('SELECT COUNT(*) AS total FROM tenants').get().total).toBe(1)
    const signedIn = await login(' OWNER-A@EXAMPLE.COM ')
    expect(signedIn).toMatchObject({ status: 200, body: owner.body })
    expect(signedIn.cookie).not.toBe(owner.cookie)
    expect(await login('owner-a@example.com', 'wrong-password')).toMatchObject({
      status: 401,
      body: { error: { code: 'INVALID_CREDENTIALS' } },
    })
    expect(await login('unknown@example.com')).toMatchObject({
      status: 401,
      body: { error: { code: 'INVALID_CREDENTIALS' } },
    })
  })

  it('rejects role or tenant injection and invalid credentials before creating any records', async () => {
    const extra = await request('/auth/register', {
      method: 'POST',
      body: { ...registration(), tenantId: 'other', role: 'owner' },
    })
    expect(extra.status).toBe(400)
    const weak = await request('/auth/register', {
      method: 'POST',
      body: { ...registration(), password: 'short' },
    })
    expect(weak).toMatchObject({ status: 422, body: { error: { code: 'INVALID_PASSWORD' } } })
    expect(db.prepare('SELECT COUNT(*) AS total FROM tenants').get().total).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS total FROM users').get().total).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS total FROM account_credentials').get().total).toBe(0)
  })

  it('rolls back the entire registration if default warehouse provisioning fails', async () => {
    db.exec(
      "CREATE TRIGGER fail_warehouse BEFORE INSERT ON warehouses BEGIN SELECT RAISE(ABORT,'Simulated warehouse failure'); END;",
    )
    expect((await register()).status).toBe(500)
    for (const table of [
      'tenants',
      'users',
      'warehouses',
      'locations',
      'account_credentials',
      'access_tokens',
      'audit_events',
    ])
      expect(db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total).toBe(0)
  })

  it('isolates two business accounts and scopes managed staff and stock permissions to their business', async () => {
    const a = await register('a')
    const b = await register('b')
    expect(a.body.tenant.id).not.toBe(b.body.tenant.id)
    const create = await request('/auth/users', {
      method: 'POST',
      cookie: a.cookie,
      body: {
        name: 'Nhân viên xem',
        email: 'viewer@example.com',
        password: registration().password,
        role: 'viewer',
      },
    })
    expect(create.status).toBe(201)
    const viewer = await login('viewer@example.com')
    expect(viewer.body.tenant.id).toBe(a.body.tenant.id)
    expect(viewer.body.permissions).toEqual([])
    const snapshot = await request('/inventory/snapshot', { cookie: viewer.cookie })
    expect(snapshot.body.permissions).toEqual([])
    expect((await request('/auth/users', { cookie: viewer.cookie })).status).toBe(403)
    const ownList = await request('/auth/users', { cookie: a.cookie })
    expect(ownList.body.users.map((user) => user.email)).toEqual(
      expect.arrayContaining(['owner-a@example.com', 'viewer@example.com']),
    )
    expect(ownList.body.users).toHaveLength(2)
    expect((await request('/auth/users', { cookie: b.cookie })).body.users).toHaveLength(1)
    expect(
      (
        await request(`/auth/users/${create.body.user.id}`, {
          method: 'PATCH',
          cookie: b.cookie,
          body: { active: false },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await request(`/auth/users/${create.body.user.id}/activity`, {
          cookie: b.cookie,
        })
      ).status,
    ).toBe(404)
    expect((await request('/auth/me?tenantId=other', { cookie: a.cookie })).status).toBe(400)
    expect(
      (await request('/inventory/snapshot?tenantId=other', { cookie: viewer.cookie })).status,
    ).toBe(400)
    expect(db.prepare('SELECT COUNT(*) AS total FROM warehouses').get().total).toBe(2)
  })

  it('revokes staff sessions when permissions change and prevents self or owner privilege changes', async () => {
    const owner = await register()
    const staff = await request('/auth/users', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        name: 'Nhân viên',
        email: 'staff@example.com',
        password: registration().password,
        role: 'viewer',
      },
    })
    const session = await login('staff@example.com')
    expect(
      (
        await request(`/auth/users/${owner.body.user.id}`, {
          method: 'PATCH',
          cookie: owner.cookie,
          body: { active: false },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await request(`/auth/users/${staff.body.user.id}`, {
          method: 'PATCH',
          cookie: owner.cookie,
          body: { role: 'manager' },
        })
      ).status,
    ).toBe(200)
    expect((await request('/auth/me', { cookie: session.cookie })).status).toBe(401)
    const manager = await login('staff@example.com')
    expect(manager.body.user.role).toBe('manager')
    expect(
      (await request('/inventory/snapshot', { cookie: manager.cookie })).body.permissions,
    ).toContain('sku.create')
    expect(
      (
        await request(`/auth/users/${staff.body.user.id}`, {
          method: 'PATCH',
          cookie: owner.cookie,
          body: { active: false },
        })
      ).status,
    ).toBe(200)
    expect((await login('staff@example.com')).status).toBe(401)
  })

  it('creates receiving accounts with product and receipt permissions', async () => {
    const owner = await register()
    const created = await request('/auth/users', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        name: 'Nhân viên kho',
        email: 'receiver@example.com',
        password: registration().password,
        role: 'receiver',
      },
    })
    expect(created.status).toBe(201)
    const signedIn = await login('receiver@example.com')
    expect(signedIn.body.user).toMatchObject({
      name: 'Nhân viên kho',
      role: 'receiver',
    })
    const snapshot = await request('/inventory/snapshot', { cookie: signedIn.cookie })
    expect(snapshot.body.permissions).toEqual(
      expect.arrayContaining([
        'sku.create',
        'sku.update',
        'document.transfer_receive',
      ]),
    )
    expect(snapshot.body.permissions).not.toContain('document.create')
    expect(snapshot.body.permissions).not.toContain('document.approve')
    expect(snapshot.body.permissions).not.toContain('document.post')
    expect(snapshot.body.permissions).not.toContain('purchaseOrder.receive')
    expect(snapshot.body.permissions).not.toContain('config.update')
  })

  it('gives accountants purchase approval without order creation or receiving rights', async () => {
    const owner = await register()
    const created = await request('/auth/users', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        name: 'Kế toán',
        email: 'accountant@example.com',
        password: registration().password,
        role: 'accountant',
      },
    })
    expect(created.status).toBe(201)
    const signedIn = await login('accountant@example.com')
    const snapshot = await request('/inventory/snapshot', { cookie: signedIn.cookie })
    expect(snapshot.body.permissions).toContain('purchaseOrder.approve')
    expect(snapshot.body.permissions).not.toContain('purchaseOrder.create')
    expect(snapshot.body.permissions).not.toContain('purchaseOrder.receive')
    expect(snapshot.body.purchaseRequests).toEqual([])
  })

  it('prevents admins from granting admin or owner privileges while allowing lower roles', async () => {
    const owner = await register()
    const admin = await request('/auth/users', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        name: 'Quản trị viên',
        email: 'admin@example.com',
        password: registration().password,
        role: 'admin',
      },
    })
    expect(admin.status).toBe(201)
    const session = await login('admin@example.com')
    expect(session.body.permissions).toEqual(
      expect.arrayContaining(['account.users.manage', 'operations.read', 'inbox.read']),
    )
    for (const permission of [
      'customers.manage',
      'crm.manage',
      'orders.manage',
      'logistics.manage',
      'care.manage',
      'sku.create',
      'document.post',
    ])
      expect(session.body.permissions).not.toContain(permission)
    for (const role of ['admin', 'owner'])
      expect(
        (
          await request('/auth/users', {
            method: 'POST',
            cookie: session.cookie,
            body: {
              name: 'Không cấp',
              email: `${role}@example.com`,
              password: registration().password,
              role,
            },
          })
        ).status,
      ).toBe(403)
    expect(
      (
        await request(`/auth/users/${owner.body.user.id}`, {
          method: 'PATCH',
          cookie: session.cookie,
          body: { role: 'viewer' },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await request('/auth/users', {
          method: 'POST',
          cookie: session.cookie,
          body: {
            name: 'Nhân viên',
            email: 'new-staff@example.com',
            password: registration().password,
            role: 'staff',
          },
        })
      ).status,
    ).toBe(201)
  })

  it('records sign-in outcomes and lets managers reset employee passwords with session revocation', async () => {
    const owner = await register()
    const employee = await request('/auth/users', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        name: 'Nhân viên',
        email: 'employee@example.com',
        password: registration().password,
        role: 'receiver',
      },
    })
    expect(employee.status).toBe(201)
    const oldSession = await login('employee@example.com')
    expect(oldSession.status).toBe(200)
    expect(await login('employee@example.com', 'incorrect-password')).toMatchObject({ status: 401 })

    db.prepare(
      'INSERT INTO audit_events(id,tenant_id,actor_id,action,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      'employee-action-1',
      owner.body.tenant.id,
      employee.body.user.id,
      'order.created',
      'order-1',
      JSON.stringify({ description: 'Tạo đơn bán SO-1.' }),
      timestamp,
    )
    const activity = await request(`/auth/users/${employee.body.user.id}/activity`, {
      cookie: owner.cookie,
    })
    expect(activity.status).toBe(200)
    expect(activity.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'login.success', succeeded: true }),
        expect.objectContaining({ action: 'login.failure', succeeded: false }),
        expect.objectContaining({
          action: 'order.created',
          description: 'Tạo đơn bán SO-1.',
          succeeded: null,
        }),
      ]),
    )
    expect(
      (
        await request(`/auth/users/${employee.body.user.id}/activity`, {
          cookie: oldSession.cookie,
        })
      ).status,
    ).toBe(403)

    const history = await request('/auth/login-events', { cookie: owner.cookie })
    expect(history.status).toBe(200)
    expect(history.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'employee@example.com',
          succeeded: true,
        }),
        expect.objectContaining({
          email: 'employee@example.com',
          succeeded: false,
        }),
      ]),
    )
    expect(JSON.stringify(history.body)).not.toContain('incorrect-password')
    expect((await request('/auth/login-events', { cookie: oldSession.cookie })).status).toBe(403)

    const listed = await request('/auth/users', { cookie: owner.cookie })
    const listedEmployee = listed.body.users.find((user) => user.id === employee.body.user.id)
    expect(listedEmployee).toMatchObject({
      isOnline: true,
      lastActivityAt: timestamp,
    })
    currentTime = new Date(currentTime.getTime() + 6 * 60 * 1000)
    const idle = await request('/auth/users', { cookie: owner.cookie })
    expect(idle.body.users.find((user) => user.id === employee.body.user.id)).toMatchObject({
      isOnline: false,
      lastActivityAt: timestamp,
    })
    await request('/auth/me', { cookie: oldSession.cookie })
    const returned = await request('/auth/users', { cookie: owner.cookie })
    expect(returned.body.users.find((user) => user.id === employee.body.user.id)).toMatchObject({
      isOnline: true,
      lastActivityAt: currentTime.toISOString(),
    })

    expect(
      await request(`/auth/users/${employee.body.user.id}/password`, {
        method: 'POST',
        cookie: owner.cookie,
        body: { password: 'new-test-password-9876' },
      }),
    ).toMatchObject({ status: 200, body: { reset: true } })
    expect((await request('/auth/me', { cookie: oldSession.cookie })).status).toBe(401)
    expect((await login('employee@example.com')).status).toBe(401)
    expect((await login('employee@example.com', 'new-test-password-9876')).status).toBe(200)
  })

  it('lets a signed-in user change their password and replaces all old sessions', async () => {
    const owner = await register()
    const otherSession = await login(registration().email)
    const changed = await request('/auth/password', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        currentPassword: registration().password,
        newPassword: 'new-owner-password-5678',
      },
    })

    expect(changed).toMatchObject({ status: 200, body: { changed: true } })
    expect(changed.cookie).not.toBe(owner.cookie)
    expect((await request('/auth/me', { cookie: changed.cookie })).status).toBe(200)
    expect((await request('/auth/me', { cookie: owner.cookie })).status).toBe(401)
    expect((await request('/auth/me', { cookie: otherSession.cookie })).status).toBe(401)
    expect((await login(registration().email)).status).toBe(401)
    expect((await login(registration().email, 'new-owner-password-5678')).status).toBe(200)
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action='account.password.change'",
        )
        .get().count,
    ).toBe(1)
  })

  it('rejects password changes with an incorrect current password or an unchanged password', async () => {
    const owner = await register()
    expect(
      await request('/auth/password', {
        method: 'POST',
        cookie: owner.cookie,
        body: { currentPassword: 'incorrect-password', newPassword: 'new-owner-password-5678' },
      }),
    ).toMatchObject({
      status: 422,
      body: { error: { code: 'INVALID_CURRENT_PASSWORD' } },
    })
    expect(
      await request('/auth/password', {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          currentPassword: registration().password,
          newPassword: registration().password,
        },
      }),
    ).toMatchObject({ status: 422, body: { error: { code: 'PASSWORD_UNCHANGED' } } })
    expect((await request('/auth/me', { cookie: owner.cookie })).status).toBe(200)
  })

  it('lets managers override role permissions and enforces changes on the API', async () => {
    const owner = await register()
    const employee = await request('/auth/users', {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        name: 'Nhân viên chỉ xem',
        email: 'viewer@example.com',
        password: registration().password,
        role: 'viewer',
      },
    })
    const viewer = await login('viewer@example.com')
    const command = (cookie, key) =>
      request('/inventory/commands', {
        method: 'POST',
        cookie,
        headers: { 'Idempotency-Key': key },
        body: { action: 'sku.create', input: { sku: `TEST-${key}`, name: 'Hàng thử' } },
      })
    expect((await command(viewer.cookie, 'viewer-key-0001')).status).toBe(403)

    const changed = await request(`/auth/users/${employee.body.user.id}/permissions`, {
      method: 'PATCH',
      cookie: owner.cookie,
      body: { overrides: [{ permission: 'sku.create', granted: true }] },
    })
    expect(changed).toMatchObject({
      status: 200,
      body: { updated: true, permissions: expect.arrayContaining(['sku.create']) },
    })
    expect((await request('/auth/me', { cookie: viewer.cookie })).status).toBe(401)
    const updatedViewer = await login('viewer@example.com')
    expect((await command(updatedViewer.cookie, 'viewer-key-0002')).status).toBe(200)
    expect(
      await request(`/auth/users/${employee.body.user.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        body: { role: 'counter' },
      }),
    ).toMatchObject({ status: 200 })
    const changedRoleSession = await login('viewer@example.com')
    const changedRoleSnapshot = await request('/inventory/snapshot', {
      cookie: changedRoleSession.cookie,
    })
    expect(changedRoleSnapshot.body.permissions).not.toContain('sku.create')
    expect(changedRoleSnapshot.body.permissions).toContain('count.create')
  })

  it('expires and explicitly revokes login sessions, and protects account mutations with origin checks', async () => {
    const owner = await register()
    const hostile = await fetch(`${baseUrl}/api/v1/auth/users`, {
      method: 'POST',
      headers: {
        Cookie: owner.cookie,
        Origin: 'https://hostile.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    expect(hostile.status).toBe(403)
    currentTime = new Date(new Date(timestamp).getTime() + 28800001)
    expect((await request('/auth/me', { cookie: owner.cookie })).status).toBe(401)
    const session = await login(registration().email)
    expect(session.status).toBe(200)
    const logout = await request('/auth/logout', { method: 'POST', cookie: session.cookie })
    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await request('/auth/me', { cookie: session.cookie })).status).toBe(401)
  })
})
