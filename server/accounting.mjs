import { randomUUID } from 'node:crypto'
import { DomainError, transaction } from './database.mjs'
import { hasPermission } from './access-control.mjs'

const fail = (status, code, message) => {
  throw new DomainError(status, code, message)
}

const chart = [
  ['A-CASH', 'Cash on hand', 'asset', 'debit'],
  ['A-BANK', 'Bank accounts', 'asset', 'debit'],
  ['A-AR', 'Accounts receivable', 'asset', 'debit'],
  ['A-INVENTORY', 'Inventory', 'asset', 'debit'],
  ['A-TAX-REC', 'Recoverable tax', 'asset', 'debit'],
  ['L-AP', 'Accounts payable', 'liability', 'credit'],
  ['L-TAX-PAY', 'Tax payable', 'liability', 'credit'],
  ['E-CAPITAL', 'Owner equity', 'equity', 'credit'],
  ['R-SALES', 'Sales revenue', 'revenue', 'credit'],
  ['R-RETURNS', 'Sales returns and discounts', 'revenue', 'debit'],
  ['X-COGS', 'Cost of goods sold', 'expense', 'debit'],
  ['X-OPERATING', 'Operating expenses', 'expense', 'debit'],
  ['X-DELIVERY', 'Delivery expenses', 'expense', 'debit'],
]

const sourceTypes = new Set([
  'sale',
  'payment',
  'refund',
  'purchase',
  'expense',
  'tax_invoice',
  'inventory',
  'adjustment',
])
const counterpartyTypes = new Set(['customer', 'supplier', 'employee', 'other'])
const codePattern = /^[A-Z0-9][A-Z0-9-]{0,39}$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const text = (value, label, min, max) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    fail(422, 'INVALID_INPUT', `${label} không hợp lệ.`)
  return value.trim()
}
const dateValue = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value))
    fail(422, 'INVALID_INPUT', 'Ngày hạch toán cần theo định dạng YYYY-MM-DD.')
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail(422, 'INVALID_INPUT', 'Ngày hạch toán không hợp lệ.')
  return value
}
const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(422, 'INVALID_INPUT', `${label} phải là số nguyên hợp lệ.`)
  return value
}
const allowed = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail(400, 'INVALID_FIELDS', 'Chứng từ kế toán có trường không được hỗ trợ.')
}

export function createAccounting(db, { now = () => new Date() } = {}) {
  const get = (sql, ...values) => db.prepare(sql).get(...values)
  const all = (sql, ...values) => db.prepare(sql).all(...values)
  const run = (sql, ...values) => db.prepare(sql).run(...values)
  const stamp = () => now().toISOString()
  const identity = (actor, permission) => {
    if (!actor || typeof actor.tenantId !== 'string' || typeof actor.userId !== 'string')
      fail(401, 'UNAUTHENTICATED', 'Cần đăng nhập để truy cập sổ kế toán.')
    const user = get(
      'SELECT role FROM users WHERE tenant_id=? AND id=? AND active=1',
      actor.tenantId,
      actor.userId,
    )
    if (!user || (actor.role !== undefined && actor.role !== user.role))
      fail(403, 'FORBIDDEN', 'Người dùng không thuộc doanh nghiệp này.')
    if (!hasPermission(db, actor.tenantId, actor.userId, user.role, permission))
      fail(403, 'FORBIDDEN', 'Vai trò của bạn không được truy cập nghiệp vụ kế toán này.')
    return { tenantId: actor.tenantId, userId: actor.userId, role: user.role }
  }
  const ensureChart = (tenantId) => {
    const current = stamp()
    transaction(db, () => {
      for (const [code, name, category, normalBalance] of chart)
        run(
          `INSERT OR IGNORE INTO accounting_accounts(
            id,tenant_id,code,name,category,normal_balance,description,is_system,active,
            created_at,updated_at
          ) VALUES(?,?,?,?,?,?,'Generic starter chart; confirm mapping with an accountant.',1,1,?,?)`,
          randomUUID(),
          tenantId,
          code,
          name,
          category,
          normalBalance,
          current,
          current,
        )
    })
  }
  const accounts = (tenantId) =>
    all(
      `SELECT code,name,category,normal_balance AS normalBalance,description,is_system AS isSystem
       FROM accounting_accounts WHERE tenant_id=? AND active=1 ORDER BY code`,
      tenantId,
    ).map((row) => ({ ...row, isSystem: Boolean(row.isSystem) }))
  const audit = (actor, action, entityId, details) =>
    run(
      `INSERT INTO audit_events(id,tenant_id,actor_id,action,entity_id,details_json,created_at)
       VALUES(?,?,?,?,?,?,?)`,
      randomUUID(),
      actor.tenantId,
      actor.userId,
      action,
      entityId,
      JSON.stringify(details),
      stamp(),
    )
  const getJournal = (tenantId, id) => {
    const journal = get(
      `SELECT id,number,entry_date AS entryDate,memo,source_type AS sourceType,
        source_reference AS sourceReference,currency_code AS currencyCode,
        reversal_of_id AS reversalOfId,created_by AS createdBy,created_at AS createdAt
       FROM accounting_journals WHERE tenant_id=? AND id=?`,
      tenantId,
      id,
    )
    if (!journal) return null
    journal.lines = all(
      `SELECT l.line_number AS lineNumber,a.code AS accountCode,a.name AS accountName,
        l.description,l.debit_amount AS debit,l.credit_amount AS credit,
        l.counterparty_type AS counterpartyType,
        l.counterparty_reference AS counterpartyReference,l.tax_code AS taxCode,
        l.tax_rate_basis_points AS taxRateBasisPoints,l.tax_amount AS taxAmount
       FROM accounting_journal_lines l JOIN accounting_accounts a
         ON a.tenant_id=l.tenant_id AND a.id=l.account_id
       WHERE l.tenant_id=? AND l.journal_id=? ORDER BY l.line_number`,
      tenantId,
      id,
    )
    return journal
  }
  const normalizeLines = (tenantId, input) => {
    if (!Array.isArray(input) || input.length < 2 || input.length > 100)
      fail(422, 'INVALID_INPUT', 'Chứng từ cần từ 2 đến 100 dòng bút toán.')
    let debits = 0n
    let credits = 0n
    const lines = input.map((line, index) => {
      allowed(line, [
        'accountCode',
        'description',
        'debit',
        'credit',
        'counterpartyType',
        'counterpartyReference',
        'taxCode',
        'taxRateBasisPoints',
        'taxAmount',
      ])
      const accountCode = text(line.accountCode, 'Mã tài khoản', 1, 40)
      if (!codePattern.test(accountCode))
        fail(422, 'INVALID_INPUT', 'Mã tài khoản chỉ được chứa chữ hoa, số và dấu gạch ngang.')
      const account = get(
        'SELECT id FROM accounting_accounts WHERE tenant_id=? AND code=? AND active=1',
        tenantId,
        accountCode,
      )
      if (!account)
        fail(422, 'ACCOUNT_NOT_FOUND', `Không tìm thấy tài khoản ${accountCode} đang hoạt động.`)
      const debit = integer(line.debit, 'Nợ')
      const credit = integer(line.credit, 'Có')
      if ((debit > 0) === (credit > 0))
        fail(422, 'INVALID_LINE', 'Mỗi dòng chỉ được ghi một bên Nợ hoặc Có.')
      debits += BigInt(debit)
      credits += BigInt(credit)
      if (debits > BigInt(Number.MAX_SAFE_INTEGER) || credits > BigInt(Number.MAX_SAFE_INTEGER))
        fail(422, 'AMOUNT_OVERFLOW', 'Tổng bút toán vượt giới hạn số tiền an toàn.')
      const counterpartyType =
        line.counterpartyType === undefined || line.counterpartyType === null
          ? null
          : line.counterpartyType
      if (counterpartyType !== null && !counterpartyTypes.has(counterpartyType))
        fail(422, 'INVALID_INPUT', 'Loại đối tượng liên quan không hợp lệ.')
      const taxRateBasisPoints =
        line.taxRateBasisPoints === undefined || line.taxRateBasisPoints === null
          ? null
          : integer(line.taxRateBasisPoints, 'Thuế suất', 0, 100000)
      const taxAmount =
        line.taxAmount === undefined || line.taxAmount === null
          ? null
          : integer(line.taxAmount, 'Tiền thuế', -Number.MAX_SAFE_INTEGER)
      return {
        id: randomUUID(),
        lineNumber: index + 1,
        accountId: account.id,
        accountCode,
        description:
          line.description === undefined ? '' : text(line.description, 'Diễn giải dòng', 0, 500),
        debit,
        credit,
        counterpartyType,
        counterpartyReference:
          line.counterpartyReference === undefined
            ? ''
            : text(line.counterpartyReference, 'Mã đối tượng liên quan', 0, 200),
        taxCode:
          line.taxCode === undefined || line.taxCode === null
            ? null
            : text(line.taxCode, 'Mã thuế', 1, 40),
        taxRateBasisPoints,
        taxAmount,
      }
    })
    if (debits === 0n || debits !== credits)
      fail(422, 'UNBALANCED_ENTRY', 'Tổng phát sinh Nợ phải bằng tổng phát sinh Có và lớn hơn 0.')
    return { lines, total: Number(debits) }
  }
  const insertJournal = (actor, values) => {
    const id = randomUUID()
    const createdAt = stamp()
    const number = `JE-${values.entryDate.replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`
    run(
      `INSERT INTO accounting_journals(
        id,tenant_id,number,entry_date,memo,source_type,source_reference,currency_code,
        reversal_of_id,created_by,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      actor.tenantId,
      number,
      values.entryDate,
      values.memo,
      values.sourceType,
      values.sourceReference,
      'VND',
      values.reversalOfId,
      actor.userId,
      createdAt,
    )
    for (const line of values.lines)
      run(
        `INSERT INTO accounting_journal_lines(
          id,tenant_id,journal_id,line_number,account_id,description,debit_amount,credit_amount,
          counterparty_type,counterparty_reference,tax_code,tax_rate_basis_points,tax_amount
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        line.id ?? randomUUID(),
        actor.tenantId,
        id,
        line.lineNumber,
        line.accountId,
        line.description,
        line.debit,
        line.credit,
        line.counterpartyType,
        line.counterpartyReference,
        line.taxCode,
        line.taxRateBasisPoints,
        line.taxAmount,
      )
    audit(actor, values.reversalOfId ? 'accounting.journal.reversed' : 'accounting.journal.posted', id, {
      number,
      sourceType: values.sourceType,
      sourceReference: values.sourceReference,
      reversalOfId: values.reversalOfId,
      total: values.total,
    })
    return getJournal(actor.tenantId, id)
  }

  return {
    listAccounts(actor) {
      const current = identity(actor, 'accounting.read')
      ensureChart(current.tenantId)
      return accounts(current.tenantId)
    },
    createJournal(actor, input) {
      const current = identity(actor, 'accounting.post')
      allowed(input, [
        'entryDate',
        'memo',
        'sourceType',
        'sourceReference',
        'currencyCode',
        'lines',
      ])
      const entryDate = dateValue(input.entryDate)
      const memo = text(input.memo, 'Diễn giải chứng từ', 1, 1000)
      const sourceType =
        input.sourceType === undefined || input.sourceType === null ? null : input.sourceType
      if (sourceType !== null && !sourceTypes.has(sourceType))
        fail(422, 'INVALID_INPUT', 'Loại chứng từ nguồn không hợp lệ.')
      const sourceReference =
        input.sourceReference === undefined
          ? ''
          : text(input.sourceReference, 'Mã chứng từ nguồn', 0, 200)
      if (input.currencyCode !== undefined && input.currencyCode !== 'VND')
        fail(422, 'UNSUPPORTED_CURRENCY', 'Sổ kế toán trung lập hiện chỉ hỗ trợ VND.')
      ensureChart(current.tenantId)
      const { lines, total } = normalizeLines(current.tenantId, input.lines)
      return transaction(db, () =>
        insertJournal(current, {
          entryDate,
          memo,
          sourceType,
          sourceReference,
          reversalOfId: null,
          lines,
          total,
        }),
      )
    },
    listJournals(actor, filters = {}) {
      const current = identity(actor, 'accounting.read')
      allowed(filters, ['from', 'to', 'accountCode', 'limit', 'offset'])
      const from = filters.from === undefined ? null : dateValue(filters.from)
      const to = filters.to === undefined ? null : dateValue(filters.to)
      if (from && to && from > to) fail(422, 'INVALID_FILTER', 'Khoảng ngày báo cáo không hợp lệ.')
      const accountCode =
        filters.accountCode === undefined
          ? null
          : text(filters.accountCode, 'Mã tài khoản', 1, 40)
      const limit = filters.limit === undefined ? 100 : integer(filters.limit, 'Giới hạn', 1, 500)
      const offset =
        filters.offset === undefined ? 0 : integer(filters.offset, 'Vị trí bắt đầu', 0, 10000000)
      const matchingAccount = accountCode
        ? get(
            'SELECT id FROM accounting_accounts WHERE tenant_id=? AND code=?',
            current.tenantId,
            accountCode,
          )
        : null
      if (accountCode && !matchingAccount)
        fail(422, 'ACCOUNT_NOT_FOUND', `Không tìm thấy tài khoản ${accountCode}.`)
      const accountJoin = matchingAccount
        ? 'JOIN accounting_journal_lines filter_line ON filter_line.tenant_id=j.tenant_id AND filter_line.journal_id=j.id'
        : ''
      const accountFilter = matchingAccount ? 'AND filter_line.account_id=?' : ''
      const values = [
        current.tenantId,
        from,
        from,
        to,
        to,
        ...(matchingAccount ? [matchingAccount.id] : []),
        limit + 1,
        offset,
      ]
      const entries = all(
        `SELECT DISTINCT j.id,j.entry_date AS entryDate
         FROM accounting_journals j ${accountJoin}
         WHERE j.tenant_id=? AND (? IS NULL OR j.entry_date>=?) AND (? IS NULL OR j.entry_date<=?)
           ${accountFilter}
         ORDER BY j.entry_date DESC,j.number DESC LIMIT ? OFFSET ?`,
        ...values,
      )
      const hasMore = entries.length > limit
      const page = entries.slice(0, limit).map((entry) => getJournal(current.tenantId, entry.id))
      return { entries: page, nextOffset: hasMore ? offset + limit : null }
    },
    trialBalance(actor, filters = {}) {
      const current = identity(actor, 'accounting.read')
      allowed(filters, ['from', 'to'])
      const from = filters.from === undefined ? null : dateValue(filters.from)
      const to = filters.to === undefined ? null : dateValue(filters.to)
      if (from && to && from > to) fail(422, 'INVALID_FILTER', 'Khoảng ngày báo cáo không hợp lệ.')
      ensureChart(current.tenantId)
      const rows = all(
        `SELECT a.code,a.name,a.category,a.normal_balance AS normalBalance,
          COALESCE(SUM(CASE WHEN j.entry_date<? THEN l.debit_amount ELSE 0 END),0) AS openingDebit,
          COALESCE(SUM(CASE WHEN j.entry_date<? THEN l.credit_amount ELSE 0 END),0) AS openingCredit,
          COALESCE(SUM(CASE WHEN j.entry_date>=? AND j.entry_date<=? THEN l.debit_amount ELSE 0 END),0) AS periodDebit,
          COALESCE(SUM(CASE WHEN j.entry_date>=? AND j.entry_date<=? THEN l.credit_amount ELSE 0 END),0) AS periodCredit
        FROM accounting_accounts a
        LEFT JOIN accounting_journal_lines l ON l.tenant_id=a.tenant_id AND l.account_id=a.id
        LEFT JOIN accounting_journals j ON j.tenant_id=l.tenant_id AND j.id=l.journal_id
        WHERE a.tenant_id=? AND a.active=1 AND (j.entry_date IS NULL OR j.entry_date<=?)
        GROUP BY a.id ORDER BY a.code`,
        from ?? '0000-00-00',
        from ?? '0000-00-00',
        from ?? '0000-00-00',
        to ?? '9999-12-31',
        from ?? '0000-00-00',
        to ?? '9999-12-31',
        current.tenantId,
        to ?? '9999-12-31',
      )
      const accounts = rows.map((row) => {
        const openingNet = row.openingDebit - row.openingCredit
        const closingNet = openingNet + row.periodDebit - row.periodCredit
        return {
          ...row,
          openingBalance:
            row.normalBalance === 'debit' ? openingNet : -openingNet,
          closingDebit: Math.max(closingNet, 0),
          closingCredit: Math.max(-closingNet, 0),
        }
      })
      return {
        from,
        to,
        accounts,
        totals: {
          periodDebit: rows.reduce((total, row) => total + row.periodDebit, 0),
          periodCredit: rows.reduce((total, row) => total + row.periodCredit, 0),
          closingDebit: accounts.reduce((total, row) => total + row.closingDebit, 0),
          closingCredit: accounts.reduce((total, row) => total + row.closingCredit, 0),
        },
      }
    },
    reverseJournal(actor, journalId, input) {
      const current = identity(actor, 'accounting.post')
      allowed(input, ['entryDate', 'reason'])
      const entryDate = dateValue(input.entryDate)
      const reason = text(input.reason, 'Lý do đảo bút toán', 3, 1000)
      const original = getJournal(current.tenantId, journalId)
      if (!original) fail(404, 'NOT_FOUND', 'Không tìm thấy bút toán.')
      if (original.reversalOfId)
        fail(409, 'INVALID_REVERSAL', 'Không thể đảo một bút toán đảo.')
      if (
        get(
          'SELECT id FROM accounting_journals WHERE tenant_id=? AND reversal_of_id=?',
          current.tenantId,
          journalId,
        )
      )
        fail(409, 'ALREADY_REVERSED', 'Bút toán này đã được đảo.')
      const lines = original.lines.map((line, index) => ({
        id: randomUUID(),
        lineNumber: index + 1,
        accountId: get(
          'SELECT id FROM accounting_accounts WHERE tenant_id=? AND code=?',
          current.tenantId,
          line.accountCode,
        ).id,
        accountCode: line.accountCode,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
        counterpartyType: line.counterpartyType,
        counterpartyReference: line.counterpartyReference,
        taxCode: line.taxCode,
        taxRateBasisPoints: line.taxRateBasisPoints,
        taxAmount: line.taxAmount === null ? null : -line.taxAmount,
      }))
      const total = lines.reduce((sum, line) => sum + line.debit, 0)
      return transaction(db, () =>
        insertJournal(current, {
          entryDate,
          memo: `Đảo ${original.number}: ${reason}`,
          sourceType: 'adjustment',
          sourceReference: original.number,
          reversalOfId: journalId,
          lines,
          total,
        }),
      )
    },
  }
}
