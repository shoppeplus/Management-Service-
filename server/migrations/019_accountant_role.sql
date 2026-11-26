PRAGMA foreign_keys = OFF;

CREATE TABLE users_with_accountant (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','accountant','staff','receiver','issuer','counter','approver','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  last_activity_at TEXT,
  UNIQUE(tenant_id,id)
);

INSERT INTO users_with_accountant(id,tenant_id,name,role,active,last_activity_at)
SELECT id,tenant_id,name,role,active,last_activity_at FROM users;

DROP TABLE users;
ALTER TABLE users_with_accountant RENAME TO users;
