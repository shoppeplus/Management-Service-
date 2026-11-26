CREATE TABLE market_research_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  requested_by TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  industry TEXT NOT NULL,
  market TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  model TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  analysis_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,requested_by) REFERENCES users(tenant_id,id)
);

CREATE INDEX market_research_tenant_history
  ON market_research_runs(tenant_id,created_at DESC,id);
