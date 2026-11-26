# Operations API and Demo rules

The Customers, Customer Care, Orders and Logistics modules share canonical customer and conversation IDs with Inbox; they do not maintain a second customer database. Demo mode is an explicit local adapter. Live mode uses the tenant-scoped SQLite API for customers, CRM, orders, manual shipment records, tickets and the inventory-backed catalog. No social channel, payment processor, or external carrier provider is connected.

## Service boundaries

`src/modules/operations/types.ts` defines public domain objects and the `OperationsService` port. `service.ts` provides local Demo and HTTP adapters. `domain.ts` owns state-transition maps; `validation.ts` checks persisted/API snapshots and relationships; `carriers.ts` is an explicitly named Mock Adapter. Replace adapters without changing page components. UI commands must always use the service, which owns totals, stock, transitions and audit records.

Demo storage uses `smartsales.operations.demo.v1` with `schemaVersion: 1`. Inbox storage stays separate. Fresh profiles are added for newly created canonical customers without replacing previous CRM edits. Mutations are queued within the service instance, validate a cloned snapshot, and commit once; storage errors do not report success or mutate in-memory state. This is a single-browser demonstration, not a transactional multi-user database. Production needs server transactions, idempotency, access control, tenant isolation and durable audit logs.

## HTTP endpoints (SQLite backend)

Live mode is the default outside tests; set `VITE_APP_MODE=demo` only for an explicit local demonstration. The browser uses the same-origin Vite proxy in development. In production, set an absolute HTTPS `VITE_API_BASE_URL` behind a same-origin reverse proxy so the HttpOnly session cookie remains available. All calls use JSON, `credentials: include` and a 15-second timeout. Failed or malformed Live responses never fall back to Demo data. Operations endpoints return the full validated `OperationsData` object directly, without a wrapper. The protected Inbox endpoints return tenant-scoped canonical data; outbound replies and channel synchronization remain unavailable until real provider adapters are configured.

| Method | Path under API base URL             | Body                                 |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/operations`                       | —                                    |
| PATCH  | `/operations/customers/:id/profile` | Lifecycle, owner, source and/or tags |
| POST   | `/operations/customers/:id/notes`   | `{ text }`                           |
| POST   | `/operations/orders`                | `CreateOrderInput`                   |
| POST   | `/operations/orders/:id/status`     | `{ status }`                         |
| POST   | `/operations/orders/:id/payment`    | `{ status }`                         |
| POST   | `/operations/shipments`             | `{ orderId, carrierId: "manual" }`   |
| POST   | `/operations/shipments/:id/events`  | `{ status, description? }`           |
| POST   | `/operations/tickets`               | `CreateTicketInput`                  |
| PATCH  | `/operations/tickets/:id`           | `TicketPatch`                        |
| POST   | `/operations/tickets/:id/comments`  | `{ text }`                           |

Canonical customer creation is `POST /customers`, and contact edits remain `PATCH /customers/:id` in the Inbox service. Live shipment records use the internal `manual` carrier; they do not call a carrier or produce a carrier quote. Staff-entered shipment events update the internal fulfillment timeline only. Returned goods must be processed separately through inventory. HTTP errors reject the command. A timed-out mutation may already have succeeded server-side; order creation includes an idempotency key for safe retries. Never put provider or Firebase Admin secrets in public `VITE_*` variables.

Orders created inside the Inbox include `conversationId` and UUID `clientRequestId`. The backend verifies tenant/customer/conversation ownership, hashes the sanitized order body to prevent request-key reuse with different input, and saves the draft and key in one transaction. Repeating a request returns the original order. Confirming the draft still requires a separate stock-checked action; synchronization and AI analysis never create orders implicitly. See the [channel integration contract](channel-integration.md).

## Product catalog and local quotations

Each `Product` retains its required `id`, `sku`, `name`, integer VND `price`, and non-negative integer `stock`. The following optional fields supply the quotation catalog and illustrated PDF; older snapshots without them remain valid at `schemaVersion: 1`.

| Field         | Limit            | Meaning                                                                                                                                                           |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imageUrl`    | 2,048 characters | Root-relative `/...` path or absolute HTTP(S) URL. Protocol-relative paths, credentials, whitespace, backslashes, malformed URLs, and other schemes are rejected. |
| `description` | 2,000 characters | Plain-text product description; may be empty.                                                                                                                     |
| `unit`        | 1–40 characters  | Unit label such as `Bộ`, `Cốc`, or `Hũ`.                                                                                                                          |
| `category`    | 1–100 characters | Catalog group used by the quotation filter.                                                                                                                       |

For example:

```json
{
  "id": "product-001",
  "sku": "CER-001",
  "name": "Bộ bình gốm Nordic",
  "price": 650000,
  "stock": 36,
  "imageUrl": "/products/nordic.svg",
  "description": "Bộ bình gốm tông cát, dùng trang trí hoặc cắm hoa.",
  "unit": "Bộ",
  "category": "Gốm trang trí"
}
```

The Demo adapter fills only absent metadata for its six known seed product IDs, preserving saved prices, stock, names, custom metadata, and custom products. Live responses are validated without inserting Demo metadata. The bundled SVGs are product illustrations for the Demo, not product photographs.

The quotation builder opens from a customer conversation and loads the catalog through `OperationsService.load()`. Search covers names, SKUs, and descriptions with Vietnamese accent normalization, combined with the category filter. Client-side pages show 24 products and retain the selected items across searches and page changes, supporting catalogs of 1,000 or more products. At present `GET /operations` returns the full catalog; these pages do not introduce server-side pagination or a new API endpoint. A quotation contains 1–200 distinct products, each with an integer quantity from 1 to 999. Stock availability is informational; quotations may exceed stock and do not reserve it.

The user supplies seller/customer details, issue/expiry dates, optional payment/delivery terms, notes, discount, and shipping fee, then reviews and downloads the PDF. Totals use integer VND and must remain safe integers; discounts cannot exceed subtotal. Dates must be real calendar dates and expiry cannot precede issue. PDF generation happens locally in the browser: it does not persist a quotation, call a quotation backend, create an order, change stock, or send a message to the customer. The downloaded file must be shared explicitly by the user. If durable quotation records, automatic sharing, or conversion to orders are added later, implement explicit server commands and authorization rather than treating a PDF download as a sale.

## Business invariants

- Money is integer VND. Prices come from the catalog; the service recomputes line totals and `subtotal - discount + shippingFee`. Drafts do not reserve stock. Confirming reserves stock; cancelling confirmed/packing orders restores it once and cancels any shipment awaiting pickup. Cancelling a draft leaves stock unchanged.
- Orders follow `draft → confirmed → packing`. Shipping status is driven by a shipment, not arbitrary order edits. Only packing orders can have a shipment; at most one non-cancelled shipment may exist per order. A cancelled pickup can be replaced.
- Mock pickup changes order status to shipped. Mock delivery completes the order and records COD as paid. These are simulation records, not proof of settlement. An exception may be retried or returned; returns restore stock once and keep payment state unchanged. Delivered shipments are terminal in this version; post-delivery returns require a future RMA workflow.
- Recording paid is allowed only for active, non-draft orders that are unpaid. It clears the remaining COD amount on active mock shipments. Refunds require a paid order that is cancelled or returned, and are recorded explicitly once. No money moves.
- Tickets reference the same customer as any linked order/conversation. Initial SLA deadlines are 2 hours for urgent, 4 for high, 24 for normal and 48 for low. Changing priority does not silently reset an existing deadline. A resolution is mandatory before resolving/closing; reopening clears `resolvedAt`. Comments and CRM notes are internal only.
- CRM permits lifecycle, owner, source, up to 10 unique tags and plain-text notes. Canonical contact details remain in Inbox. Hard deletion is intentionally absent, preserving linked historical records.

Operations reset replaces only its own Demo key, preserving canonical contacts and conversations. The Inbox settings action restores seed conversations and clears Inbox drafts while preserving contacts and operations. Only explicit recovery after an Inbox load error resets both datasets, with a warning that all Demo changes will be removed. Recovery writes the two keys sequentially, not atomically; if the second write fails, it reports the error and operations recovery can be retried. Reset is unavailable in Live Mode. For schema changes, add an explicit version migration with regression tests before reading older snapshots; never silently discard saved records.
