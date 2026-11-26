ALTER TABLE integration_credentials RENAME TO integration_credentials_v1;

CREATE TABLE integration_credentials (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('gemini','serpapi','telegram','shopee','lazada','tiktokshop')),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,provider)
);

INSERT INTO integration_credentials(
  tenant_id,provider,ciphertext,nonce,auth_tag,created_at,updated_at
)
SELECT tenant_id,provider,ciphertext,nonce,auth_tag,created_at,updated_at
FROM integration_credentials_v1;

DROP TABLE integration_credentials_v1;
