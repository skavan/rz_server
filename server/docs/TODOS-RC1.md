# Server TODOs - RC1

This doc tracks deferred server-side tasks and DB hardening work.

## 🏷️ Tag System Implementation (IN PROGRESS)

### Schema Changes
- [ ] Add `categoryId` column to tags table (nullable FK to categories)
- [ ] Empty `tagType` enum values (keep field as placeholder)
- [ ] Generate and apply Drizzle migration

### Data Migration
- [ ] Clear existing tag arrays from all tables:
  - [ ] products.tags = NULL
  - [ ] skus.tags = NULL  
  - [ ] locations.tags = NULL
  - [ ] inventory_items.tags = NULL
  - [ ] media_assets.tags = NULL
- [ ] Create seed data script with system tags
- [ ] Seed universal tags (luxury, premium, basic, commercial-grade)
- [ ] Seed category-specific SKU tags (per category in categories table)
- [ ] Seed inventory workflow tags (needs-inspection, spare, etc.)
- [ ] Seed location space tags (bedroom, bathroom, high-humidity, etc.)

### API & Validation  
- [ ] Create tags routes (CRUD operations)
- [ ] Add tag filtering by scope + categoryId
- [ ] Add validation preventing scope violations
- [ ] Update Zod validation schemas for tags
- [ ] Build and test shared package

### Documentation
- [x] Create tag-strategy-RC1.md document
- [x] Update README-RC1.md with tag strategy link
- [ ] Update operational-playbook-RC1.md with tag seeding instructions

---

## Data Integrity & Constraints

- [ ] Add FK constraints for `product_components`:
  - `parent_product_id` -> `products.id` ON DELETE RESTRICT
  - `component_product_id` -> `products.id` ON DELETE RESTRICT
  - Optional: consider ON DELETE CASCADE only if you want cascading removals of children (not recommended for now)
- [ ] Add unique/dupe protection:
  - Unique index on `(parent_product_id, component_product_id)` to prevent duplicate components per kit
  - Optional: add `sort_order` validation/index if ordering must be unique per parent
- [ ] Add CHECK constraints:
  - `quantity >= 1`
  - `is_required` default true
- [ ] Enforce `products.slug` uniqueness per home (e.g., unique(home_id, slug))
- [ ] Enforce `media_assets.home_id` NOT NULL via follow-up migration (backfill complete)

## Delete Rules (Server)

- [ ] Harden DELETE /api/products/:id with DB-level policies (in addition to app guards):
  - Prevent deleting a product that has components (is a kit parent)
  - Prevent deleting a product used as a component in other kits
  - Prevent deleting a product with inventory items
- [ ] Consider DB policies or triggers to deny deletes when dependent rows exist

## Realtime & Caching

- [ ] Verify LISTEN/NOTIFY triggers exist for all tables: products, product_components, inventory_items, etc.
- [ ] Expand emitted event payloads with richer context (e.g., changed fields, parent ids)
- [ ] Add backpressure or coalescing for burst updates

## Migrations

- [ ] Create Drizzle migrations for the above constraints and indexes
- [ ] Backfill/clean existing data using `docs/sql/find-orphans.sql` before enabling RESTRICT FKs

## Observability

- [ ] Add structured logs around deletes and composite updates
- [ ] Expose health and metrics for changefeed (listener status, backlog)
