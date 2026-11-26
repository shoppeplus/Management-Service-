# Business overview

The **Dashboard / Tổng quan** page at `/dashboard` brings the shared Inbox and Operations snapshots together. It reads the same service adapters and record IDs as the other modules. Demo figures come from browser storage; Live figures come from the configured API. It does not introduce an analytics backend, provider connection, payment settlement, or automatic data substitution after an API failure.

## Date range and comparison

Choose the latest 7, 30, or 90 calendar days, including today, in the browser's local timezone. The default is 30 days. Records later than the time of calculation are excluded. Comparisons use the immediately preceding calendar window of the same length. A previous value of zero is shown without inventing a percentage increase.

Order metrics, the trend, recent orders, product rankings, and order status counts use each order's `createdAt`. A delivered order created before the selected period is not moved into the period because its status later changed. The available model does not store a separate delivery-completion timestamp for accounting reports.

Incoming message and channel metrics use individual incoming messages' `sentAt`. Internal notes and outgoing replies do not count as incoming demand. Active customers are distinct customer IDs with at least one incoming message in the selected period; this is not a count of newly created CRM contacts.

## Metric definitions

| Metric               | Definition                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order count          | Orders created in the period, including cancelled and returned orders so their status remains visible.                                                                                                                                               |
| Valid order value    | Total of period orders excluding cancelled and returned orders. Includes drafts, confirmed orders, packing, shipped and delivered orders; uses each order's total after discount and shipping. This is an order-value indicator, not money received. |
| Delivered value      | Period orders currently marked delivered, excluding refunded orders. This is not verified bank revenue or a settlement statement.                                                                                                                    |
| Incoming messages    | Number of incoming customer messages sent during the period.                                                                                                                                                                                         |
| Active customers     | Distinct customers with incoming messages in the period.                                                                                                                                                                                             |
| Channel distribution | Incoming messages per channel, plus distinct conversations containing those messages.                                                                                                                                                                |
| Product ranking      | Quantities and gross line values on valid period orders, before order-level discounts or shipping adjustments.                                                                                                                                       |

The chart also exposes a readable data view so its values can be reviewed without relying on color or the graphical display.

## Current work

Work that still needs attention is based on the current snapshot and is **not hidden by the date filter**:

- Open or pending conversations, including unread, unassigned and overdue conversations. Resolved and closed conversations are excluded.
- Draft, confirmed and packing orders that still need processing.
- Shipment exceptions.
- Unresolved tickets and overdue unresolved tickets.
- Products with available stock at or below 10 units.

The attention list prioritizes overdue work, shipment exceptions, urgent requests and unread conversations. Links open the exact conversation, ticket, shipment or order using the existing detail routes. Creating an order opens the existing order form; the Dashboard does not bypass its validation or save a sale automatically.

## Refresh and empty states

Use **Refresh / Làm mới** to read both service snapshots again. A successful refresh updates the calculation time and reports success. A failed refresh reports the error and retains the previously displayed snapshot; it does not silently replace Live data with Demo records. Empty periods, missing channel activity and an empty attention queue have explicit empty states.

The page uses the existing VI/EN preference and supports the shared mobile navigation. Narrow tables scroll within their own container. Keyboard users can reach controls, data views and record links through the normal tab order.
