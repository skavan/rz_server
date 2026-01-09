# Purchase Order Tracking (Shipments) - Client Guide

This doc explains how to implement tracking numbers for Purchase Orders using the new shipments API. A tracking number can cover multiple PO line items, and a line item can appear in multiple shipments. Tracking numbers never cross POs.

---

## Data Model (Mental Model)

- **Shipment**: One tracking number tied to a single PO.
- **Shipment Items**: The line items (and quantities) included in that shipment.

Tables:
- `inventory_purchase_order_shipments` (parent)
- `inventory_purchase_order_shipment_items` (child / join table)

---

## Status Values

Shipment status values:
- `label_created`
- `in_transit`
- `delivered`
- `exception`
- `canceled`

Default is `label_created` if none is provided.

---

## API Endpoints

Base path: `/api/inventory-purchase-order-shipments`

List shipments (filter by PO):
```
GET /api/inventory-purchase-order-shipments?purchase_order_id=123
```

Get one shipment with items:
```
GET /api/inventory-purchase-order-shipments/:id
```

Create shipment + items:
```
POST /api/inventory-purchase-order-shipments/composite
```

Update shipment + replace items:
```
PUT /api/inventory-purchase-order-shipments/:id/composite
```

Delete shipment (cascade deletes items):
```
DELETE /api/inventory-purchase-order-shipments/:id
```

---

## Payload Shapes

Create example:
```json
{
  "shipment": {
    "purchaseOrderId": 123,
    "trackingNumber": "1Z12345E0205271688",
    "carrier": "UPS",
    "status": "in_transit",
    "shippedAt": "2025-01-22T10:00:00.000Z",
    "etaDate": "2025-01-25"
  },
  "items": [
    { "purchaseOrderItemId": 456, "quantity": 2 },
    { "purchaseOrderItemId": 457, "quantity": 1, "receivedQuantity": 0 }
  ]
}
```

Update example (replace items):
```json
{
  "shipment": {
    "carrier": "FedEx",
    "status": "delivered",
    "deliveredAt": "2025-01-26T16:30:00.000Z"
  },
  "items": [
    { "purchaseOrderItemId": 456, "quantity": 2, "receivedQuantity": 2 }
  ]
}
```

Notes:
- `purchaseOrderId` is required on create and cannot be changed later.
- `trackingNumber` is required and must be unique per PO.
- If `items` is omitted on update, existing allocations remain unchanged.

---

## UI Guidance

### Where this lives
Add a **Shipments** section on the PO detail page (below line items).

### Primary action
**Add Tracking** button opens a modal or drawer:
1) Enter carrier + tracking number (optional ETA/shipped date)
2) Select PO line items + quantities (pre-fill remaining quantity)
3) Confirm

### Display patterns
- **Shipment list**: carrier + tracking number, status, shipped/ETA/delivered, and a small summary (e.g., "3 items • 7 units").
- **Line items list**: show tracking chips per item (click chip opens shipment detail).
- **Line item drawer**: show all shipments touching that item with quantities.

### Defaults
- Suggested quantity = ordered quantity minus already allocated quantities.
- For documents-only tracking (no partials), you can default to allocate full remaining quantity.

---

## Validation / Constraints

- Tracking number is unique per PO.
- Shipment items must reference line items that belong to the same PO.
- Quantities must be positive integers; received quantity must be >= 0.

---

## Suggested UX States

- **Label created**: tracking exists but not shipped.
- **In transit**: shipped_at set.
- **Delivered**: delivered_at set, optionally set received quantities.
- **Exception**: show alert styling (carrier issues).

---

## Integration Notes

- Use existing PO GET to fetch line items (`GET /api/inventory-purchase-orders/:id` returns `lineItems`).
- Use the shipments list endpoint to populate the Shipments section.
- If you need a "quick add" flow, you can create a shipment with items omitted, then allocate later.
