import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export class DomainError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'DomainError'
    this.status = status
    this.code = code
  }
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    if (result && typeof result.then === 'function')
      throw new Error('Database transactions must be synchronous')
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function openDatabase(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(
    'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL',
  )
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)',
  )
  try {
    const directory = fileURLToPath(new URL('./migrations/', import.meta.url))
    for (const file of readdirSync(directory)
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort()) {
      const sql = readFileSync(join(directory, file), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const foreignKeysOff = /^\s*PRAGMA foreign_keys\s*=\s*OFF\s*;/i.test(sql)
      if (foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF')
      try {
        transaction(db, () => {
          const existing = db
            .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
            .get(file)
          if (existing) {
            if (existing.checksum !== checksum)
              throw new Error(`Migration checksum mismatch: ${file}`)
            return
          }
          db.exec(sql)
          db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(
            file,
            checksum,
            new Date().toISOString(),
          )
        })
        if (foreignKeysOff && db.prepare('PRAGMA foreign_key_check').all().length)
          throw new Error(`Foreign key check failed after migration: ${file}`)
      } finally {
        if (foreignKeysOff) db.exec('PRAGMA foreign_keys = ON')
      }
    }
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
