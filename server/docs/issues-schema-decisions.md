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
- `has_visible_damage` gives insurance teams an explicit yes/no signal for photo-auditable damage. It defaults to `false` so callers only opt-in when visibility is confirmed.
- `damage_assessment` captures the severity bucket (`none`, `minor`, `major`) to support triage, insurance reporting, and trend analysis without parsing free-form descriptions.
- `reported_by_user_id` and `reported_at` provide auditing: who flagged the issue and when. `reported_at` defaults to `now()` so API callers do not need to supply it for real-time reports.
- `assigned_to_user_id` captures the current owner of the work. We keep it nullable to support unassigned queues.
- `due_at` lets teams set service-level expectations without creating a separate scheduling table.
- `resolved_by_user_id`, `resolved_at`, and `resolution_note` record completion details for accountability and retrospective analysis.
- `tags` is an `integer[]` mirroring the tagging strategy we already use for products, SKUs, locations, and inventory. This keeps the API consistent, allows flexible categorisation, and works with existing GIN index conventions.
- `created_at` and `updated_at` support chronological sorting, synchronization, and optimistic cache invalidation. We rely on database defaults to avoid clock skew from clients.

## Column Reference

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `serial` | sequence | Primary key |
| `customer_id` | `integer` | — | Tenant scope, `NOT NULL`, FK → `customers.id` |
| `home_id` | `integer` | — | Optional FK → `homes.id` (cascade set null) |
| `entity_type` | `varchar(30)` | — | Enum-like string (`inventory_item`, `location`, `home`, `product`, `sku`) |
| `entity_id` | `integer` | — | ID of linked entity, `NOT NULL` |
| `status` | `issue_status` enum | `'open'` | Lifecycle state |
| `urgency` | `issue_urgency` enum | `'normal'` | Queue prioritization |
| `issue_type` | `issue_type` enum | `'operational'` | Classification bucket |
| `description` | `text` | — | Required narrative |
| `recommended_action` | `issue_recommended_action` enum | `'none'` | Suggested remediation |
| `has_visible_damage` | `boolean` | `false` | Non-null flag for visible damage |
| `damage_assessment` | `issue_damage_assessment` enum | `'none'` | Severity bucket |
| `reported_by_user_id` | `integer` | — | Optional FK → `users.id` |
| `reported_at` | `timestamptz` | `now()` | Capture timestamp |
| `assigned_to_user_id` | `integer` | — | Optional FK → `users.id` |
| `due_at` | `timestamptz` | — | Optional deadline |
| `resolved_by_user_id` | `integer` | — | Optional FK → `users.id` |
| `resolved_at` | `timestamptz` | — | Completion timestamp |
| `resolution_note` | `text` | — | Optional resolution summary |
| `tags` | `integer[]` | — | Optional tag ids |
| `created_at` | `timestamptz` | `now()` | Inserted timestamp |
| `updated_at` | `timestamptz` | `now()` | Updated via triggers/app code |

## Enum Constants

To avoid guesswork when wiring clients and tests, here are the canonical enum literals defined in the shared schema (`issue_status`, `issue_urgency`, `issue_type`, `issue_recommended_action`):

- `issue_status`: `open`, `in_progress`, `resolved`, `dismissed`
- `issue_urgency`: `normal`, `high`
- `issue_type`: `operational`, `cosmetic`, `safety`, `supplies`
- `issue_recommended_action`: `none`, `repair`, `replace`, `inspect`
- `issue_damage_assessment`: `none`, `minor`, `major`

These map 1:1 to the Postgres enums created by Drizzle migrations and the matching Zod validators. Any new value must be added to the enum definition in `drizzle/shared/src/schema.ts`, regenerated via `npx drizzle-kit generate`, and then propagated through the API/docs before use.

## TypeScript Types

```ts
import type { Issue, NewIssue } from '@postgress/shared';

// Issue = typeof issues.$inferSelect;
// NewIssue = typeof issues.$inferInsert;
```

The `Issue` alias represents rows returned from the database (snake_case columns, enum literals, `Date` objects). `NewIssue` matches insert payloads where defaults may be omitted.

## Zod Validator

```ts
import { issuesValidationSchema } from '@postgress/shared/zod';

export const issuesValidationSchema = createValidationSchema(
	issues,
	refineDateFields('reportedAt', 'dueAt', 'resolvedAt', 'createdAt', 'updatedAt')
).extend({
	status: z.enum(['open', 'in_progress', 'resolved', 'dismissed']).default('open'),
	urgency: z.enum(['normal', 'high']).default('normal'),
	issueType: z.enum(['operational', 'cosmetic', 'safety', 'supplies']).default('operational'),
	recommendedAction: z.enum(['none', 'repair', 'replace', 'inspect']).default('none'),
	hasVisibleDamage: z.boolean().default(false),
	damageAssessment: z.enum(['none', 'minor', 'major']).default('none'),
	tags: z
		.array(z.union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)]))
		.nullable()
		.optional()
		.transform((value) => {
			if (value === undefined) return value;
			if (value === null) return null;
			return value.map((item) => (typeof item === 'string' ? Number(item) : item));
		}),
});
```

This schema handles enum coercion, optional tag arrays (accepting either numbers or numeric strings), and normalises date fields via the shared `refineDateFields` helper.

## API Considerations

- `POST /issues` accepts `hasVisibleDamage` and `damageAssessment` in either camelCase or snake_case. If omitted they resolve to `false`/`none`, aligning with database defaults.
- `PUT /issues/:id` allows partial updates for the new fields. Boolean `null` inputs are rejected so we always store an explicit `true`/`false`.
- `GET /issues` now supports filtering with `hasVisibleDamage`/`has_visible_damage` as well as `damageAssessment`/`damage_assessment` to keep query ergonomics flexible for clients.
- Downstream SSE payloads include the new columns unchanged; consumers should plan to surface them where relevant (triage dashboards, insurance exports).

## Migration Notes

- Migration `0012_windy_crusher_hogan.sql` introduces `issue_damage_assessment`, adds the new columns with defaults, and should be applied to all environments.
- Because the boolean column is non-nullable with a `false` default, no data backfill is required for existing issues.

## Indexing Decisions
- `idx_issues_customer` underpins tenant-wide filtering and RLS policies.
- `idx_issues_home` speeds dashboards scoped by home and powers common joins to home metadata.
- `idx_issues_entity` optimises lookups when resolving back to the originating entity.
- `idx_issues_status`, `idx_issues_urgency`, and `idx_issues_assignee` enable queue views (e.g., "all open issues assigned to me").

## Operational Notes
- Tags integrate with the existing tag registry; we intentionally store raw `integer` IDs so server routes can coerce string/number input and reuse shared validation helpers.
- Event broadcasting relies on these columns to determine channel scope (customer/home) and payload shape, so schema changes should be coordinated with the SSE layer.
- Future migrations (e.g., adding GIN indexes to `tags`) can reuse patterns from products/locations to maintain query performance as issue volume grows.
