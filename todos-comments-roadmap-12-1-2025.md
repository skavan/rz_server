# Todos + Comments Roadmap (Dec 1, 2025)

## 1. Objectives
- Introduce first-class **todos** so operational work (repairs, inspections, onboarding tasks) can be tracked alongside existing issues/inventory data.
- Consolidate narrative updates into a single **comments** system with per-entity threading, paving the way for email ingress/egress and audit trails.
- Preserve strict tenant scoping (customer/home) and realtime change propagation via the existing SSE bus.

## 2. Scope & Non-Goals
- **In scope:** schema design, API surface, eventing, migration plan, and high-level UI integration notes.
- **Out of scope (for this phase):** UI implementation, scheduling/automation engines, external email gateway wiring (only scaffolding for it), analytics dashboards.

## 3. Data Model Overview
| Entity | Purpose | Key Links |
| --- | --- | --- |
| `todos` | Work items tied to homes, locations, issues, bookings, etc. | `home_id`, `location_id`, `issue_id`, `entity_links` JSON for arbitrary associations |
| `comments` | Shared discussion/event feed for any entity | `entity_type`, `entity_id`, optional threading via `parent_comment_id` |

### 3.1 Todos Table Sketch
```
id PK
customer_id FK tenants
home_id FK homes nullable
location_id FK locations nullable
issue_id FK issues nullable
entity_links JSONB [{ type, id }]
title text
summary text
status enum(open,in_progress,blocked,done,canceled)
priority enum(low,medium,high,urgent)
type enum(maintenance,repair,inspection,project,...)
category text
due_at timestamptz
completed_at timestamptz
blocked_reason text
risk_level enum(low,medium,high)
author_user_id FK users
assignee_user_id FK users
watcher_ids int[]
visibility enum(tenant,home,private)
source enum(manual,issue,automation,email)
auto_generated bool default false
reminder_at timestamptz
escalate_after timestamptz
completion_summary text
metadata JSONB
created_at, updated_at, deleted_at
updated_by_user_id FK users
```

### 3.2 Comments Table Sketch
```
id PK
customer_id FK
entity_type text (validated against whitelist)
entity_id bigint
parent_comment_id FK comments nullable
comment_type enum(user,system,email_inbound,email_outbound,note)
author_user_id FK users nullable
actor_email text nullable (for inbound email)
visibility enum(tenant,internal,external)
body jsonb (rich text blocks)
attachments JSONB [{ url, title, mimeType }]
mentions int[]
metadata JSONB (smtp headers, automation details, etc.)
is_system bool default false
created_at, updated_at, deleted_at
```

## 4. API Surface
### 4.1 Todos
- `GET /api/todos` filters: `status`, `homeId`, `locationId`, `assigneeId`, `entityType`, `entityId`, `dueBefore/After`, pagination.
- `POST /api/todos` payload includes base fields plus `entityLinks`.
- `PATCH /api/todos/:id` partial updates; enforcement of tenant scope via `withTenantScope` + explicit `customerId` filters.
- Helper endpoints: `POST /api/todos/:id/assign`, `POST /api/todos/:id/status`, `POST /api/todos/:id/watchers` (optional but recommended for audit clarity).
- SSE events: `data_change:todos` with action metadata.

### 4.2 Comments
- `GET /api/comments?entityType=todo&entityId=123` (supports pagination & `includeReplies=true`).
- `POST /api/comments` with `{ entityType, entityId, parentCommentId?, body, commentType, visibility }`.
- `PATCH /api/comments/:id` for edits (only author or admin; log revisions in `metadata.changelog`).
- `DELETE /api/comments/:id` soft delete.
- SSE events: `data_change:comments` plus per-entity fan-out for live threads.

## 5. Eventing & Notifications
- Extend `eventBus` to broadcast `{ resource: 'todos' | 'comments', action, data }`.
- Hook into existing SSE `/api/events/stream`; clients subscribe per resource.
- Future email integration stores SMTP payload inside `comments.metadata.smtp` and can reuse Notification service once available.

## 6. Security & RLS
- All queries explicitly filter `customer_id = scope.customerId`; apply `home_id IN scope.homeIds` where relevant (todos tied to specific homes).
- Comments: enforce entity access before returning/creating (reuse `verifyEntityAccess` pattern from media routes).
- Consider new `policy_registry` entries so fallback `/api/{table}` respects new tables immediately.

## 7. Migration Plan
1. **Schema:** add `todos`, `comments`, associated indexes, and supporting enums.
2. **Backfill:** optional script to convert existing issue notes into `comments` (entity_type=`issue`).
3. **RLS:** extend `rls/apply-rls-v2.ts` to cover the new tables once base functionality stabilizes.
4. **Seed data:** update seed sets with sample todos/comments for smoke tests.

## 8. Service Layer Tasks
- Implement `server/src/routes/todos.ts` mirroring patterns from `issues.ts` (with `autoInjectMiddleware`).
- Implement `server/src/routes/comments.ts` with validation of `entity_type`+`entity_id` and threading support.
- Update `server/src/server.ts` to mount new routers and include them in `/` root endpoint listing.
- Extend SSE listener + `eventBus` type map.
- Add policy registry metadata (`tables.json`) for `todos` & `comments` so `/api/{table}` fallback works out of the box.

## 9. Client Integration Notes
- UI: add backlog/kanban style views for todos, inline comment threads inside issues/inventory detail panels.
- Leverage shared comment component; render email/system comments with badges using `comment_type`.
- Notifications: subscribe to `data_change:todos`/`comments` to refresh lists in real time.

## 10. Timeline (rough)
| Phase | Duration | Deliverables |
| --- | --- | --- |
| Week 1 | Schema + migrations | `todos`, `comments`, enums, indexes |
| Week 2 | Backend routes + SSE | `/api/todos`, `/api/comments`, event wiring |
| Week 3 | Client integration MVP | Basic list/detail views, comment thread component |
| Week 4 | Email-ready extensions | `comment_type` plumbing, metadata stores, backlog grooming |

## 11. Open Questions
- Do todos require sub-tasks or checklist items in v1? (currently deferred.)
- How will email ingress authenticate/route to entity (unique dropbox per customer vs. per issue/todo)?
- Do we need per-comment reactions/emoji immediately, or leave as metadata for later?
- Should watchers auto-include issue reporters/home owners?

---
_Last updated: 2025-12-01 by roadmap automation request._
