ALTER TABLE IF EXISTS media_assets
  ALTER COLUMN entity_type TYPE varchar(50);

ALTER TABLE IF EXISTS inventory_purchase_orders
  ADD COLUMN IF NOT EXISTS has_media_assets boolean DEFAULT false;

UPDATE inventory_purchase_orders
SET has_media_assets = false
WHERE has_media_assets IS NULL;
