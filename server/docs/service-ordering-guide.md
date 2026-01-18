# Service Ordering Desk Guide

This document is the sister guide to `procurement-ordering-guide.md`, focused on service work (non-product fulfillment). Each step is written in plain English and in technical terms.

Shared Drizzle schema (`@postgress/shared`) remains the source of truth for all tables, enums, and validators referenced below.

## Overview

Plain English
- A service request starts as a home or location issue (not a specific inventory item).
- The issue can include an optional list of inventory items that are in scope.
- The service desk creates a service action request and assigns a vendor.
- The service is fulfilled using the existing purchase order flow, with service line items.
- Media is attached both to the issue (evidence) and the PO (deliverables/invoices).

Technical
- `issues.entity_type = 'home' | 'location'` with `inventory_item_ids` (int[]) to capture scope.
- `inventory_action_requests.action_type = 'service'`, `inventory_item_id = null`, `repair_status = 'not_applicable'`.
- `inventory_purchase_orders` + `inventory_purchase_order_items` handle service ordering; line items can have `sku_id = null` and a descriptive `description`.
- `media_assets` attaches evidence to the issue and deliverables to the PO.

## Example Scenarios

Example A - Post-hurricane video capture
Plain English
- Create a home-level issue for storm documentation.
- Service desk creates a service action request and assigns a media vendor.
- Create a PO with one service line item for the deliverable.

Technical
- Issue: `entity_type = 'home'`, description = "Post-hurricane video walkthrough".
- Action request: `action_type = 'service'`, `procurement_status = 'pending'`, `inventory_item_id = null`.
- PO item: `sku_id = null`, `description = "Video walkthrough - 123 Main St"`.

Example B - Service all AC units
Plain English
- Create a home-level issue and list the AC inventory items in scope.
- Service desk creates a single service request and one PO line covering all units.

Technical
- Issue: `entity_type = 'home'`, `inventory_item_ids = [101, 115, 132]`.
- Action request: `action_type = 'service'`, copy the list into `action_context.inventoryItemIds`.
- PO item: `description = "Service all AC units (3)"`, `ordered_quantity = 1` or `3` per vendor quote.

## Proposed Data Additions

Plain English
- Add an optional array of inventory items on issues so a service request can name its scope.

Technical
- Add `issues.inventory_item_ids` as `int[]` (nullable).
- Add `service` to `inventory_action_type` enum and validators.
- Optional: add `service` to `issue_recommended_action` or keep `recommended_action = 'inspect'` with a "Request Service" action.

## Stage 1 - Field Signal (Issue Creation)

Plain English
- A field user creates an issue at the home or location level.
- They can optionally select multiple inventory items covered by the service.

Technical
- Create `issues` row with:
  - `entity_type = 'home' | 'location'`, `entity_id` set accordingly
  - `inventory_item_ids` (optional int[])
  - `recommended_action = 'inspect'` (or `'service'` if added)
- Validation: every `inventory_item_id` must belong to the same home as the issue.

## Stage 2 - Service Desk (Action Request)

Plain English
- The service desk converts the issue into a service request, assigns a vendor, and captures estimates.

Technical
- Create `inventory_action_requests` row with:
  - `issue_id`, `customer_id`, `home_id`
  - `action_type = 'service'`
  - `procurement_status = 'pending'`
  - `repair_status = 'not_applicable'`
  - `preferred_vendor_id`, `unit_price_estimate`, `internal_notes`, `vendor_notes`
  - `action_context.inventoryItemIds = issues.inventory_item_ids` (copy for convenience)
- Update issue with `requires_purchase = true` and `action_request_id`.

## Stage 3 - Service Purchase Order (Batching)

Plain English
- Select one or more service requests and create a PO with service line items.

Technical
- Create `inventory_purchase_orders` header (vendor, assignee, totals, status).
- Create `inventory_purchase_order_items` with:
  - `action_request_id`
  - `sku_id = null` (unless you add service SKUs)
  - `description` = service summary
  - `ordered_quantity` and `unit_price_snapshot`
- Update each action request with `current_purchase_order_id`, `queued_for_po_at`, and `procurement_status = 'ordered'`.

## Central Purchasing Location (Billing vs Service Site)

Plain English
- The service happens at the home, but billing can be routed to a central purchasing location.

Technical
- Store `bill_to_location_id` (or similar) in `inventory_purchase_orders.metadata` until you add a first-class column.
- Keep the service site on the issue (`entity_type` + `entity_id`) and on the action request (`home_id`).

## Stage 4 - Completion + Media

Plain English
- When the service is complete, close the request and attach media to both the issue and the PO.

Technical
- Update `inventory_action_requests`:
  - `procurement_status = 'fulfilled'`
  - `fulfilled_at`, `last_workflow_touched_at`
- Optionally update `issues`:
  - `status = 'resolved'`, `resolution_type = 'monitor'` or a new `service` value if added
- Media:
  - Evidence goes on `media_assets` with `entity_type = 'issue'`.
  - Deliverables/invoices go on `media_assets` with `entity_type = 'inventory_purchase_order'`.

## Status Cheat Sheet

Plain English
- Procurement status tracks ordering. Repair status is not used for service.

Technical
- `procurement_status`: pending -> in_review -> ready_for_order -> queued_for_po -> ordered -> fulfilled/canceled
- `repair_status`: set to `not_applicable` for service requests

## API Touchpoints

Plain English
- Use the same endpoints as purchasing.

Technical
- `POST /api/issues` (home/location issue with optional `inventory_item_ids`)
- `POST /api/inventory-action-requests` (action_type = service)
- `POST /api/inventory-purchase-orders/composite` (PO + service line items)
- `PUT /api/inventory-action-requests/:id` (status updates)
- `POST /api/media` (attach evidence to issue and deliverables to PO)

## Developer Checklist

Plain English
- Make service requests easy to create, batch, and close.

Technical
1. Add `issues.inventory_item_ids` (int[]) and validate item-home alignment.
2. Add `service` to `inventory_action_type` enum + validators + routes.
3. When creating service action requests, copy `inventory_item_ids` into `action_context`.
4. Allow PO line items with `sku_id = null` and descriptive service text.
5. Attach media to both the issue (evidence) and PO (deliverables).
