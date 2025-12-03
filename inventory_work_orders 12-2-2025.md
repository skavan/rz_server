# Issues → Purchase Requests → Purchase Orders (Dec 2, 2025)

We decided to treat existing **issues** as the authoritative “work order” surface. Each issue represents a damaged / missing / repair-needed inventory item, already carrying comments, attachments, and RLS. On top of that, we introduce **purchase requests** (PRs) and **purchase orders** (POs) so ops and procurement can collaborate without duplicating data.

## 1. Objectives
- Keep issue tracking simple: users log the problem, attach photos/text, and decide whether to repair, replace, or claim.
- Provide a procurement bridge that can batch many approved issues into consolidated purchase orders.
- Produce insurer-ready rollups: “here are the 23 affected items, here is what we will replace/repair, here is the dollars requested.”

## 2. Entities Overview
| Entity | Purpose | Key Links |
| --- | --- | --- |
| `issues` (existing) | Source of truth for damaged inventory | `entity_type='inventory_item'`, `entity_id` |
| `inventory_purchase_requests` | Hand-off from an issue to procurement | `issue_id`, `inventory_item_id`, `replacement_sku_id` |
| `inventory_purchase_orders` | Vendor orders bundling many purchase requests | `vendor_id`, `created_by_user_id`, `assigned_to_user_id` |
| `inventory_purchase_order_items` | PO line items pointing back to purchase requests | `purchase_order_id`, `purchase_request_id`, `sku_id` |
| `claim_summaries` (materialized view/report) | Aggregates issues + PRs + POs for insurers | grouped by event/policy |

> Optional: keep a lightweight `issue_events` audit log later; today comments + timestamps cover most needs.

## 3. Issue Enhancements
Add a few columns / metadata fields to `issues` so they can declare intent:
- `resolution_type` enum(`monitor`,`repair`,`replace`,`claim`) – lets ops express their plan.
- `requires_purchase` bool – gate for whether a purchase request should be spawned.
- `purchase_request_id` nullable FK – once created, keeps navigation easy (issue detail links to PR).
- `estimated_claim_amount`, `insurance_policy_ref`, `insurance_claim_ref` – store insurer-facing context directly on the issue for rollups.

Issues already have:
- `entity_type`, `entity_id` (inventory item, location, etc.).
- Comments/attachments for photos, inspector notes, receipts.
- SSE + auth guardrails.

## 4. inventory_purchase_requests Data Model (draft)
| Column | Notes |
| --- | --- |
| `id` PK | |
| `customer_id` | tenant scope |
| `issue_id` FK issues | single source item |
| `inventory_item_id` FK inventory_items | enforce per-item granularity |
| `home_id`, `product_id`, `sku_id` | denormalized snapshot for fast filters |
| `replacement_sku_id` | defaults to current SKU but editable |
| `requested_quantity` | typically 1, but allows multiples for kits | 
| `intended_action` enum(`repair`,`replace`,`bulk_claim`) | mirrors insurance conversation |
| `requires_approval` bool + `is_approved`, `approved_by_user_id`, `approved_at` | replicates issue-level approvals but scoped to procurement |
| `claim_amount` numeric + `is_amount_estimate` bool | per-request cost basis |
| `shipping_tax_type` enum(`percent`,`fixed`) + `shipping_tax_value` | extra costs |
| `lead_time_weeks`, `shipping_time_weeks`, `eta_date` | logistics planning |
| `vendor_preference` FK vendors nullable + `vendor_notes` text | allow ops to suggest vendor |
| `status` enum (`draft`,`pending`,`requires_approval`,`approved`,`queued_for_po`,`ordered`,`fulfilled`,`canceled`) | PR lifecycle |
| `queued_for_po_at`, `ordered_at`, `fulfilled_at`, `canceled_at` | milestone timestamps |
| `created_by_user_id`, `assigned_to_user_id` | accountability |
| `metadata` jsonb | insurer references, disaster event ID, adjuster notes |

## 5. Purchase Request Workflow
```
issue -> purchase request draft -> pending -> requires_approval -> approved -> queued_for_po -> ordered -> fulfilled
                    |                   |                     |                        |
                    +-> canceled <------+---------------------+------------------------+
```
- Issue detail page shows “Create Purchase Request” button when `requires_purchase=true`.
- Created PR inherits all issue context (photos, description, location) so procurement sees the full story.
- Approval step enforces manager sign-off before procurement spends money.
- Once `status='approved'`, PRs appear in the procurement queue ready to be batched into POs.

## 6. Purchase Orders & Line Items
| inventory_purchase_orders Column | Notes |
| --- | --- |
| `id`, `customer_id` | |
| `vendor_id` FK vendors nullable | or ad-hoc vendor fields in metadata |
| `purchase_number` | human-readable PO ID |
| `status` enum(`draft`,`pending_vendor`,`ordered`,`receiving`,`closed`,`canceled`) | procurement lifecycle |
| `created_by_user_id`, `assigned_to_user_id` | procurement ownership |
| `submitted_at`, `acknowledged_at`, `closed_at` | timeline |
| `total_amount`, `shipping_amount`, `tax_amount`, `currency` | financial snapshot |
| `notes`, `metadata` | tracking numbers, shipping accounts, insurer references |

| inventory_purchase_order_items Column | Notes |
| --- | --- |
| `id` PK |
| `purchase_order_id` FK |
| `purchase_request_id` FK | ensures back-reference to issue context |
| `sku_id`, `replacement_sku_id` | redundancy for reports |
| `ordered_quantity`, `received_quantity` | partial fulfillment support |
| `unit_price_snapshot`, `extended_price` | locked in at order time |
| `metadata` | lot numbers, shipment splits |

**State sync:**
- When procurement attaches a PR to a PO, set PR `status='queued_for_po'` and store `queued_for_po_at`.
- PO submission flips PR status to `ordered` and records `ordered_at` + `purchase_order_id`.
- Receiving goods updates `received_quantity`; once quantities satisfied, PR status → `fulfilled` and the originating issue can auto-transition to `resolved` (or `closed_pending_install` if onsite work remains).

## 7. Insurance Conversation Support
To answer the insurer’s questions (“23 issues, intent, total claim”):

1. **Evidence** – already in issues via photos/comments. Ensure PR creation copies issue ID so exports can pull the narrative.
2. **Intent** – `intended_action`, `replacement_sku_id`, `requested_quantity`, `repair_vendor_notes` explain whether we’re buying or repairing.
3. **Claim dollars** – `claim_amount`, `shipping_tax_value`, plus per-line pricing captured on PO items. Exports can roll these up by event (`metadata.eventId`) and show totals by replace vs repair.

We can generate a `claim_summaries` materialized view:
| Field | Source |
| --- | --- |
| `event_id` | PR.metadata or issue metadata |
| `issue_count` | count(distinct issue_id) |
| `items` | JSON aggregate listing SKU, room, photos |
| `planned_spend` | sum(PR.claim_amount + extras) |
| `actual_spend` | sum(PO line extended_price) |
| `repair_vs_replace_breakdown` | pivot on `intended_action` |

That report gives insurers the narrative (“we have 23 damaged items with evidence”), the plan (“we will buy X and repair Y”), and the dollar value.

## 8. UI Considerations
- Issue detail: show PR status, linked PO, and claim summary chips (“Claim $1,250 – awaiting PO”).
- Purchase request form: prefill SKU price, allow toggling “estimate vs firm,” capture shipping % or dollar.
- Procurement queue: filter by vendor preference, disaster event, urgency.
- Insurance export screen: select event/policy, download CSV/PDF with issue photos + cost breakdown.

## 9. Integrations & Notifications
- **Comments/Attachments**: reuse issue threads; PRs/POs can embed quick links back to issue discussion.
- **Eventing**: new channels `data_change:purchase_requests` and `data_change:purchase_orders` so UI + automation stay current.
- **Approvals**: when PR status enters `requires_approval`, notify managers; when PO ordered, ping originating issue owners.

## 10. Security & RLS
- Issues already scoped by `customer_id` and optional home filters—re-use same scope for purchase requests (FK ensures enforcement).
- Procurement users need access to all PRs/POs for the tenant; we can layer role-based checks (e.g., `role in ('admin','manager','procurement')`).
- Insurance exports only available to roles with `claims_export` permission.

## 11. Reporting & KPIs
- Count of issues that converted to PRs, grouped by disaster event.
- PR approval turnaround (`approved_at - created_at`).
- Procurement throughput (`ordered_at - approved_at`).
- Repair vs replace ratio per home or vendor.
- Claim estimate vs actual delta once PO invoices arrive.

## 12. Open Questions
1. Do we need hierarchical disaster tracking (`event_id` + `sub_event_id`)?
2. Should repairs that don’t require purchasing still create a PR for scheduling purposes, or remain issue-only?
3. Is PO creation manual only, or do we auto-suggest bundles by vendor/SKU?
4. How do we expose insurer conversations back to issues (e.g., adjuster comments) – via comments or dedicated metadata?
5. Do we need a “claim submission” artifact once we send the insurer the summary, to track statuses like `submitted`, `approved`, `paid`?

---
_Last updated: 2025-12-02_