ALTER TABLE integration_credentials RENAME TO integration_credentials_v2;

CREATE TABLE integration_credentials (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('gemini','serpapi','telegram','shopee','lazada','tiktok','tiktokshop')),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,provider)
);

INSERT INTO integration_credentials(
  tenant_id,provider,ciphertext,nonce,auth_tag,account_name,created_at,updated_at
)
SELECT tenant_id,provider,ciphertext,nonce,auth_tag,account_name,created_at,updated_at
FROM integration_credentials_v2;

DROP TABLE integration_credentials_v2;

CREATE TABLE tiktok_oauth_states (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('tiktok','tiktokshop')),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
