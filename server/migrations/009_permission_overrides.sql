CREATE TABLE user_permission_overrides (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK(granted IN (0,1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,user_id,permission),
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id)
);
