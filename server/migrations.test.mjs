import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.mjs'

describe('Inventory schema upgrades', () => {
  it('removes legacy SerpAPI credentials when upgrading', () => {
    const directory = mkdtempSync(join(tmpdir(), 'integration-upgrade-'))
    const path = join(directory, 'inventory.sqlite')
    let db = openDatabase(path)
    try {
      db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
        'tenant',
        'Existing company',
        '2026-01-01T00:00:00Z',
      )
      db.prepare(
        `INSERT INTO integration_credentials(
          tenant_id,provider,ciphertext,nonce,auth_tag,account_name,created_at,updated_at
        ) VALUES('tenant','serpapi','ciphertext','nonce','tag','SerpAPI','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
      ).run()
      db.prepare(
        "DELETE FROM schema_migrations WHERE version='015_remove_serpapi_credentials.sql'",
      ).run()
      db.close()
      db = openDatabase(path)

      expect(db.prepare('SELECT COUNT(*) AS total FROM integration_credentials').get().total).toBe(
        0,
      )
    } finally {
      db.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('upgrades existing v1 balances and journal without resetting stock or identity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-upgrade-'))
    const path = join(directory, 'inventory.sqlite')
    let db = new DatabaseSync(path)
    try {
      const sql = readFileSync(new URL('./migrations/001_inventory.sql', import.meta.url), 'utf8')
      db.exec(`PRAGMA foreign_keys=ON;
        CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL);`)
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(
        '001_inventory.sql',
        createHash('sha256').update(sql).digest('hex'),
        '2026-01-01T00:00:00Z',
      )
      db.exec(`
        INSERT INTO tenants(id,name,created_at) VALUES('tenant','Existing company','2026-01-01T00:00:00Z');
        INSERT INTO users(id,tenant_id,name,role) VALUES('user','tenant','Owner','owner');
        INSERT INTO warehouses(id,tenant_id,code,name,created_at) VALUES('warehouse','tenant','OLD','Existing warehouse','2026-01-01T00:00:00Z');
        INSERT INTO locations(id,tenant_id,warehouse_id,code,name,is_default) VALUES('location','tenant','warehouse','DEFAULT','Existing location',1);
        INSERT INTO inventory_skus(id,tenant_id,sku,name,created_at) VALUES('sku','tenant','OLD-SKU','Existing item','2026-01-01T00:00:00Z');
        INSERT INTO inventory_skus(id,tenant_id,sku,name,price,created_at) VALUES('priced-sku','tenant','PRICED-SKU','Existing priced item',150000,'2026-01-01T00:00:00Z');
        INSERT INTO stock_documents(id,tenant_id,number,type,status,warehouse_id,created_by,created_at) VALUES('document','tenant','PN-OLD','receipt','posted','warehouse','user','2026-01-01T00:00:00Z');
        INSERT INTO balances(tenant_id,warehouse_id,location_id,sku_id,on_hand,reserved,inventory_value,updated_at) VALUES('tenant','warehouse','location','sku',7,2,700,'2026-01-01T00:00:00Z');
        INSERT INTO reservations(id,tenant_id,warehouse_id,location_id,sku_id,quantity,reference,status,created_at,created_by) VALUES('active-reservation','tenant','warehouse','location','sku',2,'SO-EXISTING','active','2026-01-01T00:00:00Z','user');
        INSERT INTO reservations(id,tenant_id,warehouse_id,location_id,sku_id,quantity,reference,status,created_at,released_at,created_by) VALUES('released-reservation','tenant','warehouse','location','sku',3,'SO-RELEASED','released','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','user');
        INSERT INTO ledger(id,tenant_id,warehouse_id,location_id,sku_id,document_id,kind,quantity,value_change,on_hand_after,value_after,actor_id,created_at)
          VALUES('ledger-original','tenant','warehouse','location','sku','document','receipt',7,700,7,700,'user','2026-01-01T00:00:00Z');
      `)
      db.close()
      db = openDatabase(path)
      expect(
        db.prepare('SELECT on_hand,reserved,inventory_value,damaged,warranty FROM balances').get(),
      ).toMatchObject({ on_hand: 7, reserved: 2, inventory_value: 700, damaged: 0, warranty: 0 })
      expect(db.prepare('SELECT id,sequence,quantity,value_after FROM ledger').get()).toMatchObject(
        { id: 'ledger-original', sequence: 1, quantity: 7, value_after: 700 },
      )
      expect(
        db
          .prepare(
            "SELECT quantity,quantity_remaining,consumed_quantity,released_quantity,status FROM reservations WHERE id='active-reservation'",
          )
          .get(),
      ).toMatchObject({
        quantity: 2,
        quantity_remaining: 2,
        consumed_quantity: 0,
        released_quantity: 0,
        status: 'active',
      })
      expect(
        db
          .prepare(
            "SELECT quantity,quantity_remaining,consumed_quantity,released_quantity,status FROM reservations WHERE id='released-reservation'",
          )
          .get(),
      ).toMatchObject({
        quantity: 3,
        quantity_remaining: 0,
        consumed_quantity: 0,
        released_quantity: 3,
        status: 'released',
      })
      expect(
        db.prepare('SELECT id,price,price_known FROM inventory_skus ORDER BY id').all(),
      ).toEqual([
        { id: 'priced-sku', price: 150000, price_known: 1 },
        { id: 'sku', price: 0, price_known: 0 },
      ])
      expect(db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total).toBe(19)
      expect(
        db
          .prepare('SELECT version FROM schema_migrations ORDER BY version')
          .all()
          .map((row) => row.version),
      ).toEqual([
        '001_inventory.sql',
        '002_inventory_quality.sql',
        '003_inventory_returns.sql',
        '004_purchase_orders_reservations.sql',
        '005_inventory_sales.sql',
        '006_quotation_catalog.sql',
        '007_accounts.sql',
        '008_auth_activity.sql',
        '009_permission_overrides.sql',
        '010_business_operations.sql',
        '011_telegram_sync_cursor.sql',
        '012_market_intelligence.sql',
        '013_integration_credentials.sql',
        '014_marketplace_credentials.sql',
        '015_remove_serpapi_credentials.sql',
        '016_user_activity.sql',
        '017_accounting_ledger.sql',
        '018_stock_restock_requests.sql',
        '019_accountant_role.sql',
      ])
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('purchase_orders','purchase_order_lines','reservation_allocations','sales_orders','sales_order_lines','stock_restock_requests','stock_restock_request_lines') ORDER BY name",
          )
          .all()
          .map((row) => row.name),
      ).toEqual([
        'purchase_order_lines',
        'purchase_orders',
        'reservation_allocations',
        'sales_order_lines',
        'sales_orders',
        'stock_restock_request_lines',
        'stock_restock_requests',
      ])
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(() =>
        db.prepare("UPDATE ledger SET quantity=1 WHERE id='ledger-original'").run(),
      ).toThrow('immutable')
      db.close()
      db = openDatabase(path)
      expect(db.prepare('SELECT COUNT(*) AS total FROM ledger').get().total).toBe(1)
    } finally {
      db.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('refuses a changed migration checksum instead of running against an unknown schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'inventory-checksum-'))
    const path = join(directory, 'inventory.sqlite')
    const db = openDatabase(path)
    db.prepare(
      "UPDATE schema_migrations SET checksum='changed' WHERE version='001_inventory.sql'",
    ).run()
    db.close()
    try {
      expect(() => openDatabase(path)).toThrow('Migration checksum mismatch')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
