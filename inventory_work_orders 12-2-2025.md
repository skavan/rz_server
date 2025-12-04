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
| `inventory_action_requests` | Hand-off from an issue to procurement | `issue_id`, `inventory_item_id`, `replacement_sku_id` |
| `inventory_purchase_orders` | Vendor orders bundling many purchase requests | `vendor_id`, `created_by_user_id`, `assigned_to_user_id` |
| `inventory_purchase_order_items` | PO line items pointing back to action requests | `purchase_order_id`, `action_request_id`, `sku_id (copy of replacement_sku_id)` |
| `claim_summaries` (materialized view/report) | Aggregates issues + PRs + POs for insurers | grouped by event/policy |

> Optional: keep a lightweight `issue_events` audit log later; today comments + timestamps cover most needs.

## 3. Issue Enhancements
Add a few columns / metadata fields to `issues` so they can declare intent:
- `resolution_type` enum(`monitor`,`repair`,`replace`,`claim`) – lets ops express their plan.
- `requires_purchase` bool – gate for whether a purchase request should be spawned.
- `action_request_id` nullable FK – once created, keeps navigation easy (issue detail links to the request).
- `estimated_claim_amount`, `insurance_policy_ref`, `insurance_claim_ref` – store insurer-facing context directly on the issue for rollups.

Issues already have:
- `entity_type`, `entity_id` (inventory item, location, etc.).
- Comments/attachments for photos, inspector notes, receipts.
- SSE + auth guardrails.

## 4. inventory_action_requests Data Model (draft)
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
| `total_amount`, `shipping_amount`, `tax_amount`, `duties_amount`, `currency` | financial snapshot |
| `notes`, `metadata` | tracking numbers, shipping accounts, insurer references |

| inventory_purchase_order_items Column | Notes |
| --- | --- |
| `id` PK |
| `purchase_order_id` FK |
| `action_request_id` FK | ensures back-reference to issue context |
| `sku_id` | copies the action request's `replacement_sku_id` at order time |
| `ordered_quantity`, `received_quantity` | partial fulfillment support |
| `unit_price_snapshot`, `extended_price` | locked in at order time (no per-line shipping/tax) |
| `metadata` | lot numbers, shipment splits |

PO-level charges are tracked once on the header (`shipping_amount`, `tax_amount`, `duties_amount`), so line items only manage quantity and unit price snapshots. If procurement needs to note how shipping was allocated, they can capture that in the PO or line `metadata` without extra math.

**State sync:**
- When procurement attaches a PR to a PO, set PR `status='queued_for_po'` and store `queued_for_po_at`.
- PO submission flips the request procurement status to `ordered` and records `ordered_at` + `current_purchase_order_id`.
- Receiving goods updates `received_quantity`; once quantities satisfied, PR status → `fulfilled` and the originating issue can auto-transition to `resolved` (or `closed_pending_install` if onsite work remains).

## 7. Insurance Conversation Support
To answer the insurer’s questions (“23 issues, intent, total claim”):

1. **Evidence** – already in issues via photos/comments. Ensure PR creation copies issue ID so exports can pull the narrative.
2. **Intent** – `intended_action`, `replacement_sku_id`, `requested_quantity`, `repair_vendor_notes` explain whether we’re buying or repairing.
3. **Claim dollars** – `claim_amount`, `shipping_tax_value`, plus PO line pricing snapshots. Actual spend equals `Σ line.extended_price + shipping_amount + tax_amount + duties_amount`, so exports can roll these up by event (`metadata.eventId`) and show totals by replace vs repair.

### Pricing defaults & claim linkage
- The API now derives a `pricingSummary` for every `inventory_action_requests` row (base amount, shipping contribution, and `calculatedTotal`). That summary is returned on all list/detail/create/update/delete responses so the client can show the live estimate without re-implementing math.
- When a request is created or updated **without** an explicit `claim_amount`, the server automatically sets it to the `calculatedTotal` (and flags `is_claim_estimate=true`). Operators can still override the field later; the default only runs when the claim amount is blank.
- Shipping math is normalized server-side: `shipping_charge_type='percent'` applies to the extended unit price (`requested_quantity × unit_price_estimate`), while `fixed` adds a flat dollar value.

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

## 8.1 Manager Playbook (Plain English)

**Field / Property Manager**
- Walks a home, spots a damaged or missing item, and opens an Issue with photos.
- Inside the Issue drawer they choose “Repair” or “Replace” and hit “Request Action.” No extra forms—this auto-creates an inventory action request and sets the Issue’s status so everyone sees it needs procurement help.
- Once they submit, their job is to keep the Issue updated (attach more evidence, mark resident impact, etc.). If ops later fixes it on site, they can cancel the action request straight from the Issue detail.

**Procurement Coordinator**
- Lives in the “Action Requests” queue. Each row shows the Issue context, current SKU, quantity, owner, and the server-calculated estimated total (unit price × qty + shipping).
- Reviews new entries, assigns themselves (or another buyer), and fills in anything the field team skipped: preferred vendor, replacement SKU, ETA, and whether insurance should be billed.
- If multiple requests hit the same vendor, they select them and choose “Create Purchase Order.” That automatically sets each request to “Queued for PO” and stamps the PO ID back onto the cards so the field team can track progress.
- When the vendor confirms, they flip the procurement status to “Ordered,” capture tracking numbers in internal notes, and the system timestamps `ordered_at` for KPI reporting.

### Example Walkthrough: 3 TVs + 1 Mattress
1. **Trigger** – Field teams log four issues (three TVs, one mattress) and click “Request Action.” The server creates four action requests, all in `procurement_status='pending'` with their own estimated totals.
2. **Queue Review** – A procurement coordinator filters the Action Requests list to “Open” and sees:
    - TV #1 (preferred vendor = “Best Buy”) 
    - TV #2 (no vendor hint)
    - TV #3 (preferred vendor = “Amazon”)
    - Mattress (preferred vendor = “MattressCo”)
3. **Batch Selection** – They decide to order all four items from Amazon to save shipping. In the UI, they check all four rows and click **Create Purchase Order**.
4. **PO Form** – A single dialog collects everything:
        - Vendor (dropdown) – they pick **Amazon** (overrides any preferred vendor hints).
        - Ship-to location – choose the warehouse.
        - Per-line overrides – adjust quantity or unit price (each line auto-loads the action request’s replacement SKU and estimated price).
        - Header charges – shipping, tax, duties, internal notes (“Hurricane Delta replacements”), assignment, and optional tags/insurance intent.
        When they confirm, the server in one transaction:
        - Creates the PO header with final totals (lines + shipping + tax + duties) and status `ordered`.
        - Creates four child rows in `inventory_purchase_order_items`, each pointing to the PO and its action request, snapshotting `ordered_quantity`, `unit_price_snapshot`, and `extended_price`.
        - Updates each action request with:
            - `procurement_status = 'ordered'`
            - `queued_for_po_at = ordered_at = now()`
            - `current_purchase_order_id = <new PO id>`
6. **Warehouse Handoff** – Receiving teams now filter the action requests list to “Ordered” and can see all four items share PO #PO-2025-1203-AMZN. When the boxes arrive, they edit each action request (or the PO line) to update `received_quantity`. Once an item is fully received, they set the request to `fulfilled` so the original Issue can be closed.
7. **Insurance / Finance** – Finance downloads the claim summary. Because all four requests now share the same PO, the export shows the estimated claim amount versus the actual PO spend for each line, along with the shared vendor.

**Key callouts for this example**
- `preferred_vendor_id` on action requests is advisory. The PO creator decides the real vendor at step 4.
- All PO line items inherit the same `purchase_order_id`, so reports can trace “which replacements were bundled together.”
- Status changes (`pending → queued_for_po → ordered → fulfilled`) happen automatically when the PO is created, submitted, and received; coordinators only need to confirm shipping/receiving data.

**Receiving / Warehouse**
- Watches the PO detail or the action request list filtered to “Ordered.” When goods arrive, they update “received quantity.” Once the quantity matches what was requested (or the repair ticket comes back completed), they set the action request to “Fulfilled.”
- That fulfillment triggers a notification back to the Issue so the original reporter can close the loop (install the new item, mark the guest impact resolved, etc.).

**Finance / Insurance Lead**
- Opens the built-in “Claim Summary” report, which now pulls from three sources: Issues (evidence), Action Requests (estimated claim amount), and Purchase Order Items (actual spend). They can export a CSV/PDF grouped by disaster event, policy, or home.
- Because the API auto-defaults claim amount to the latest estimated total, finance quickly sees whether a request has a missing number. As soon as PO invoices arrive, they compare “estimated vs actual” to spot overruns before submitting to the carrier.

**Key guardrails**
- Every screen respects tenant + home scope, so managers only see the homes they own.
- SSE `data_change:inventory_action_requests` events power live updates; no need to refresh dashboards.
- If a request is linked to a PO, deletion is blocked (prevents finance mismatches). Cancel instead, which keeps the audit trail but sets status to “Canceled.”
- System refuses to create a new action request if the targeted inventory item already has an active one (prevents duplicate replacements for the same physical asset).

## 9. Integrations & Notifications
- **Comments/Attachments**: reuse issue threads; PRs/POs can embed quick links back to issue discussion.
- **Eventing**: new channels `data_change:action_requests` and `data_change:purchase_orders` so UI + automation stay current.
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