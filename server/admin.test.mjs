// @vitest-environment node
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.mjs'
import { hashToken } from './http.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const adminPath = fileURLToPath(new URL('./admin.mjs', import.meta.url))
const serverPath = fileURLToPath(new URL('./index.mjs', import.meta.url))
const token = () => `admin-test-${crypto.randomUUID()}-${crypto.randomUUID()}`

function tempDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'smartsales-admin-'))
  return { directory, path: join(directory, 'inventory.sqlite') }
}

function runProcess(script, args, env, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-sqlite', script, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`Process timed out: ${script}\n${stdout}\n${stderr}`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ code, signal, stdout, stderr })
    })
  })
}

function inspect(path, work) {
  const db = openDatabase(path)
  try {
    return work(db)
  } finally {
    db.close()
  }
}

async function getFreePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

describe('explicit inventory admin CLI provisioning', () => {
  it('creates tenant and receiver, rotates and revokes tokens, then disables user sessions', async () => {
    const { directory, path } = tempDatabase()
    try {
      const ownerToken = token()
      const created = await runProcess(adminPath, ['create-tenant', 'Công ty Lumi Việt Nam'], {
        INVENTORY_DB_PATH: path,
        INVENTORY_BOOTSTRAP_TOKEN: ownerToken,
      })
      expect(created.code).toBe(0)
      expect(created.stderr).not.toContain(ownerToken)
      expect(created.stdout).not.toContain(ownerToken)
      const owner = JSON.parse(created.stdout)
      expect(owner).toMatchObject({ tokenExpiresInDays: 30 })
      expect(owner.tenantId).toEqual(expect.any(String))
      expect(owner.userId).toEqual(expect.any(String))
      expect(
        inspect(path, (db) => db.prepare('SELECT * FROM tenants WHERE id=?').get(owner.tenantId)),
      ).toMatchObject({
        id: owner.tenantId,
        name: 'Công ty Lumi Việt Nam',
        config_json: '{}',
      })
      const ownerRow = inspect(path, (db) =>
        db.prepare('SELECT * FROM users WHERE id=?').get(owner.userId),
      )
      expect(ownerRow).toMatchObject({ tenant_id: owner.tenantId, role: 'owner', active: 1 })
      const ownerCredential = inspect(path, (db) =>
        db.prepare('SELECT * FROM access_tokens WHERE user_id=?').get(owner.userId),
      )
      expect(ownerCredential).toMatchObject({
        tenant_id: owner.tenantId,
        token_hash: hashToken(ownerToken),
      })
      expect(ownerCredential.token_hash).not.toBe(ownerToken)
      const expiryWindow =
        Date.parse(ownerCredential.expires_at) - Date.parse(ownerCredential.created_at)
      expect(Math.abs(expiryWindow - 30 * 86400000)).toBeLessThan(1000)

      const receiverToken = token()
      const receiverCreated = await runProcess(
        adminPath,
        ['create-user', owner.tenantId, 'Nhân viên nhận hàng', 'receiver'],
        {
          INVENTORY_DB_PATH: path,
          INVENTORY_BOOTSTRAP_TOKEN: receiverToken,
        },
      )
      expect(receiverCreated.code).toBe(0)
      expect(receiverCreated.stdout).not.toContain(receiverToken)
      const receiver = JSON.parse(receiverCreated.stdout)
      expect(
        inspect(path, (db) => db.prepare('SELECT * FROM users WHERE id=?').get(receiver.userId)),
      ).toMatchObject({
        tenant_id: owner.tenantId,
        name: 'Nhân viên nhận hàng',
        role: 'receiver',
        active: 1,
      })
      expect(
        inspect(path, (db) =>
          db.prepare('SELECT * FROM access_tokens WHERE user_id=?').get(receiver.userId),
        ),
      ).toMatchObject({
        tenant_id: owner.tenantId,
        token_hash: hashToken(receiverToken),
      })

      const rotatedToken = token()
      const rotated = await runProcess(adminPath, ['issue-token', owner.userId], {
        INVENTORY_DB_PATH: path,
        INVENTORY_BOOTSTRAP_TOKEN: rotatedToken,
      })
      expect(rotated.code).toBe(0)
      expect(rotated.stdout).not.toContain(rotatedToken)
      expect(
        inspect(
          path,
          (db) =>
            db
              .prepare('SELECT COUNT(*) AS count FROM access_tokens WHERE user_id=?')
              .get(owner.userId).count,
        ),
      ).toBe(2)
      const oldCredential = inspect(path, (db) =>
        db.prepare('SELECT * FROM access_tokens WHERE token_hash=?').get(hashToken(ownerToken)),
      )
      expect(oldCredential).toBeTruthy()
      const revoked = await runProcess(adminPath, ['revoke-token'], {
        INVENTORY_DB_PATH: path,
        INVENTORY_BOOTSTRAP_TOKEN: ownerToken,
      })
      expect(revoked.code).toBe(0)
      expect(
        inspect(path, (db) =>
          db.prepare('SELECT 1 FROM access_tokens WHERE token_hash=?').get(hashToken(ownerToken)),
        ),
      ).toBeUndefined()
      expect(
        inspect(path, (db) =>
          db.prepare('SELECT 1 FROM access_tokens WHERE token_hash=?').get(hashToken(rotatedToken)),
        ),
      ).toBeTruthy()

      inspect(path, (db) =>
        db
          .prepare(
            'INSERT INTO access_tokens(token_hash,user_id,tenant_id,expires_at,created_at) VALUES(?,?,?,?,?)',
          )
          .run(
            hashToken('session-token-created-for-disable-user-test'),
            receiver.userId,
            owner.tenantId,
            new Date(Date.now() + 3600000).toISOString(),
            new Date().toISOString(),
          ),
      )
      const disabled = await runProcess(adminPath, ['disable-user', receiver.userId], {
        INVENTORY_DB_PATH: path,
      })
      expect(disabled.code).toBe(0)
      expect(
        inspect(
          path,
          (db) => db.prepare('SELECT active FROM users WHERE id=?').get(receiver.userId).active,
        ),
      ).toBe(0)
      expect(
        inspect(
          path,
          (db) =>
            db
              .prepare('SELECT COUNT(*) AS count FROM access_tokens WHERE user_id=?')
              .get(receiver.userId).count,
        ),
      ).toBe(0)
      expect(
        inspect(path, (db) => db.prepare('SELECT COUNT(*) AS count FROM tenants').get().count),
      ).toBe(1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects short credentials and invalid provisioning without creating tenant or user records', async () => {
    const { directory, path } = tempDatabase()
    try {
      const short = await runProcess(adminPath, ['create-tenant', 'Tenant hợp lệ'], {
        INVENTORY_DB_PATH: path,
        INVENTORY_BOOTSTRAP_TOKEN: 'short-token',
      })
      expect(short.code).not.toBe(0)
      expect(short.stderr).toContain('32')
      const invalidUser = await runProcess(
        adminPath,
        ['create-user', 'missing-tenant', 'Người thử', 'superuser'],
        {
          INVENTORY_DB_PATH: path,
          INVENTORY_BOOTSTRAP_TOKEN: token(),
        },
      )
      expect(invalidUser.code).not.toBe(0)
      const invalidTenant = await runProcess(adminPath, ['create-tenant', 'A'], {
        INVENTORY_DB_PATH: path,
        INVENTORY_BOOTSTRAP_TOKEN: token(),
      })
      expect(invalidTenant.code).not.toBe(0)
      expect(
        inspect(path, (db) => db.prepare('SELECT COUNT(*) AS count FROM tenants').get().count),
      ).toBe(0)
      expect(
        inspect(path, (db) => db.prepare('SELECT COUNT(*) AS count FROM users').get().count),
      ).toBe(0)
      expect(
        inspect(
          path,
          (db) => db.prepare('SELECT COUNT(*) AS count FROM access_tokens').get().count,
        ),
      ).toBe(0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('ordinary server startup opens an empty database without provisioning tenant, user, or token', async () => {
    const { directory, path } = tempDatabase()
    let child
    try {
      child = spawn(process.execPath, ['--experimental-sqlite', serverPath], {
        cwd: root,
        env: {
          ...process.env,
          INVENTORY_DB_PATH: path,
          INVENTORY_PORT: String(await getFreePort()),
          INVENTORY_HOST: '127.0.0.1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.setEncoding('utf8').on('data', (chunk) => {
        output += chunk
      })
      await Promise.race([
        new Promise((resolve, reject) => {
          child.stdout.on('data', (chunk) => {
            if (String(chunk).includes('Inventory API:')) resolve()
          })
          child.once('error', reject)
          child.once('close', (code) =>
            reject(new Error(`Server exited before listen (${code}): ${output}`)),
          )
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Server did not listen: ${output}`)), 5000),
        ),
      ])
      expect(
        inspect(path, (db) => db.prepare('SELECT COUNT(*) AS count FROM tenants').get().count),
      ).toBe(0)
      expect(
        inspect(path, (db) => db.prepare('SELECT COUNT(*) AS count FROM users').get().count),
      ).toBe(0)
      expect(
        inspect(
          path,
          (db) => db.prepare('SELECT COUNT(*) AS count FROM access_tokens').get().count,
        ),
      ).toBe(0)
    } finally {
      if (child && child.exitCode === null) {
        child.kill('SIGTERM')
        await Promise.race([
          once(child, 'exit'),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ])
      }
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
