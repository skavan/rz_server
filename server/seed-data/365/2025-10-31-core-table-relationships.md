# Core Table Relationships (crm_contacts ↔ bookings)

**Scope:** This note documents only the tables that currently produce the plain TypeScript types in `tmp/`: `crm_contacts`, `booking_reservations`, `booking_financials`, `booking_notes`, `finance_commissions`, `pricing_rates`, and `crm_lead_sources`. Relationships or indexes that involve other tables are omitted unless they clarify how the scoped tables connect to one another.

## High-Level Topology
- `booking_reservations` is the central record; `booking_financials`, `booking_notes`, and `finance_commissions` all tie back to it.
- `crm_contacts` links to reservations (as the primary guest) and to commissions (as an agent/contact on a commission record).
- `crm_lead_sources` supplies attribution metadata for reservations and commissions.
- `pricing_rates` does not join to any of the other scoped tables; it stands alone in this slice of the schema.

```
crm_contacts ← primary_guest_id ┐
                                ├─ booking_reservations ─┬─ booking_financials (1:1)
crm_lead_sources ← lead_source_id ┘                      ├─ booking_notes (1:N)
                                                        └─ finance_commissions (1:N)
crm_contacts ← agent_id  ◄──────── finance_commissions ──► crm_lead_sources
```

## Table Details

### crm_contacts
- **Primary key:** `id`
- **Outbound FKs (within scope):** none
- **Inbound refs (within scope):**
  - `booking_reservations.primary_guest_id` → `crm_contacts.id` (optional, many reservations can share a contact)
  - `finance_commissions.agent_id` → `crm_contacts.id` (optional, one contact can appear on many commissions)
- **Indexes / constraints:** only the primary key; no additional unique or secondary indexes within the scoped tables.

### booking_reservations
- **Primary key:** `id`
- **Unique constraints:**
  - `booking_reservations_external_id_unique` on `external_id`
  - `booking_reservations_confirmation_code_unique` on `confirmation_code`
- **Outbound FKs (within scope):**
  - `primary_guest_id` → `crm_contacts.id`
  - `lead_source_id` → `crm_lead_sources.id`
- **Inbound refs (within scope):**
  - `booking_financials.reservation_id` (1:1 enforced by unique constraint below)
  - `booking_notes.reservation_id` (1:N)
  - `finance_commissions.reservation_id` (1:N)
- **Indexes / constraints:** primary key plus the two unique constraints listed above.

### booking_financials
- **Primary key:** `id`
- **Unique constraints:** `booking_financials_reservation_id_unique` on `reservation_id`
- **Outbound FKs:** `reservation_id` → `booking_reservations.id`
- **Inbound refs (within scope):** none
- **Notes:** The unique constraint produces a strict 1:1 relationship with `booking_reservations`.

### booking_notes
- **Primary key:** `id`
- **Outbound FKs:** `reservation_id` → `booking_reservations.id`
- **Inbound refs (within scope):** none
- **Indexes / constraints:** primary key only (no additional indexes defined within scope).
- **Cardinality:** Multiple notes can be attached to a single reservation (1:N).

### finance_commissions
- **Primary key:** `id`
- **Outbound FKs:**
  - `reservation_id` → `booking_reservations.id`
  - `lead_source_id` → `crm_lead_sources.id`
  - `agent_id` → `crm_contacts.id`
- **Inbound refs (within scope):** none
- **Indexes / constraints:** primary key only (no additional unique or secondary indexes defined within scope).
- **Cardinality:** Multiple commission records can reference the same reservation, lead source, or contact.

### pricing_rates
- **Primary key:** `id`
- **Outbound FKs (within scope):** none
- **Inbound refs (within scope):** none
- **Indexes / constraints:** only the primary key (no additional indexes among the scoped tables).
- **Notes:** Exists independently of the other six tables in this document.

### crm_lead_sources
- **Primary key:** `id`
- **Outbound FKs (within scope):** none
- **Inbound refs (within scope):**
  - `booking_reservations.lead_source_id` (optional, many reservations can share a lead source)
  - `finance_commissions.lead_source_id` (optional, many commissions can share a lead source)
- **Indexes / constraints:** primary key only (no additional unique or secondary indexes among the scoped tables).

## Quick Reference (Indices & FKs)
| Table | Primary Key | Additional Index / Unique | Outbound FKs → | Inbound FKs ← |
|-------|-------------|---------------------------|----------------|---------------|
| `crm_contacts` | `id` | — | — | `booking_reservations.primary_guest_id`, `finance_commissions.agent_id` |
| `booking_reservations` | `id` | `external_id` (unique), `confirmation_code` (unique) | `primary_guest_id` → `crm_contacts.id`, `lead_source_id` → `crm_lead_sources.id` | `booking_financials.reservation_id`, `booking_notes.reservation_id`, `finance_commissions.reservation_id` |
| `booking_financials` | `id` | `reservation_id` (unique) | `reservation_id` → `booking_reservations.id` | — |
| `booking_notes` | `id` | — | `reservation_id` → `booking_reservations.id` | — |
| `finance_commissions` | `id` | — | `reservation_id` → `booking_reservations.id`, `lead_source_id` → `crm_lead_sources.id`, `agent_id` → `crm_contacts.id` | — |
| `pricing_rates` | `id` | — | — | — |
| `crm_lead_sources` | `id` | — | — | `booking_reservations.lead_source_id`, `finance_commissions.lead_source_id` |

_All field names above use their database column names. Each primary key implicitly creates a clustered index in PostgreSQL; no other secondary indexes exist for the scoped tables at this time._
