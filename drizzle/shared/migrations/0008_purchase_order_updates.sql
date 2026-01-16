-- Migration: Purchase Order Updates
-- 1. Add other_charges column
-- 2. Add payment_method column  
-- 3. Rename enum value 'closed' to 'complete'

-- Step 1: Add new columns
ALTER TABLE inventory_purchase_orders 
  ADD COLUMN IF NOT EXISTS other_charges NUMERIC(14,2) DEFAULT 0 NOT NULL;

ALTER TABLE inventory_purchase_orders 
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- Step 2: Rename enum value from 'closed' to 'complete'
-- This is safe since no existing entries use 'closed'
ALTER TYPE inventory_purchase_order_status RENAME VALUE 'closed' TO 'complete';
