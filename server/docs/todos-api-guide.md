# Todos API Guide (v1)

This document describes the server API contract for Todos.

## Mental Model

- A **Todo** is the parent record for a discussion thread.
- A Todo can be either:
  - `type="todo"` (task-like)
  - `type="conversation"` (discussion-only)
- **Comments/replies** always attach to the parent Todo via the existing Comments API:
  - `entityType: "todo"`
  - `entityId: <todoId>`

## Data Model (Todos)

Key fields:

- `id: number`
- `customerId: number`
- `homeId: number`
- `title: string`
- `body: string` (Markdown)
- `type: "todo" | "conversation"`
- `status: "todo" | "in_progress" | "complete"`
- `priority: "low" | "high"`
- `assignedToUserIds: number[] | null`
- `dueAt: ISO string | null`
- `tags: number[] | null` (tag ids)
- `linkedEntityType: string | null`
- `linkedEntityId: number | null`
- `completedAt: ISO string | null` (server-controlled)
- `completedByUserId: number | null` (server-controlled)
- `deletedAt: ISO string | null` (server-controlled)
- `deletedByUserId: number | null` (server-controlled)
- `createdByUserId: number` (required)
- `createdAt: ISO string`
- `updatedAt: ISO string`

### Linked Entity Fields

Use these to attach a todo/conversation to another record.

- `linkedEntityType`
- `linkedEntityId`

Rule: if you send one, you must send both (or send both as `null` to clear).

Recommended allowed values for `linkedEntityType`:

- `issue`, `inventory_item`, `inventory_action_request`, `inventory_purchase_order`, `inventory_purchase_order_item`,
  `home`, `location`, `product`, `sku`, `todo`, `booking_reservation`, `customer`, `user`

## Endpoints

### Create Todo

`POST /api/todos`

Body (minimal):

```json
{
  "homeId": 123,
  "title": "Replace smoke detector",
  "body": "Markdown allowed"
}
```

Body (full):

```json
{
  "homeId": 123,
  "title": "Replace smoke detector",
  "body": "Markdown allowed",
  "type": "todo",
  "status": "todo",
  "priority": "high",
  "assignedToUserIds": [10, 12],
  "dueAt": "2026-01-15T00:00:00.000Z",
  "tags": [3, 9],
  "linkedEntityType": "issue",
  "linkedEntityId": 456
}
```

Response:

```json
{ "data": { "id": 1, "...": "..." } }
```

Notes:
- `createdByUserId` is derived from the authenticated user.
- `completedAt` / `completedByUserId` are server-controlled.

### Update Todo

`PATCH /api/todos/:id`

Common updates:

- Update metadata: `title`, `body`, `dueAt`, `tags`, `assignedToUserIds`, `priority`, `type`, `status`
- Link/unlink:
  - set both to link: `linkedEntityType`, `linkedEntityId`
  - set both to `null` to clear

Status rules:
- Setting `status="complete"` sets `completedAt` and `completedByUserId` (server-controlled).
- Moving off `status="complete"` clears completion markers and is **admin-only** (reopen).
- Completion authorization:
  - If `assignedToUserIds` is non-empty: only a user in that list may complete.
  - If unassigned: creator may complete; admin override allowed.

Conversations (`type="conversation"`) may also be marked `complete`.

Response:

```json
{ "data": { "id": 1, "...": "..." } }
```

### Soft Delete Todo

`DELETE /api/todos/:id`

Soft deletes a todo by setting `deletedAt`/`deletedByUserId`.

- Only **admin** or **creator** may delete.
- Deleted todos are excluded from `/api/table/todos` by default.

Response:

```json
{ "data": { "id": 1, "deletedAt": "...", "deletedByUserId": 10, "...": "..." } }
```

## Listing Todos (Table API)

`GET /api/table/todos`

This endpoint returns todos (camelCase) and supports filters:

- `type=todo|conversation`
- `status=todo|in_progress|complete`
  - Back-compat: `status=open` maps to `status <> complete`
  - Back-compat: `status=completed` maps to `status = complete`
- `priority=low|high`
- `assignedToUserId=<userId>` (matches membership in `assigned_to_user_ids`)
- `dueBefore=<date>` and `dueAfter=<date>`
- `tagId=<tagId>` (array contains)
- `q=<text>` (searches title/body)
- `linkedEntityType=<type>`
- `linkedEntityId=<id>`

Notes:
- The server enforces tenant/home scoping.
- Soft-deleted todos are excluded (`deleted_at IS NULL`).

## Comments (Replies) on Todos

Use existing comments endpoint:

`POST /api/comments`

Body:

```json
{
  "entityType": "todo",
  "entityId": 123,
  "body": "Reply markdown..."
}
```

Any user with home access can comment on a todo (including viewers).
