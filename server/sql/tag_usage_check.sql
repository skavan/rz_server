-- tag_usage_check.sql
-- Usage: replace the IDs in the ARRAY literal with the tag IDs you want to inspect.
-- Example: SELECT ARRAY[5, 12]::int[] AS ids;  ← update this list before running.

WITH target_tags AS (
  SELECT ARRAY[5, 12]::int[] AS ids
)
SELECT 'products' AS table_name, id AS record_id, tags
FROM products, target_tags
WHERE tags && target_tags.ids
UNION ALL
SELECT 'skus', id, tags
FROM skus, target_tags
WHERE tags && target_tags.ids
UNION ALL
SELECT 'locations', id, tags
FROM locations, target_tags
WHERE tags && target_tags.ids
UNION ALL
SELECT 'inventory_items', id, tags
FROM inventory_items, target_tags
WHERE tags && target_tags.ids
UNION ALL
SELECT 'issues', id, tags
FROM issues, target_tags
WHERE tags && target_tags.ids
ORDER BY table_name, record_id;
