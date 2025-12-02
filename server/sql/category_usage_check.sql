-- category_usage_check.sql
-- Usage: replace the IDs in the ARRAY literal with the category IDs you want to inspect.
-- Example: SELECT ARRAY[1, 3]::int[] AS ids;  ← update this list before running.

WITH target_categories AS (
  SELECT ARRAY[1, 3]::int[] AS ids
)
SELECT 'products' AS table_name, p.id AS record_id, p.category_id, c.name AS category_name, p.name AS record_name
FROM products p
CROSS JOIN target_categories
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.category_id = ANY(target_categories.ids)
UNION ALL
SELECT 'tags', t.id, t.category_id, c.name, t.name
FROM tags t
CROSS JOIN target_categories
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.category_id = ANY(target_categories.ids)
UNION ALL
SELECT 'brands', b.id, cat_id AS category_id, c.name, b.name
FROM brands b
CROSS JOIN target_categories
CROSS JOIN LATERAL unnest(b.category_ids) AS cat_id
LEFT JOIN categories c ON cat_id = c.id
WHERE cat_id = ANY(target_categories.ids)
ORDER BY table_name, record_id;
