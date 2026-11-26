import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.mjs'
import { createAccounting } from './accounting.mjs'

const timestamp = '2026-01-15T10:00:00.000Z'
const ownerA = { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' }
const ownerB = { userId: 'owner-b', tenantId: 'tenant-b', role: 'owner' }
const managerA = { userId: 'manager-a', tenantId: 'tenant-a', role: 'manager' }
const adminA = { userId: 'admin-a', tenantId: 'tenant-a', role: 'admin' }
const viewerA = { userId: 'viewer-a', tenantId: 'tenant-a', role: 'viewer' }
const journalInput = {
  entryDate: '2026-01-10',
  memo: 'Ghi nhận doanh thu thử nghiệm',
  sourceType: 'sale',
  sourceReference: 'SO-100',
  lines: [
    { accountCode: 'A-CASH', debit: 10000, credit: 0 },
    { accountCode: 'R-SALES', debit: 0, credit: 10000 },
  ],
}

describe('accounting ledger foundation', () => {
  let db
  let accounting

  beforeEach(() => {
    db = openDatabase()
    for (const [id, name] of [
      ['tenant-a', 'Doanh nghiệp A'],
      ['tenant-b', 'Doanh nghiệp B'],
    ])
      db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(id, name, timestamp)
    for (const [id, tenantId, role] of [
      ['owner-a', 'tenant-a', 'owner'],
      ['owner-b', 'tenant-b', 'owner'],
      ['manager-a', 'tenant-a', 'manager'],
      ['admin-a', 'tenant-a', 'admin'],
      ['viewer-a', 'tenant-a', 'viewer'],
    ])
      db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
        id,
        tenantId,
        id,
        role,
      )
    accounting = createAccounting(db, { now: () => new Date(timestamp) })
  })

  afterEach(() => db?.close())

  it('seeds tenant-scoped accounts and only posts balanced entries', () => {
    expect(accounting.listAccounts(ownerA)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'A-CASH', normalBalance: 'debit' }),
        expect.objectContaining({ code: 'R-SALES', normalBalance: 'credit' }),
      ]),
    )
    expect(accounting.createJournal(ownerA, journalInput)).toMatchObject({
      entryDate: '2026-01-10',
      sourceReference: 'SO-100',
      lines: [
        { accountCode: 'A-CASH', debit: 10000, credit: 0 },
        { accountCode: 'R-SALES', debit: 0, credit: 10000 },
      ],
    })
    expect(() =>
      accounting.createJournal(ownerA, {
        ...journalInput,
        lines: journalInput.lines.map((line) => ({ ...line, debit: line.debit / 2 })),
      }),
    ).toThrow(expect.objectContaining({ code: 'UNBALANCED_ENTRY' }))

    const tenantBAccounts = accounting.listAccounts(ownerB)
    expect(tenantBAccounts.map((account) => account.code)).toEqual(
      expect.arrayContaining(['A-CASH', 'R-SALES']),
    )
    expect(
      db.prepare(
        `SELECT COUNT(*) AS count FROM accounting_accounts WHERE tenant_id='tenant-b'`,
      ).get().count,
    ).toBe(tenantBAccounts.length)
  })

  it('requires explicit permissions and calculates a period trial balance', () => {
    expect(() => accounting.listAccounts(viewerA)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    expect(accounting.listAccounts(managerA)).toHaveLength(13)
    expect(accounting.listAccounts(adminA)).toHaveLength(13)
    expect(() => accounting.createJournal(managerA, journalInput)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    expect(() => accounting.createJournal(adminA, journalInput)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    accounting.createJournal(ownerA, journalInput)
    const result = accounting.trialBalance(ownerA, { from: '2026-01-01', to: '2026-01-31' })
    expect(result.totals).toMatchObject({ periodDebit: 10000, periodCredit: 10000 })
    expect(result.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'A-CASH', closingDebit: 10000, closingCredit: 0 }),
        expect.objectContaining({ code: 'R-SALES', closingDebit: 0, closingCredit: 10000 }),
      ]),
    )
    accounting.listAccounts(ownerB)
    expect(() => accounting.listJournals(ownerB, { accountCode: 'A-CASH' })).not.toThrow()
    expect(accounting.listJournals(ownerB).entries).toHaveLength(0)
  })

  it('reverses entries with opposite lines and protects posted data from mutation', () => {
    const original = accounting.createJournal(ownerA, journalInput)
    const reversed = accounting.reverseJournal(ownerA, original.id, {
      entryDate: '2026-01-12',
      reason: 'Ghi nhầm chứng từ',
    })
    expect(reversed.reversalOfId).toBe(original.id)
    expect(reversed.lines).toMatchObject([
      { accountCode: 'A-CASH', debit: 0, credit: 10000 },
      { accountCode: 'R-SALES', debit: 10000, credit: 0 },
    ])
    expect(() =>
      accounting.reverseJournal(ownerA, original.id, {
        entryDate: '2026-01-13',
        reason: 'Đảo lần nữa',
      }),
    ).toThrow(expect.objectContaining({ code: 'ALREADY_REVERSED' }))
    expect(() =>
      db.prepare('UPDATE accounting_journals SET memo=? WHERE id=?').run('changed', original.id),
    ).toThrow(/immutable/i)
  })
})
