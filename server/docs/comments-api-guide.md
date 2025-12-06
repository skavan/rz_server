# Comments API + Realtime Guide (RC1)

This document explains how client developers should work with the unified comments surface that now covers issues, inventory, booking, and other entities. All endpoints live under `/api/comments` and reuse the shared tenant scope (`customerId`, `homeIds`) that the rest of Server V2 enforces.

## 1. Supported Entities & Terminology

- **Entity targets** – `issue`, `inventory_item`, `inventory_action_request`, `inventory_purchase_order`, `inventory_purchase_order_item`, `home`, `location`, `product`, `sku`, `booking_reservation`, `customer`, `user`. `todo` is reserved for the upcoming todos module and currently blocked at validation time.
- **Visibility** – `tenant` (default, share with everyone inside the tenant), `internal` (limit to staff/internal roles), `external` (explicitly safe for customer-facing channels).
- **Comment types** – `user` (default), `system`, `email_inbound`, `email_outbound`, `note`. Only admins can submit explicit `system` comments or flip the `isSystem` flag.
- **Mentions** – store numeric user IDs in `mentions` (`int[]`). Duplicates are removed; non-numeric values are rejected.
- **Subject** – optional short line (≤255 chars). When omitted the API auto-fills with a friendly `${entityType} #${entityId}` pattern so clients can ignore it until they need richer headers.
- **Body format** – payload is normalized into an HTML string (TipTap output). Strings are trimmed and validated (1–40k chars). Legacy block JSON is still accepted but is stringified as plain text.

## 2. Data Model Cheatsheet

| Field | Notes |
| --- | --- |
| `id` | Auto PK. Returned on every response.
| `customerId` | Injected from auth scope; cannot be overridden.
| `homeId` | Derived from the target entity or inherited from the parent comment. May be `null` for global/customer-level records.
| `entityType` / `entityId` | Required; must match one of the whitelisted entity types above.
| `parentCommentId` | Optional. Must reference an existing comment on the same entity. Replies are returned when `includeReplies=true` (default).
| `subject` | Optional short label (<=255 chars). Defaults to `Inventory Item #42`, `Issue #17`, etc. Set `null` to clear it.
| `body` | HTML string (TipTap). The server trims input, enforces 1–40k chars, and falls back to stringified JSON for legacy payloads.
| `commentType` | Enum listed above. Enforced on create/update.
| `visibility` | Enum listed above.
| `mentions` | Integer array (nullable). Use to drive client-side mention badges/notifications.
| `metadata` | Free-form JSON for integrations (email headers, automation traces, etc.).
| `hasAttachments` | Boolean mirror toggled automatically when files are uploaded/deleted via `/api/media/comment/:id`.
| `deletedAt` / `deletedByUserId` | Populated on soft delete. Use `includeDeleted=true` to inspect tombstoned rows.

## 3. REST Endpoints

### 3.1 List Comments
```
GET /api/comments?entityType=issue&entityId=42&includeReplies=false&order=desc&limit=50&offset=0
```
Query params (snake_case mirrors camelCase automatically):
- `entityType` / `entity_type` **(required)**
- `entityId` / `entity_id` **(required)**
- `parentId` / `parent_comment_id` – show only direct replies to a specific parent comment
- `includeReplies` – default `true`; set `false` to only show top-level comments
- `includeDeleted` – default `false`
- `order` – `asc` or `desc` (default `asc`)
- `limit`/`offset` – pagination (default 1000 / 0; max limit 2000, both overridable via `DEFAULT_PAGE_LIMIT` / `MAX_PAGE_LIMIT` env)

Returns `{ data: CommentRow[], meta: { count, limit, offset, entityType, entityId } }`.

### 3.2 Retrieve One Comment
```
GET /api/comments/:id?includeDeleted=true
```
Respects tenant scope; returns 404 if the comment is soft-deleted and `includeDeleted` is not explicitly `true`.

### 3.3 Create Comment
```
POST /api/comments
Content-Type: application/json
{
  "entityType": "issue",
  "entityId": 42,
  "parentCommentId": null,
  "subject": "Punch list prep",
  "body": "Need a second quote from HVAC vendor",
  "visibility": "tenant",
  "commentType": "user",
  "mentions": [17, 29],
  "metadata": { "source": "issues.detail" },
  "hasAttachments": false
}
```
Behavior:
- `customerId` is injected automatically.
- `homeId` is derived from the target entity (or inherited from a parent comment) and validated against the caller’s `homeIds` list.
- Non-admins attempting `commentType=system` or `isSystem=true` receive `403`.
- `parentCommentId` must reference the same entity and be non-deleted.
- Returns `201` with the created row.

### 3.4 Update Comment
```
PATCH or PUT /api/comments/:id
{
  "body": "<p>Updated scope after inspection</p>",
  "subject": "Issue #42 follow-up",
  "mentions": "17,32",
  "visibility": "internal"
}
```
Editable fields: `body`, `visibility`, `commentType`, `metadata`, `mentions`. Only the original author or an admin may edit. Soft-deleted comments cannot be edited. Returns the updated row and emits an SSE update event. `PUT` is treated identically to `PATCH` for callers that prefer idempotent semantics.

### 3.5 Soft Delete Comment
```
DELETE /api/comments/:id
```
Checks author/admin permissions, stamps `deletedAt` + `deletedByUserId`, and emits a delete event. Replies are not auto-deleted; clients should decide how to render orphaned reply chains.

## 4. Attachments Workflow

- Upload endpoint: `POST /api/media/comment/:commentId` with a `file` field (multipart). Optional fields: `title`, `description`, `isPrimary`, `sortOrder`, `tags`.
- Listing: `GET /api/media/comment/:commentId` returns active media assets for the comment.
- Delete: `DELETE /api/media/:id` removes a media asset and, when the last attachment disappears, flips `comments.hasAttachments` back to `false` automatically.
- The comments API accepts `hasAttachments` on `POST` for optimistic UI updates, but the media route is the source of truth and will reconcile the flag on upload/delete.

## 5. Realtime Events (SSE)

Comments emit two flavors of SSE events via `/api/events/stream`:
1. **Global feed** – `event: data_change:comments` with `{ type: 'create' | 'update' | 'delete', resource: 'comments', resourceId, entityType, entityId, data }`.
2. **Thread feed** – `event: data_change:comments:{entityType}:{entityId}` for fine-grained subscriptions (e.g., `comments:issue:42`).

Subscription tips:
- Connect to `/api/events/stream?resources=comments` for the global feed, or `/api/events/stream?resources=comments:issue:42` to watch a single issue thread.
- Each event’s `meta.audience` contains `{ customerId, homeIds }`, and the server enforces tenant/home scoping before writing to a subscriber.
- Heartbeats (`event: heartbeat`) fire every 60s so clients can show connection status.

## 6. Validation & Permissions Recap

- All reads/writes run inside `withTenantScope`, so `customerId` is mandatory and enforced even if a client tampers with payloads.
- `entityType` must be in the approved list; `todo` is explicitly blocked until the todos module ships.
- Home access: when the target entity has a `homeId`, the caller must already have access to that home (`ensureHomeAccess` will raise otherwise).
- `parentCommentId` must belong to the same entity and cannot be deleted.
- `includeDeleted` is the only way to read soft-deleted comments.
- `mentions` must resolve to numeric IDs; malformed entries trigger `400`.
- `metadata` must be valid JSON (stringified or object literal).

## 7. Testing Shortcuts

- Use `npm run dev` in `server/` and authenticate with any existing test user; tokens/middleware are shared with the rest of the API.
- Quick curl smoke test:
  ```bash
  curl -X POST http://localhost:5000/api/comments \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{
      "entityType": "issue",
      "entityId": 42,
      "body": "First punch-list note",
      "mentions": [5],
      "metadata": { "origin": "qa" }
    }'
  ```
- SSE dev trick: in non-production environments you can pass `customerId`/`homeIds` query params to `/api/events/stream` to impersonate a scope because EventSource cannot set headers.

With these APIs and events, client applications can render threaded conversations anywhere in the product, surface presence via mentions, and keep attachment badges in sync without bespoke per-entity logic.
