# Inventory Items API

## Overview
Complete CRUD API for managing inventory items with tenant scoping, real-time event broadcasting, and comprehensive filtering.

## Endpoints

### GET `/api/inventory-items`
List all inventory items with optional filtering and pagination.

**Query Parameters:**
- `product_id` - Filter by product ID
- `location_id` - Filter by location ID
- `home_id` - Filter by home ID
- `status` - Filter by status (unassigned, in_use, in_storage, damaged, in_repair, missing)
- `search` - Search in notes, serial number, or asset tag
- `low_stock` - Set to 'true' to filter items with low quantity
- `low_stock_threshold` - Quantity threshold for low stock (default: 5)
- `expiring_soon` - Set to 'true' to filter items with warranty expiring in next 30 days
- `limit` - Results per page (default: 1000; configurable via `DEFAULT_PAGE_LIMIT`)
- `offset` - Pagination offset (default: 0)
- `sort` - Sort column: quantity, purchaseDate, createdAt, purchasePrice, updatedAt (default: updatedAt)
- `order` - Sort order: asc or desc (default: desc)

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "customerId": 1,
      "homeId": 2,
      "skuId": 45,
      "productId": 67,
      "serialNumber": "SN123456",
      "assetTag": "ASSET-001",
      "locationId": 10,
      "status": "in_use",
      "quantity": 1,
      "condition": "good",
      "purchaseDate": "2024-01-15",
      "purchasePrice": "299.99",
      "currency": "USD",
      "warrantyExpires": "2026-01-15",
      "notes": "Main office desk",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": {
    "count": 1,
    "limit": 1000,
    "offset": 0
  }
}
```

---

### GET `/api/inventory-items/:id`
Get a single inventory item by ID.

**Response:**
```json
{
  "data": {
    "id": 123,
    "customerId": 1,
    "homeId": 2,
    ...
  }
}
```

---

### POST `/api/inventory-items`
Create a new inventory item. **Requires authentication.**

**Request Body:**
```json
{
  "skuId": 45,
  "productId": 67,
  "homeId": 2,
  "locationId": 10,
  "quantity": 1,
  "serialNumber": "SN123456",
  "assetTag": "ASSET-001",
  "status": "in_use",
  "condition": "good",
  "purchaseDate": "2024-01-15",
  "purchasePrice": "299.99",
  "currency": "USD",
  "warrantyExpires": "2026-01-15",
  "expectedReplacement": "2029-01-15",
  "parentItemId": null,
  "isKitComponent": false,
  "tags": [1, 5, 12],
  "notes": "Main office desk"
}
```

**Required Fields:**
- `skuId` (integer)
- `productId` (integer)
- `homeId` (integer)

**Response:** `201 Created`
```json
{
  "data": {
    "id": 123,
    ...
  }
}
```

---

### PUT `/api/inventory-items/:id`
Update an existing inventory item. **Requires authentication.**

**Request Body:** (all fields optional)
```json
{
  "locationId": 11,
  "status": "in_storage",
  "condition": "fair",
  "quantity": 2,
  "notes": "Moved to storage",
  "lastChecked": "2024-10-17T10:00:00Z"
}
```

**Response:**
```json
{
  "data": {
    "id": 123,
    "updatedAt": "2024-10-17T10:05:00Z",
    ...
  }
}
```

---

### PATCH or PUT `/api/inventory-items/:id/adjust-quantity`
Adjust inventory quantity by a positive or negative amount. **Requires authentication.** `PUT` behaves the same as `PATCH` for clients that prefer idempotent semantics.

**Request Body:**
```json
{
  "adjustment": -2,
  "reason": "Damaged during move"
}
```

**Response:**
```json
{
  "data": {
    "id": 123,
    "quantity": 3,
    "notes": "...\n[2024-10-17T10:05:00Z] Adjusted by -2: Damaged during move",
    ...
  }
}
```

---

### DELETE `/api/inventory-items/:id`
Delete an inventory item. **Requires authentication.**

**Response:** `200 OK`
```json
{
  "message": "Inventory item deleted successfully"
}
```

---

## Features

### Tenant Scoping
All queries automatically respect:
- Customer ID from authentication token
- Home ID access control via `user_home_access` table
- Row-level security policies

### Real-Time Events
All create, update, and delete operations broadcast events via:
- Server-Sent Events (SSE) at `/api/events`
- Event type: `data_change:inventory_items`
- Scoped to relevant home IDs

### Field Schema
Based on actual database schema with fields:
- **Identity**: id, customerId, homeId, skuId, productId
- **Tracking**: serialNumber, assetTag
- **Location**: locationId, status, condition
- **Quantity**: quantity
- **Lifecycle**: purchaseDate, purchasePrice, currency, warrantyExpires, expectedReplacement
- **Maintenance**: lastChecked, lastMaintained
- **Kit Support**: parentItemId, isKitComponent
- **Media**: hasMediaAssets
- **Metadata**: tags (array), notes, isActive
- **Timestamps**: createdAt, updatedAt

### Status Values
- `unassigned` - Not yet assigned to location/user
- `in_use` - Currently in use
- `in_storage` - In storage
- `damaged` - Damaged/broken
- `in_repair` - Being repaired
- `missing` - Cannot be located

### Condition Values
- `excellent` - Like new
- `good` - Normal wear
- `fair` - Some damage
- `poor` - Heavy wear/damage

## Error Responses

**400 Bad Request**
```json
{
  "error": "Product ID is required"
}
```

**404 Not Found**
```json
{
  "error": "Inventory item not found"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error"
}
```

## Authentication

Most endpoints require authentication via Bearer token:
```
Authorization: Bearer <jwt_token>
```

Only GET endpoints support optional authentication for flexibility.
