CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_normalized TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  membership TEXT NOT NULL DEFAULT 'Standard'
    CHECK(membership IN ('Standard','Silver','Gold','Platinum')),
  location TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#dedcf5',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX customers_tenant_email
  ON customers(tenant_id,email COLLATE NOCASE) WHERE email<>'';
CREATE UNIQUE INDEX customers_tenant_phone
  ON customers(tenant_id,phone_normalized) WHERE phone_normalized<>'';
CREATE INDEX customers_tenant_name ON customers(tenant_id,name COLLATE NOCASE);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,name)
);

CREATE TABLE team_members (
  tenant_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,team_id,user_id),
  FOREIGN KEY(tenant_id,team_id) REFERENCES teams(tenant_id,id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);

CREATE TABLE channel_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  channel TEXT NOT NULL CHECK(channel IN (
    'shopee','lazada','tiktok','zalo','whatsapp','instagram',
    'messenger','telegram','livechat','email'
  )),
  account_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'connected','disconnected','expired','error','unavailable'
  )),
  last_synced_at TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN (
    'shopee','lazada','tiktok','zalo','whatsapp','instagram',
    'messenger','telegram','livechat','email'
  )),
  connection_id TEXT,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','pending','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  assignee_id TEXT,
  team_id TEXT,
  subject TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0 CHECK(unread>=0),
  last_message_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  source_url TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  mentioned INTEGER NOT NULL DEFAULT 0 CHECK(mentioned IN (0,1)),
  bot INTEGER NOT NULL DEFAULT 0 CHECK(bot IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,channel,external_id),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,connection_id) REFERENCES channel_connections(tenant_id,id),
  FOREIGN KEY(tenant_id,assignee_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,team_id) REFERENCES teams(tenant_id,id)
);
CREATE INDEX conversations_tenant_activity
  ON conversations(tenant_id,last_message_at DESC,id);
CREATE INDEX conversations_tenant_assignee
  ON conversations(tenant_id,assignee_id,status);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  external_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('incoming','outgoing','note')),
  text TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL,
  delivery TEXT NOT NULL DEFAULT 'sent' CHECK(delivery IN ('sent','delivered','read')),
  author_name TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,conversation_id,external_id),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id)
);
CREATE INDEX messages_conversation_time
  ON messages(tenant_id,conversation_id,sent_at,id);

CREATE TABLE customer_profiles (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','active','inactive')),
  owner_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,customer_id),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id)
);

CREATE TABLE customer_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,author_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX customer_notes_customer_time
  ON customer_notes(tenant_id,customer_id,created_at DESC);

CREATE TABLE sales_order_contexts (
  tenant_id TEXT NOT NULL,
  sales_order_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  conversation_id TEXT,
  client_request_id TEXT,
  client_request_hash TEXT,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cod','bank_transfer')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK(payment_status IN ('unpaid','paid','refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(fulfillment_status IN (
      'draft','confirmed','packing','shipped','delivered','cancelled','returned'
    )),
  discount INTEGER NOT NULL DEFAULT 0 CHECK(discount>=0),
  shipping_fee INTEGER NOT NULL DEFAULT 0 CHECK(shipping_fee>=0),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,sales_order_id),
  UNIQUE(tenant_id,client_request_id),
  FOREIGN KEY(tenant_id,sales_order_id) REFERENCES sales_orders(tenant_id,id),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id)
);
CREATE INDEX sales_order_context_customer
  ON sales_order_contexts(tenant_id,customer_id,created_at DESC);

CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sales_order_id TEXT NOT NULL,
  carrier_id TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  tracking_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK(status IN ('ready','in_transit','delivered','exception','returned','cancelled')),
  estimated_delivery_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,sales_order_id) REFERENCES sales_orders(tenant_id,id)
);
CREATE UNIQUE INDEX shipments_active_order
  ON shipments(tenant_id,sales_order_id)
  WHERE status<>'cancelled';
CREATE INDEX shipments_tenant_status
  ON shipments(tenant_id,status,created_at DESC);

CREATE TABLE shipment_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN ('ready','in_transit','delivered','exception','returned','cancelled')),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,shipment_id) REFERENCES shipments(tenant_id,id)
);
CREATE INDEX shipment_events_history
  ON shipment_events(tenant_id,shipment_id,created_at,id);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sales_order_id TEXT,
  conversation_id TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('delivery','return','payment','product','other')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  assignee_id TEXT,
  due_at TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,number),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,sales_order_id) REFERENCES sales_orders(tenant_id,id),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id),
  FOREIGN KEY(tenant_id,assignee_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX tickets_tenant_status
  ON tickets(tenant_id,status,priority,due_at);

CREATE TABLE ticket_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,ticket_id) REFERENCES tickets(tenant_id,id),
  FOREIGN KEY(tenant_id,author_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX ticket_comments_history
  ON ticket_comments(tenant_id,ticket_id,created_at,id);
