import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { openDatabase, transaction } from './database.mjs'
import { hashToken } from './http.mjs'

// Explicit provisioning only. Never creates demo records or default credentials.
const operation = process.argv[2]
const token = process.env.INVENTORY_BOOTSTRAP_TOKEN
if (
  !['create-tenant', 'create-user', 'disable-user', 'issue-token', 'revoke-token'].includes(
    operation,
  )
)
  throw new Error(
    'Dùng: create-tenant <tên> | create-user <tenantId> <tên> <role> | disable-user <userId> | issue-token <userId> | revoke-token. Token qua INVENTORY_BOOTSTRAP_TOKEN.',
  )
if (operation !== 'disable-user' && (!token || token.length < 32 || token.length > 512))
  throw new Error(
    'INVENTORY_BOOTSTRAP_TOKEN cần 32–512 ký tự; không đặt token trong tham số dòng lệnh hoặc VITE_*.',
  )
const db = openDatabase(resolve(process.env.INVENTORY_DB_PATH || 'var/inventory.sqlite'))
try {
  if (operation === 'disable-user') {
    const userId = process.argv[3]
    if (!userId) throw new Error('Cần userId.')
    transaction(db, () => {
      db.prepare('UPDATE users SET active=0 WHERE id=?').run(userId)
      db.prepare('DELETE FROM access_tokens WHERE user_id=?').run(userId)
    })
    console.log('Đã vô hiệu hóa người dùng và thu hồi các phiên/token của họ.')
  } else if (operation === 'revoke-token') {
    db.prepare('DELETE FROM access_tokens WHERE token_hash=?').run(hashToken(token))
    console.log('Đã thu hồi token được chỉ định; các phiên đã cấp cần thu hồi riêng nếu có.')
  } else {
    const result = transaction(db, () => {
      const stamp = new Date().toISOString()
      let userId = process.argv[3]
      let tenantId
      if (operation === 'create-tenant') {
        const name = process.argv.slice(3).join(' ').trim()
        if (name.length < 2 || name.length > 200)
          throw new Error('Tên doanh nghiệp cần 2–200 ký tự.')
        tenantId = randomUUID()
        userId = randomUUID()
        db.prepare('INSERT INTO tenants(id,name,config_json,created_at) VALUES(?,?,?,?)').run(
          tenantId,
          name,
          '{}',
          stamp,
        )
        db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
          userId,
          tenantId,
          'Quản trị kho',
          'owner',
        )
      } else if (operation === 'create-user') {
        tenantId = process.argv[3]
        const name = process.argv[4]?.trim()
        const role = process.argv[5]
        if (
          !name ||
          name.length > 200 ||
          ![
            'owner',
            'admin',
            'manager',
            'staff',
            'receiver',
            'issuer',
            'counter',
            'approver',
            'viewer',
          ].includes(role)
        )
          throw new Error(
            'Cần tenantId, tên 1–200 ký tự, role hợp lệ: owner/admin/manager/staff/receiver/issuer/counter/approver/viewer.',
          )
        if (!db.prepare('SELECT id FROM tenants WHERE id=?').get(tenantId))
          throw new Error('Không tìm thấy doanh nghiệp.')
        userId = randomUUID()
        db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
          userId,
          tenantId,
          name,
          role,
        )
      } else {
        const user = db.prepare('SELECT tenant_id FROM users WHERE id=? AND active=1').get(userId)
        if (!user) throw new Error('Không tìm thấy người dùng đang hoạt động.')
        tenantId = user.tenant_id
      }
      db.prepare(
        'INSERT INTO access_tokens(token_hash,user_id,tenant_id,expires_at,created_at) VALUES(?,?,?,?,?)',
      ).run(
        hashToken(token),
        userId,
        tenantId,
        new Date(Date.now() + 30 * 86400000).toISOString(),
        stamp,
      )
      return { tenantId, userId, tokenExpiresInDays: 30 }
    })
    console.log(JSON.stringify(result, null, 2))
  }
} finally {
  db.close()
}
