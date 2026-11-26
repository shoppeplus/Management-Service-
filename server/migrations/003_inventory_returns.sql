CREATE TABLE stock_document_returns (
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  PRIMARY KEY(tenant_id,document_id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id),
  FOREIGN KEY(tenant_id,source_document_id) REFERENCES stock_documents(tenant_id,id)
);
CREATE TABLE serial_issues (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  serial_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  unit_value INTEGER NOT NULL CHECK(unit_value >= 0),
  returned_by_document_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,serial_id,document_id),
  FOREIGN KEY(tenant_id,serial_id) REFERENCES serials(tenant_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES stock_documents(tenant_id,id),
  FOREIGN KEY(tenant_id,line_id) REFERENCES stock_document_lines(tenant_id,id),
  FOREIGN KEY(tenant_id,returned_by_document_id) REFERENCES stock_documents(tenant_id,id)
);
