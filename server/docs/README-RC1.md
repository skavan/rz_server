# Documentation Index

Quick reference to all server documentation.

## Core Documentation

### 📘 [README.md](../../README.md)
**Main project documentation**
- Project overview and features
- Getting started guide
- API endpoints reference
- Database schema overview
- Development workflow

### 📗 [Operational Playbook](operational-playbook-RC1.md)
**Day-to-day operations guide**
- Environment setup
- Database seeding
- RLS (Row-Level Security) setup
- Running the server
- Common troubleshooting

### 📙 [Components API](components-api-RC1.md)
**Bill of Materials (BOM) support**
- Product components
- SKU components
- Composite endpoints
- Validation schemas
- Delete guards
- Best practices

### 🏷️ [Tag Strategy](tag-strategy-RC1.md)
**Flexible categorization system**
- Tag architecture and design
- Two-dimensional filtering (scope + category)
- Usage by entity type (SKU, Product, Inventory, Location)
- System vs user tags
- UI/UX guidelines
- Anti-patterns to avoid

### 📕 [Auto-Inject Middleware](AUTO_INJECT_IMPLEMENTATION-RC1.md)
**Automatic scope injection**
- How middleware works
- Updated routes
- Table requirements
- Security benefits

## Reference Documentation

### 🔒 [RLS Setup Cheatsheet](rls-setup-cheatsheet-RC1.md)
Row-Level Security quick reference

### 🔒 [RLS SQL Cheatsheet](rls-sql-cheatsheet-RC1.md)
SQL commands for RLS policies

### 📊 [Table Dependencies](table-dependencies-RC1.md)
Database table relationships and FK order

### 📦 [Inventory Items API](inventory-items-api-RC1.md)
Detailed inventory items endpoint documentation

### ✅ [TODOS](TODOS-RC1.md)
Project task list and future enhancements

## Quick Links

**Common Tasks:**
- Start server: See [Operational Playbook](operational-playbook.md#running-the-server)
- Seed database: See [Operational Playbook](operational-playbook.md#seeding-your-database-your-json-numeric-order)
- Create BOM product: See [Components API](components-api.md#create-product-with-components)
- Setup RLS: See [Operational Playbook](operational-playbook.md#one-time-role--rls-setup)

**Troubleshooting:**
- Permission denied (42501): [Operational Playbook](operational-playbook.md#troubleshooting-quick-fixes)
- Sequence drift: [Operational Playbook](operational-playbook.md#duplicate-key-on-products_pkey-sequence-drift)
- RLS not filtering: [Operational Playbook](operational-playbook.md#troubleshooting-quick-fixes)

**API References:**
- Products with components: [Components API](components-api.md#products-with-components)
- SKUs with components: [Components API](components-api.md#skus-with-components)
- All endpoints: [README](../../README.md#api-endpoints)

---

**Last Updated**: October 19, 2025
