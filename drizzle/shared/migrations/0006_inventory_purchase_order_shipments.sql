DO $$
BEGIN
  CREATE TYPE inventory_purchase_order_shipment_status AS ENUM (
    'label_created',
    'in_transit',
    'delivered',
    'exception',
    'canceled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS inventory_purchase_order_shipments (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE cascade,
  purchase_order_id integer NOT NULL REFERENCES inventory_purchase_orders(id) ON DELETE cascade,
  carrier varchar(100),
  tracking_number varchar(128) NOT NULL,
  status inventory_purchase_order_shipment_status NOT NULL DEFAULT 'label_created',
  shipped_at timestamptz,
  delivered_at timestamptz,
  eta_date date,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (purchase_order_id, tracking_number)
);

CREATE INDEX IF NOT EXISTS idx_po_shipments_customer ON inventory_purchase_order_shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_po_shipments_po ON inventory_purchase_order_shipments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_shipments_status ON inventory_purchase_order_shipments(status);
CREATE INDEX IF NOT EXISTS idx_po_shipments_tracking ON inventory_purchase_order_shipments(purchase_order_id, tracking_number);

CREATE TABLE IF NOT EXISTS inventory_purchase_order_shipment_items (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE cascade,
  shipment_id integer NOT NULL REFERENCES inventory_purchase_order_shipments(id) ON DELETE cascade,
  purchase_order_item_id integer NOT NULL REFERENCES inventory_purchase_order_items(id) ON DELETE cascade,
  quantity integer NOT NULL DEFAULT 1,
  received_quantity integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (shipment_id, purchase_order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_po_shipment_items_customer ON inventory_purchase_order_shipment_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_po_shipment_items_shipment ON inventory_purchase_order_shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_po_shipment_items_po_item ON inventory_purchase_order_shipment_items(purchase_order_item_id);
