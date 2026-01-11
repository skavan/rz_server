-- Add BOM support fields to inventory_purchase_order_items
-- parentSkuId: references the parent SKU when this item is a BOM component
-- locationIds: array of destination location IDs

ALTER TABLE inventory_purchase_order_items 
ADD COLUMN parent_sku_id INTEGER REFERENCES skus(id) ON DELETE SET NULL;

ALTER TABLE inventory_purchase_order_items 
ADD COLUMN location_ids INTEGER[];

CREATE INDEX idx_purchase_order_items_parent_sku 
ON inventory_purchase_order_items(parent_sku_id);
