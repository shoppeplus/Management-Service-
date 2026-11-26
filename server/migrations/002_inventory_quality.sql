ALTER TABLE balances ADD COLUMN damaged INTEGER NOT NULL DEFAULT 0 CHECK(damaged >= 0);
ALTER TABLE balances ADD COLUMN warranty INTEGER NOT NULL DEFAULT 0 CHECK(warranty >= 0 AND damaged + warranty + reserved <= on_hand);
ALTER TABLE serials ADD COLUMN quality_status TEXT NOT NULL DEFAULT 'available' CHECK(quality_status IN ('available','damaged','warranty'));
ALTER TABLE stock_documents ADD COLUMN return_to_stock INTEGER NOT NULL DEFAULT 0 CHECK(return_to_stock IN (0,1));
ALTER TABLE stock_count_lines ADD COLUMN unit_cost INTEGER CHECK(unit_cost >= 0);

DROP TRIGGER ledger_no_update;
DROP TRIGGER ledger_no_delete;
DROP INDEX ledger_tenant_created;
DROP INDEX ledger_balance;
ALTER TABLE ledger RENAME TO ledger_v1;
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
  quantity INTEGER NOT NULL CHECK(quantity != 0 OR kind = 'quality_reclassify'),
  value_change INTEGER NOT NULL,
  on_hand_after INTEGER NOT NULL CHECK(on_hand_after >= 0),
  value_after INTEGER NOT NULL CHECK(value_after >= 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  quality_from TEXT,
  quality_to TEXT,
  quality_quantity INTEGER,
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id),
  FOREIGN KEY(tenant_id,count_id) REFERENCES stock_counts(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
INSERT INTO ledger(sequence,id,tenant_id,warehouse_id,location_id,sku_id,document_id,count_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at)
  SELECT sequence,id,tenant_id,warehouse_id,location_id,sku_id,document_id,count_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at FROM ledger_v1;
DROP TABLE ledger_v1;
CREATE INDEX ledger_tenant_created ON ledger(tenant_id,sequence);
CREATE INDEX ledger_balance ON ledger(tenant_id,warehouse_id,sku_id,sequence);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is immutable'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger is immutable'); END;
