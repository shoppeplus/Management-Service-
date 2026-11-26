CREATE TABLE stock_restock_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')),
  source_reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,number),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);

CREATE TABLE stock_restock_request_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK(line_number>=1),
  requested_quantity INTEGER NOT NULL CHECK(requested_quantity>0),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,request_id,line_number),
  UNIQUE(tenant_id,request_id,sku_id),
  FOREIGN KEY(tenant_id,request_id) REFERENCES stock_restock_requests(tenant_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id)
);
CREATE INDEX stock_restock_requests_tenant_status
  ON stock_restock_requests(tenant_id,status,created_at DESC);
CREATE INDEX stock_restock_request_lines_request
  ON stock_restock_request_lines(tenant_id,request_id,line_number);

ALTER TABLE purchase_orders ADD COLUMN restock_request_id TEXT;
CREATE INDEX purchase_orders_restock_request
  ON purchase_orders(tenant_id,restock_request_id);
