# Procurement & Ordering Desk Guide

This document is the hand-off for client developers who need to surface the new replacement workflow. Shared Drizzle schema (`@skavan/rentalzen-drizzle`) is the source of truth for all tables, enums, and validators referenced below.

## Overview

The experience is intentionally split into two lightweight stages:

1. **Field Signal (Issue Form)** – a field manager flags that something must be replaced or repaired. The system instantly creates a minimal `inventory_action_requests` row and links it to the issue. No extra form is required.
2. **Ordering Desk** – back office reviews pending requests, assigns ownership, chooses the actual SKU/vendor, and optionally batches multiple requests into a purchase order. This is identical to the BOM editor UX: list on the left, detail drawer on the right, and a toolbar action to create/append a PO.

Repairs share the same plumbing: set `action_type = 'repair'` and skip any purchasing-only sections.

---

## Stage 1 – Field Signal

**Trigger:** Issue form already has `recommended_action`. When the user sets it to `replace` or `repair` and taps “Request Replacement/Repair,” we automatically:

- Create an action request with:
  - `customer_id`, `issue_id`, `home_id`, `inventory_item_id`, `product_id`, `current_sku_id`
  - `action_type` derived from the issue (replace vs repair)
  - `procurement_status = 'pending'`
  - `requested_quantity = 1` (editable later)
  - `field_notes` (optional textarea from issue modal)
  - `created_by_user_id` set to the reporter
- Update the issue with `requires_purchase = true`, `action_request_id`, and leave `resolution_type`/insurance fields for downstream reporting.

**UI expectations:**

```
Card inside Issue detail
  Status: Pending
  SKU: TCL 55" TV (auto from inventory item)
  Notes: __________________________________
  [Edit Request]  [Dismiss]
```

The field manager can ignore “Edit Request.” Their job is done.

---

## Stage 2 – Ordering Desk

### Queue Columns

| Column | Description |
| --- | --- |
| Checkbox | multi-select for PO batching |
| Issue / Location | quick context (home + room) |
| Requested Qty | from auto-create or edited value |
| Current SKU | prefilled from inventory |
| Procurement Status | pending → in_review → ready_for_order → queued_for_po → ordered → fulfilled/canceled |
| Repair Status | not_applicable → pending → awaiting_vendor → in_service → completed/canceled |
| Owner | shows unassigned badge to prompt assignment |
| Action Type | replace / repair / claim |
| Age | SLA metric |

### Detail Drawer Layout

```
Header
  Issue summary + status pill
  Purchase Order badge (if already linked)
  CTA buttons: [Save], [Queue for PO], [Cancel Request]

Section 1 – Basics (always expanded)
  Owner (assigned_to_user_id)
  Requested Quantity
  Action Type chips (Replace | Repair | Claim)
  Field Notes (read-only)
  Internal Notes (textarea)
  Insurance toggle → Policy Ref / Claim Ref inputs

Section 2 – Catalog & Pricing (collapsible)
  Current SKU (read-only)
  Replacement SKU picker (defaults to current; allows overriding to Hisense etc.)
  Unit Price Estimate
  Claim Amount + “Estimate” checkbox (maps to `is_claim_estimate`)

Section 3 – Vendor & Logistics (collapsible)
  Preferred Vendor dropdown
  Vendor Notes
  Shipping/Customs markup chip (defaults from settings, overrides `shipping_charge_type/value`)
  Lead Time (days) + Shipping Time (days)
  ETA date picker

Section 4 – Approvals & Decisions (collapsible)
  Decision Maker (decision_by_user_id)
  Decision Timestamp (auto stamp when status moves to `ready_for_order`)
  Insurance Claim toggle (sets `is_insurance_claim`)
  Workflow touch timestamp (auto maintains `last_workflow_touched_at`)

Footer Actions
  [Save]
  [Add to Selection] (check row in queue)
  [Create Purchase Order] (opens PO wizard with selected rows)
```

### Purchase Order Wizard

1. **Select requests** – all checked rows appear with SKU, qty, vendor preference.
2. **PO header** – enter `purchase_number`, confirm vendor, assign ordering owner, add notes.
3. **Line items** – auto-generated from each request. Editable description, quantity, unit price snapshot, extended price.
4. **Submit** – sets PO status to `pending_vendor`, populates `submitted_at`, and back-links each request (`current_purchase_order_id`, `queued_for_po_at`).

Statuses then progress: Pending → In Review → Ready for Order → (Queued for PO) → Ordered → Fulfilled/Canceled. Use the schema enums directly so both UI and backend stay aligned.

### Insurance Flags

The ordering desk should set:
- `is_insurance_claim` toggle.
- `claim_amount` and `is_claim_estimate`.
- Issue-level `insurance_policy_ref` / `insurance_claim_ref` if provided by the field team.

These values drive downstream reporting and reimbursement workflows.

---

## Key Fields by Stage

| Field | Stage | Notes |
| --- | --- | --- |
| `action_type` | Auto (field) | Derived from issue recommended action; user can flip in drawer |
| `procurement_status` | Ordering desk | Use enum transitions; UI should gate actions based on state |
| `repair_status` | Ordering desk (repairs) | Track repair-specific lifecycle independently |
| `requested_quantity` | Field default 1, editable in drawer |
| `field_notes` | Field optional text from issue modal |
| `internal_notes` | Ordering desk only |
| `current_sku_id` | Auto from inventory item |
| `replacement_sku_id` | Ordering desk selects alternate SKU |
| `preferred_vendor_id` | Ordering desk chooses vendor |
| `unit_price_estimate`, `shipping_charge_*`, `lead_time_days`, `shipping_time_days`, `eta_date` | Ordering desk when planning order |
| `is_insurance_claim`, `claim_amount`, `is_claim_estimate` | Ordering desk toggles |
| `decision_by_user_id`, `decision_made_at` | auto-populated when user marks `ready_for_order` |
| `current_purchase_order_id`, `queued_for_po_at`, `ordered_at`, `fulfilled_at`, `canceled_at`, `last_workflow_touched_at` | Managed automatically when building/running downstream workflows |

Repairs follow the same data path but can skip catalog/logistics sections entirely. Keep that in mind for conditional UI (hide shipping markup, vendor, etc., when `action_type = 'repair'`).

---

## Developer Checklist

1. **Reinstall `@skavan/rentalzen-drizzle`** in the client repo so the new enums (`inventory_action_type`, `inventory_action_procurement_status`, `inventory_action_repair_status`, `shipping_charge_type`) and tables are available.
2. **Use the provided Zod schemas** (`inventoryActionRequestsValidationSchema`, etc.) for form validation; they already coerce booleans/ints.
3. **Surface the queue + drawer UI** using the field map above. Remember the experience mirrors the BOM editor, so you can reuse components.
4. **Batch actions** should update `current_purchase_order_id` and timestamps exactly as the backend expects; use existing APIs or wire new ones accordingly.
5. **Testing** – create sample issues, flip recommended action to replace, ensure the action request auto-appears, adjust in ordering desk, then generate a PO to confirm links.

When in doubt, inspect `drizzle/shared/src/schema.ts` or the migration `0016_inventory_action_requests.sql` for the authoritative definition of every column.
