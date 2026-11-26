CREATE TABLE accounting_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('asset','liability','equity','revenue','expense')),
  normal_balance TEXT NOT NULL CHECK(normal_balance IN ('debit','credit')),
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,code),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE TABLE accounting_journals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  entry_date TEXT NOT NULL CHECK(entry_date GLOB '????-??-??'),
  memo TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN (
    'sale','payment','refund','purchase','expense','tax_invoice','inventory','adjustment'
  )),
  source_reference TEXT NOT NULL DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT 'VND' CHECK(currency_code='VND'),
  reversal_of_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,number),
  UNIQUE(tenant_id,reversal_of_id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,reversal_of_id) REFERENCES accounting_journals(tenant_id,id)
);
CREATE INDEX accounting_journals_tenant_date
  ON accounting_journals(tenant_id,entry_date DESC,number DESC);

CREATE TABLE accounting_journal_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  journal_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK(line_number>=1),
  account_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  debit_amount INTEGER NOT NULL DEFAULT 0 CHECK(debit_amount>=0),
  credit_amount INTEGER NOT NULL DEFAULT 0 CHECK(credit_amount>=0),
  counterparty_type TEXT CHECK(counterparty_type IN ('customer','supplier','employee','other')),
  counterparty_reference TEXT NOT NULL DEFAULT '',
  tax_code TEXT,
  tax_rate_basis_points INTEGER CHECK(tax_rate_basis_points IS NULL OR tax_rate_basis_points>=0),
  tax_amount INTEGER CHECK(tax_amount IS NULL OR tax_amount BETWEEN -9000000000000000 AND 9000000000000000),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,journal_id,line_number),
  CHECK((debit_amount>0 AND credit_amount=0) OR (credit_amount>0 AND debit_amount=0)),
  FOREIGN KEY(tenant_id,journal_id) REFERENCES accounting_journals(tenant_id,id),
  FOREIGN KEY(tenant_id,account_id) REFERENCES accounting_accounts(tenant_id,id)
);
CREATE INDEX accounting_journal_lines_account
  ON accounting_journal_lines(tenant_id,account_id,journal_id);

CREATE TRIGGER accounting_journals_no_update
  BEFORE UPDATE ON accounting_journals
  BEGIN SELECT RAISE(ABORT,'Accounting journals are immutable'); END;
CREATE TRIGGER accounting_journals_no_delete
  BEFORE DELETE ON accounting_journals
  BEGIN SELECT RAISE(ABORT,'Accounting journals are immutable'); END;
CREATE TRIGGER accounting_journal_lines_no_update
  BEFORE UPDATE ON accounting_journal_lines
  BEGIN SELECT RAISE(ABORT,'Accounting journal lines are immutable'); END;
CREATE TRIGGER accounting_journal_lines_no_delete
  BEFORE DELETE ON accounting_journal_lines
  BEGIN SELECT RAISE(ABORT,'Accounting journal lines are immutable'); END;
