CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','partial','received','cancelled')),
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,number),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE purchase_order_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK(line_number>=1),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  unit_cost INTEGER NOT NULL CHECK(unit_cost>=0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0 AND received_quantity<=quantity),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,purchase_order_id,line_number),
  UNIQUE(tenant_id,purchase_order_id,sku_id,location_id),
  FOREIGN KEY(tenant_id,purchase_order_id) REFERENCES purchase_orders(tenant_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id)
);
CREATE TABLE purchase_order_receipts (
  tenant_id TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  PRIMARY KEY(tenant_id,document_id),
  FOREIGN KEY(tenant_id,purchase_order_id) REFERENCES purchase_orders(tenant_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id)
);
CREATE TABLE purchase_receipt_lines (
  tenant_id TEXT NOT NULL,
  document_line_id TEXT NOT NULL,
  purchase_order_line_id TEXT NOT NULL,
  PRIMARY KEY(tenant_id,document_line_id),
  FOREIGN KEY(tenant_id,document_line_id) REFERENCES stock_document_lines(tenant_id,id),
  FOREIGN KEY(tenant_id,purchase_order_line_id) REFERENCES purchase_order_lines(tenant_id,id)
);

ALTER TABLE reservations RENAME TO reservations_v1;
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  quantity_remaining INTEGER NOT NULL CHECK(quantity_remaining>=0),
  consumed_quantity INTEGER NOT NULL DEFAULT 0 CHECK(consumed_quantity>=0),
  released_quantity INTEGER NOT NULL DEFAULT 0 CHECK(released_quantity>=0),
  reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','partial','consumed','released')),
  created_at TEXT NOT NULL,
  released_at TEXT,
  consumed_at TEXT,
  created_by TEXT NOT NULL,
  CHECK(quantity_remaining+consumed_quantity+released_quantity=quantity),
  CHECK((status='active' AND quantity_remaining=quantity) OR (status='partial' AND quantity_remaining>0 AND consumed_quantity>0) OR (status='consumed' AND quantity_remaining=0 AND released_quantity=0) OR (status='released' AND quantity_remaining=0 AND released_quantity>0)),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
INSERT INTO reservations(id,tenant_id,warehouse_id,location_id,sku_id,quantity,quantity_remaining,consumed_quantity,released_quantity,reference,status,created_at,released_at,created_by)
 SELECT id,tenant_id,warehouse_id,location_id,sku_id,quantity,CASE WHEN status='active' THEN quantity ELSE 0 END,0,CASE WHEN status='released' THEN quantity ELSE 0 END,reference,status,created_at,released_at,created_by FROM reservations_v1;
DROP TABLE reservations_v1;
CREATE TABLE reservation_allocations (
  tenant_id TEXT NOT NULL,
  document_line_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  consumed_at TEXT,
  PRIMARY KEY(tenant_id,document_line_id,reservation_id),
  FOREIGN KEY(tenant_id,document_line_id) REFERENCES stock_document_lines(tenant_id,id),
  FOREIGN KEY(tenant_id,reservation_id) REFERENCES reservations(tenant_id,id)
);

ALTER TABLE inventory_skus ADD COLUMN warranty_months INTEGER CHECK(warranty_months IS NULL OR (warranty_months>=0 AND warranty_months<=1200));
ALTER TABLE serial_issues ADD COLUMN warranty_months INTEGER CHECK(warranty_months IS NULL OR (warranty_months>=0 AND warranty_months<=1200));
ALTER TABLE serial_issues ADD COLUMN warranty_ends_at TEXT;
ALTER TABLE warranties ADD COLUMN received_from_customer_at TEXT;
ALTER TABLE warranties ADD COLUMN warranty_valid_at_intake INTEGER CHECK(warranty_valid_at_intake IS NULL OR warranty_valid_at_intake IN (0,1));
ALTER TABLE warranties ADD COLUMN warranty_ends_at TEXT;
ALTER TABLE warranties ADD COLUMN resolution TEXT NOT NULL DEFAULT '';
ALTER TABLE warranties ADD COLUMN source_issue_document_id TEXT;
CREATE INDEX purchase_orders_tenant_status ON purchase_orders(tenant_id,status);
CREATE INDEX purchase_receipts_order_line ON purchase_receipt_lines(tenant_id,purchase_order_line_id);
CREATE INDEX reservation_allocation_reservation ON reservation_allocations(tenant_id,reservation_id);
