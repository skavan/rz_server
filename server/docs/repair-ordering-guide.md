# Repair Ordering Desk Guide

This document is the sister guide to `procurement-ordering-guide.md`, but focused on repairs. It describes the exact flow using the existing inventory action request + purchase order plumbing. Each step is written in plain English and in technical terms.

Shared Drizzle schema (`@postgress/shared`) remains the source of truth for all tables, enums, and validators referenced below.

## Overview

Plain English
- A repair starts as an issue on an inventory item with recommended action set to repair.
- The issue spawns a repair request (inventory action request) that a back office user reviews.
- The repair request is fulfilled by creating a purchase order with one line per repair request.
- The repair is tracked by repair status, and invoices are attached to the PO.

Technical
- `issues.recommended_action = 'repair'` creates an `inventory_action_requests` row with `action_type = 'repair'`.
- Back office updates `repair_status` and `procurement_status` on the action request.
- A single `inventory_purchase_orders` record can group multiple repair requests; each line item references `action_request_id`.
- Invoices or vendor docs are attached to the PO via `media_assets` (entity_type = `inventory_purchase_order`).

## Example Scenario (Two Arm Chairs, One Vendor)

Plain English
- Two arm chairs in different rooms need reupholstering. Each chair gets an issue marked Repair.
- A repair request is created for each issue.
- The repair desk selects one upholstery vendor and creates one PO with two line items.
- When the vendor completes the work, both requests are marked completed and the issues are closed.

Technical
- Issues: two rows in `issues` with `entity_type = 'inventory_item'`, `recommended_action = 'repair'`.
- Action requests: two rows in `inventory_action_requests` with `issue_id`, `inventory_item_id`, `current_sku_id`, `action_type = 'repair'`, `repair_status = 'pending'`.
- PO: one row in `inventory_purchase_orders` with vendor assigned.
- PO items: two rows in `inventory_purchase_order_items` with `action_request_id` pointing to each repair request and `sku_id = current_sku_id`.
- On completion: update `inventory_action_requests.repair_status = 'completed'`, optionally `issues.status = 'resolved'` and `issues.resolution_type = 'repair'`.

## Stage 1 - Field Signal (Issue -> Repair Request)

Plain English
- Field team logs an issue on the inventory item and selects Repair.
- The system creates a repair request automatically. The field team is done.

Technical
- Create `issues` row with `recommended_action = 'repair'`.
- Create `inventory_action_requests` row with:
  - `issue_id`, `customer_id`, `home_id`, `inventory_item_id`, `current_sku_id`, `product_id`
  - `action_type = 'repair'`
  - `procurement_status = 'pending'`
  - `repair_status = 'pending'` (important: default is `not_applicable` unless explicitly set)
  - `requested_quantity = 1`
  - `field_notes` (optional)
  - `created_by_user_id` set to reporter
- Update the issue with `requires_purchase = true` and `action_request_id`.

## Stage 2 - Repair Desk (Review + Assign Vendor)

Plain English
- Back office opens the repair queue, assigns an owner, picks a vendor, and captures a repair estimate.

Technical
- Update `inventory_action_requests` with:
  - `assigned_to_user_id`
  - `preferred_vendor_id`
  - `unit_price_estimate` (from `issues.repair_price` or `skus.est_repair_price`)
  - `internal_notes` / `vendor_notes`
  - `repair_status = 'awaiting_vendor'` or `in_service` when work begins
- Optionally set `claim_amount` or rely on server defaulting to `calculatedTotal`.

## Stage 3 - Repair Purchase Order (Batching)

Plain English
- Select multiple repair requests and create a single PO with one line per repair. That is the repair order.

Technical
- Create `inventory_purchase_orders` header with vendor, assignee, totals, and status (`draft` or `pending_vendor`).
- For each repair request, create `inventory_purchase_order_items` with:
  - `purchase_order_id`
  - `action_request_id`
  - `sku_id = current_sku_id` (use the inventory item SKU; no repair SKU required)
  - `description` = repair summary (e.g., "Reupholstery - Arm Chair - Living Room")
  - `ordered_quantity = 1`
  - `unit_price_snapshot` / `extended_price`
- Update each action request with `current_purchase_order_id`, `queued_for_po_at`, and `procurement_status = 'ordered'`.

## Stage 4 - Completion + Invoices

Plain English
- When the vendor finishes, mark the repair as completed and attach the invoice to the PO.

Technical
- Update `inventory_action_requests`:
  - `repair_status = 'completed'`
  - `fulfilled_at` and `last_workflow_touched_at`
- Optionally update `issues`:
  - `status = 'resolved'`
  - `resolution_type = 'repair'`
- Attach invoices via `media_assets` with `entity_type = 'inventory_purchase_order'`.

## Notes on SKUs for Repairs

Plain English
- You do not need a new SKU for the repair. Use the existing inventory item SKU and a good description.

Technical
- Set `inventory_purchase_order_items.sku_id = inventory_action_requests.current_sku_id`.
- If you later need service cataloging, introduce service SKUs and store the original SKU in `parent_sku_id` or `metadata`.

## Status Cheat Sheet

Plain English
- Procurement status tracks ordering. Repair status tracks the repair lifecycle.

Technical
- `procurement_status` enum: pending -> in_review -> ready_for_order -> queued_for_po -> ordered -> fulfilled/canceled
- `repair_status` enum: not_applicable -> pending -> awaiting_vendor -> in_service -> completed/canceled
- For repairs, set both: procurement to manage ordering, repair status to manage work.

## API Touchpoints

Plain English
- Use the same endpoints as purchasing.

Technical
- `POST /api/issues` (create issue with `recommended_action = 'repair'`)
- `POST /api/inventory-action-requests` (create request with `action_type = 'repair'` and `repair_status = 'pending'`)
- `POST /api/inventory-purchase-orders/composite` (create PO + line items)
- `PUT /api/inventory-action-requests/:id` (update repair status and workflow)

## Developer Checklist

Plain English
- Make sure repair requests show in the action request queue and can be batched into a PO.

Technical
1. Set `action_type = 'repair'` and explicitly set `repair_status = 'pending'` on create.
2. Ensure the repair queue uses `repair_status` filters and shows `action_type`.
3. Create a PO with one line per repair request and link via `action_request_id`.
4. Attach invoices to the PO via `media_assets`.
5. On completion, set `repair_status = 'completed'` and close the issue.
