CREATE TABLE sales_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  customer_reference TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','fulfilled','returned','cancelled')),
  fulfillment_document_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  fulfilled_at TEXT,
  cancelled_at TEXT,
  returned_at TEXT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,number),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,fulfillment_document_id) REFERENCES stock_documents(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX sales_order_external_reference ON sales_orders(tenant_id,reference) WHERE reference<>'';
CREATE INDEX sales_orders_tenant_status ON sales_orders(tenant_id,status,created_at);

CREATE TABLE sales_order_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sales_order_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  unit_price INTEGER NOT NULL CHECK(unit_price>=0),
  location_id TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,sales_order_id,sku_id),
  FOREIGN KEY(tenant_id,sales_order_id) REFERENCES sales_orders(tenant_id,id),
  FOREIGN KEY(tenant_id,sku_id) REFERENCES inventory_skus(tenant_id,id),
  FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id),
  FOREIGN KEY(tenant_id,warehouse_id,location_id) REFERENCES locations(tenant_id,warehouse_id,id)
);

CREATE TABLE sales_order_line_reservations (
  tenant_id TEXT NOT NULL,
  sales_order_line_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,sales_order_line_id),
  UNIQUE(tenant_id,reservation_id),
  FOREIGN KEY(tenant_id,sales_order_line_id) REFERENCES sales_order_lines(tenant_id,id),
  FOREIGN KEY(tenant_id,reservation_id) REFERENCES reservations(tenant_id,id)
);

CREATE TABLE sales_order_returns (
  tenant_id TEXT NOT NULL,
  sales_order_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,document_id),
  FOREIGN KEY(tenant_id,sales_order_id) REFERENCES sales_orders(tenant_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id)
);

CREATE TABLE sales_order_return_lines (
  tenant_id TEXT NOT NULL,
  return_document_id TEXT NOT NULL,
  sales_order_line_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  PRIMARY KEY(tenant_id,return_document_id,sales_order_line_id),
  FOREIGN KEY(tenant_id,return_document_id) REFERENCES sales_order_returns(tenant_id,document_id),
  FOREIGN KEY(tenant_id,sales_order_line_id) REFERENCES sales_order_lines(tenant_id,id)
);

CREATE INDEX sales_order_returns_order ON sales_order_returns(tenant_id,sales_order_id);
CREATE INDEX sales_order_return_lines_line ON sales_order_return_lines(tenant_id,sales_order_line_id);
