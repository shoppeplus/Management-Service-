CREATE TABLE login_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  email_hash TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK(succeeded IN (0,1)),
  remote_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);

CREATE INDEX login_events_tenant_created
  ON login_events(tenant_id,created_at DESC);
