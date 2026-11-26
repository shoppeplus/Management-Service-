# Internal accounting ledger

The `/accounting` workspace separates work into an overview, purchase approvals, trial balance, journal, and chart of accounts. The journal includes permission-gated manual posting and reversals. Each ledger view supports CSV export. The Reports page also provides a read-only route to the internal VND double-entry ledger.

The workspace menu is permission-aware: purchase approvals require `purchaseOrder.approve`, while ledger views require `accounting.read`. The overview is shown to users with purchase-approval access and provides a pending-approval summary with shortcuts into the available work.

## Permissions

- `accounting.read` grants access to the ledger and report views. Owners and managers receive it by default; administrators receive read access.
- `accounting.post` grants manual journal posting and reversal. Owners receive it by default. Grant it to other roles only through the user's explicit permission overrides.

All API access is tenant-scoped from the authenticated session. Tenant and actor identifiers are never accepted from request bodies.

## API

- `GET /api/v1/accounting/accounts`
- `GET /api/v1/accounting/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/v1/accounting/journals?from=YYYY-MM-DD&to=YYYY-MM-DD&accountCode=A-CASH&limit=100&offset=0`
- `POST /api/v1/accounting/journals`
- `POST /api/v1/accounting/journals/:id/reverse`

Journal entries are immutable after posting. Corrections are made by posting a linked reversal; posted entries and their lines are audited.

## Current limitations

This is a neutral ledger foundation, not a configured statutory accounting package. The starter chart and reports have not been mapped to a selected accounting regime, nor reviewed for statutory filing.

The current order model does not retain payment/refund events, tax invoices, or expense records. Inventory movements are not automatically linked to accounting journal entries. Therefore the ledger does not yet automatically recognize sales, cash receipts, refunds, tax, cost of goods sold, purchases, or expenses. The Reports page identifies this limitation and only reflects entries posted directly into the ledger.

Before using this for bookkeeping, confirm the applicable accounting regime with an accountant, then implement and test source-document integrations and reconciliation workflows.
