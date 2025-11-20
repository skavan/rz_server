# Issues Schema Field Decisions

## Context
We introduced the `issues` feature to capture operational and cosmetic problems that arise across homes, locations, inventory, products, and SKUs. The schema balances auditability, assignment workflows, and compatibility with existing tagging and media systems. This note records why each column exists so we can keep backend, tooling, and future frontend work aligned.

## Field Rationale
- `id` *(serial primary key)* keeps inserts simple while other identifiers remain implicit (home/entity references). We expect low contention and rely on database sequencing for ordering.
- `customer_id` ensures strict multi-tenant separation. All queries, policies, and RLS rules pivot on this value.
- `home_id` captures the root home context even when an issue is scoped to a more granular entity. It powers dashboards grouped by property and allows filtering without extra joins.
- `entity_type` and `entity_id` pair to reference the specific record (inventory item, location, home, product, or SKU). Storing both allows us to preserve historical links even if the target entity is deleted and keeps the API flexible while we evaluate polymorphic foreign keys.
- `status` tracks lifecycle transitions (`open → in_progress → resolved/dismissed`) and drives automation plus SSE notifications.
- `urgency` flags items needing faster attention without overloading `status`. It is a compact enum so clients can surface badges and sort quickly.
- `issue_type` describes the classification (operational, cosmetic, safety, supplies) for reporting and eventual SLA logic.
- `description` is the human-readable problem statement. We store it as `text` to allow long-form context from field staff.
- `recommended_action` offers structured guidance (`repair`, `replace`, `inspect`, `none`). Having an enum keeps downstream automation predictable.
- `reported_by_user_id` and `reported_at` provide auditing: who flagged the issue and when. `reported_at` defaults to `now()` so API callers do not need to supply it for real-time reports.
- `assigned_to_user_id` captures the current owner of the work. We keep it nullable to support unassigned queues.
- `due_at` lets teams set service-level expectations without creating a separate scheduling table.
- `resolved_by_user_id`, `resolved_at`, and `resolution_note` record completion details for accountability and retrospective analysis.
- `tags` is an `integer[]` mirroring the tagging strategy we already use for products, SKUs, locations, and inventory. This keeps the API consistent, allows flexible categorisation, and works with existing GIN index conventions.
- `created_at` and `updated_at` support chronological sorting, synchronization, and optimistic cache invalidation. We rely on database defaults to avoid clock skew from clients.

## Indexing Decisions
- `idx_issues_customer` underpins tenant-wide filtering and RLS policies.
- `idx_issues_home` speeds dashboards scoped by home and powers common joins to home metadata.
- `idx_issues_entity` optimises lookups when resolving back to the originating entity.
- `idx_issues_status`, `idx_issues_urgency`, and `idx_issues_assignee` enable queue views (e.g., "all open issues assigned to me").

## Operational Notes
- Tags integrate with the existing tag registry; we intentionally store raw `integer` IDs so server routes can coerce string/number input and reuse shared validation helpers.
- Event broadcasting relies on these columns to determine channel scope (customer/home) and payload shape, so schema changes should be coordinated with the SSE layer.
- Future migrations (e.g., adding GIN indexes to `tags`) can reuse patterns from products/locations to maintain query performance as issue volume grows.
