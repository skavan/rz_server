-- Migration: Shippers and PO Shipping
-- 1. Create shipping_status enum
-- 2. Create shippers table (home-scoped)
-- 3. Add shipper_id and shipping_status to inventory_purchase_orders

-- Step 1: Create shipping_status enum
DO $$
BEGIN
  CREATE TYPE shipping_status AS ENUM (
    'left_warehouse',
    'arrived_ja',
    'delivered'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create shippers table
CREATE TABLE IF NOT EXISTS shippers (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE cascade,
  home_id integer NOT NULL REFERENCES homes(id) ON DELETE cascade,
  name varchar(255) NOT NULL,
  ship_to_name varchar(255),
  street varchar(255),
  city varchar(100),
  state varchar(100),
  zip varchar(20),
  country varchar(100),
  phone varchar(50),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shippers_customer ON shippers(customer_id);
CREATE INDEX IF NOT EXISTS idx_shippers_home ON shippers(home_id);
CREATE INDEX IF NOT EXISTS idx_shippers_is_active ON shippers(is_active);
CREATE INDEX IF NOT EXISTS idx_shippers_name ON shippers(name);

-- Step 3: Add shipper_id and shipping_status to inventory_purchase_orders
ALTER TABLE inventory_purchase_orders
  ADD COLUMN IF NOT EXISTS shipper_id integer REFERENCES shippers(id) ON DELETE SET NULL;

ALTER TABLE inventory_purchase_orders
  ADD COLUMN IF NOT EXISTS shipping_status shipping_status;

CREATE INDEX IF NOT EXISTS idx_po_shipper ON inventory_purchase_orders(shipper_id);
CREATE INDEX IF NOT EXISTS idx_po_shipping_status ON inventory_purchase_orders(shipping_status);
