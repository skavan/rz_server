-- Migration: Harmonize BOM/Kit indicator to use 'kind' field
-- Products: isKit boolean -> kind varchar('simple' | 'bom')
-- SKUs: kind 'kit' -> kind 'bom'

-- ============================================
-- PRODUCTS TABLE: Add kind column and migrate data
-- ============================================

-- Step 1: Add the new 'kind' column with default value
ALTER TABLE products 
ADD COLUMN kind VARCHAR(20) DEFAULT 'simple' NOT NULL;

-- Step 2: Migrate existing isKit values to kind
UPDATE products 
SET kind = 'bom' 
WHERE is_kit = true;

-- Step 3: Drop the old is_kit column
ALTER TABLE products 
DROP COLUMN is_kit;

-- Step 4: Drop old index on is_kit
DROP INDEX IF EXISTS idx_products_kit;

-- Step 5: Create new index on kind
CREATE INDEX idx_products_kind ON products(kind);

-- ============================================
-- SKUS TABLE: Update kind enum values
-- ============================================

-- Step 1: Update existing 'kit' values to 'bom'
UPDATE skus 
SET kind = 'bom' 
WHERE kind = 'kit';

-- Note: No schema changes needed for skus table, just data transformation

-- ============================================
-- VERIFICATION QUERIES (uncomment to check)
-- ============================================

-- SELECT kind, COUNT(*) FROM products GROUP BY kind;
-- SELECT kind, COUNT(*) FROM skus GROUP BY kind;
