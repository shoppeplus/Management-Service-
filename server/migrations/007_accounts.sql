CREATE TABLE account_credentials (
  user_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);

CREATE INDEX account_credentials_tenant ON account_credentials(tenant_id,user_id);
