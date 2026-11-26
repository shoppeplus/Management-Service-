CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','staff','receiver','issuer','counter','approver','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(tenant_id,id)
);
CREATE TABLE access_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE warehouses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,code)
);
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,warehouse_id,id),
  UNIQUE(tenant_id,warehouse_id,code),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id)
);
CREATE UNIQUE INDEX one_default_location ON locations(tenant_id,warehouse_id) WHERE is_default = 1;
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,code)
);
CREATE TABLE inventory_skus (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'cái',
  serial_tracked INTEGER NOT NULL DEFAULT 0 CHECK(serial_tracked IN (0,1)),
  reorder_point INTEGER NOT NULL DEFAULT 5 CHECK(reorder_point >= 0),
  max_stock INTEGER NOT NULL DEFAULT 100 CHECK(max_stock >= 0),
  lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK(lead_time_days >= 0),
  price INTEGER NOT NULL DEFAULT 0 CHECK(price >= 0),
  cost INTEGER NOT NULL DEFAULT 0 CHECK(cost >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,sku)
);
CREATE TABLE balances (
  tenant_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  on_hand INTEGER NOT NULL DEFAULT 0 CHECK(on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand),
  inventory_value INTEGER NOT NULL DEFAULT 0 CHECK(inventory_value >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,warehouse_id,location_id,sku_id),
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id)
);
CREATE TABLE stock_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('receipt','issue','transfer','adjustment')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','posted','in_transit','received','cancelled')),
  warehouse_id TEXT NOT NULL,
  target_warehouse_id TEXT,
  supplier_id TEXT,
  reference TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  approved_by TEXT,
  posted_by TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  posted_at TEXT,
  received_at TEXT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,number),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,target_warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,posted_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE stock_document_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  target_location_id TEXT,
  quantity INTEGER NOT NULL CHECK(quantity != 0),
  unit_cost INTEGER NOT NULL CHECK(unit_cost >= 0),
  inventory_value INTEGER,
  serial_numbers_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id),
  FOREIGN KEY(tenant_id,target_location_id) REFERENCES locations(tenant_id,id)
);
CREATE TABLE ledger (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  document_id TEXT,
  count_id TEXT,
  kind TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity != 0),
  value_change INTEGER NOT NULL,
  on_hand_after INTEGER NOT NULL CHECK(on_hand_after >= 0),
  value_after INTEGER NOT NULL CHECK(value_after >= 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id),
  FOREIGN KEY(tenant_id,count_id) REFERENCES stock_counts(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX ledger_tenant_created ON ledger(tenant_id,sequence);
CREATE INDEX ledger_balance ON ledger(tenant_id,warehouse_id,sku_id,sequence);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is immutable'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is immutable'); END;
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','released')),
  created_at TEXT NOT NULL,
  released_at TEXT,
  created_by TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE serials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  warehouse_id TEXT,
  location_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('in_stock','in_transit','issued')),
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,serial_number),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id)
);
CREATE TABLE stock_counts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),
  ledger_sequence INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE stock_count_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  count_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  expected_quantity INTEGER NOT NULL CHECK(expected_quantity >= 0),
  counted_quantity INTEGER CHECK(counted_quantity >= 0),
  UNIQUE(tenant_id,count_id,sku_id,location_id),
  FOREIGN KEY(tenant_id,count_id) REFERENCES stock_counts(tenant_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id)
);
CREATE TABLE warranties (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  serial_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  issue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','repairing','completed','returned','rejected')),
  history_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,serial_id) REFERENCES serials(tenant_id,id)
);
CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TABLE idempotency_keys (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
