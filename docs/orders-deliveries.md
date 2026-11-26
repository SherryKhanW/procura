# Purchase orders and deliveries

This module implements Omer's Milestone 4 handoff: Purchasing turns an approved purchase request into a purchase order (PO), and Receiving records goods against PO items.

## Access and workflow

- Only `Purchasing` has `orders:manage`. Purchasing, Receiving, Finance, and Admin can read POs.
- Only `Receiving` has `deliveries:manage`. Receiving, Finance, and Admin can read deliveries.
- The server, not the browser, checks these permissions. The signed-in receiving employee is written to `Delivery.EmployeeID`.
- A PO can only be created from an approved request that does not already have a PO. The database's unique `Purchase_Order.RequestID` constraint remains the final duplicate guard.
- An order must include every product from its source request exactly once. The selected vendor must be Active and have a `Vendor_Product` listing for every product.
- The vendor's current agreed price prefills the UI, but `Purchase_Order_Item.UnitPrice` stores the final submitted price so later catalog changes do not alter history.

## Delivery rules

One delivery can include lines from several POs. Each `Delivery_Item` remains linked to one `Purchase_Order_Item`, preserving traceability.

The delivery transaction locks every affected PO in a stable order, locks its item rows, and then performs a current locking read of the related delivery rows. It checks the accumulated received quantity, creates the header and all its lines together, then recomputes every affected PO's receipt state. This ordering serializes overlapping consolidated deliveries before either transaction relies on received totals.

- `Partially Received` when any item still has a remaining quantity.
- `Received` when every item has been received in full.

The API rejects duplicate item lines in a delivery, quantities of zero, quantities greater than the remaining amount, missing order items, and items from an invoiced or closed PO. A failed check rolls the entire transaction back.

## Local verification

Use Node 22 and run the offline checks from the repository root:

```sh
nvm use
npm test
npm run build
```

The test suite uses mocked repositories; it does not connect to the shared database. After valid shared credentials are entered in `server/.env`, run `npm run db:check`, then `npm run dev`.

For the live Omer-to-Wajeeh handoff test:

1. Sign in as an employee and submit a request containing products supplied by one Active vendor.
2. Sign in as a manager and approve it.
3. Sign in as Purchasing, open **Purchase orders**, create the PO, select the eligible vendor, and confirm the prices and total.
4. Sign in as Receiving, open **Deliveries**, record an initial partial delivery, then record the outstanding remainder.
5. Confirm the order detail shows the correct received quantities and total, and its status becomes `Received`.

Record screenshots of the PO creation form, a partial delivery, the final order detail, and the passing test/build commands for the report.
