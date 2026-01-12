# Date and Timezone Handling

This document explains how dates are handled between client and server to prevent timezone shift issues.

## The Problem

When a client sends a date like `"2026-01-12"` and the server parses it:
1. JavaScript `new Date("2026-01-12")` interprets it as **midnight UTC**
2. If the server is in UTC-5, that becomes `2026-01-11T19:00:00-05:00`
3. PostgreSQL DATE column might store it as `2026-01-11` (the previous day!)

## The Solution: Midday UTC Convention

**Client sends dates as midday UTC:**
```
"2026-01-12T12:00:00.000Z"
```

This ensures no timezone can shift the date to the previous or next day (since ±12 hours from noon still lands on the same date).

## Two Column Types, Two Parsing Functions

### TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ)

Used for: `shippedAt`, `deliveredAt`, `createdAt`, `updatedAt`, etc.

**Server uses:** `parseOptionalDate(value, field)` → returns `Date` object

PostgreSQL stores the exact UTC moment. Timezone handling is preserved.

### DATE (date only, no time)

Used for: `etaDate`, `purchaseDate`, `warrantyExpires`, `expectedReplacement`, `reviewedDate`

**Server uses:** `parseOptionalDateOnly(value, field)` → returns `"YYYY-MM-DD"` string

Extracts the date portion from the UTC representation, ignoring time:
```typescript
// Input: "2026-01-12T12:00:00.000Z"
// Output: "2026-01-12"
```

## Column Reference

| Column | Type | Parser Function |
|--------|------|-----------------|
| `etaDate` | DATE | `parseOptionalDateOnly` |
| `purchaseDate` | DATE | `parseOptionalDateOnly` |
| `warrantyExpires` | DATE | `parseOptionalDateOnly` |
| `expectedReplacement` | DATE | `parseOptionalDateOnly` |
| `reviewedDate` | DATE | `parseOptionalDateOnly` |
| `shippedAt` | TIMESTAMPTZ | `parseOptionalDate` |
| `deliveredAt` | TIMESTAMPTZ | `parseOptionalDate` |
| `createdAt` | TIMESTAMPTZ | `parseOptionalDate` |
| `updatedAt` | TIMESTAMPTZ | `parseOptionalDate` |
| All other `*At` columns | TIMESTAMPTZ | `parseOptionalDate` |

## Client Instructions

### Sending Dates

Always send dates as ISO strings with midday UTC:

```typescript
// For any date field
const dateValue = new Date(selectedDate);
dateValue.setUTCHours(12, 0, 0, 0);
const isoString = dateValue.toISOString();
// "2026-01-12T12:00:00.000Z"
```

### Receiving Dates

- TIMESTAMPTZ columns return ISO strings with full time
- DATE columns return `"YYYY-MM-DD"` strings

Parse accordingly:
```typescript
// TIMESTAMPTZ
const timestamp = new Date(response.shippedAt);

// DATE only
const [year, month, day] = response.etaDate.split('-').map(Number);
const dateOnly = new Date(year, month - 1, day);
```

## Adding New Date Columns

When adding a new date column:

1. **Decide the type:**
   - Need exact moment in time? → `TIMESTAMPTZ`
   - Just a calendar date? → `DATE`

2. **Use the correct parser:**
   - TIMESTAMPTZ: `parseOptionalDate(value, field)`
   - DATE: `parseOptionalDateOnly(value, field)`

3. **Update this document** with the new column

## Implementation Details

The `parseOptionalDateOnly` function in `validation.ts`:

```typescript
export function parseOptionalDateOnly(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  
  // If already YYYY-MM-DD, return as-is
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  
  const parsed = parseOptionalDate(value, field);
  if (!parsed) return null;
  
  // Extract YYYY-MM-DD from UTC representation
  return parsed.toISOString().split('T')[0];
}
```
