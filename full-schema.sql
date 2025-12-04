-- Procurement + Ordering Desk schema snapshot (extracted 2025-12-03)

DO $$ BEGIN
	CREATE TYPE "public"."issue_resolution_type" AS ENUM('monitor', 'repair', 'replace', 'claim');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "public"."inventory_purchase_order_status" AS ENUM('draft', 'pending_vendor', 'ordered', 'receiving', 'closed', 'canceled');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "public"."inventory_action_procurement_status" AS ENUM('pending', 'in_review', 'ready_for_order', 'queued_for_po', 'ordered', 'fulfilled', 'canceled');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "public"."inventory_action_type" AS ENUM('replace', 'repair', 'claim');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "public"."inventory_action_repair_status" AS ENUM('not_applicable', 'pending', 'awaiting_vendor', 'in_service', 'completed', 'canceled');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "public"."shipping_charge_type" AS ENUM('percent', 'fixed');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "resolution_type" "issue_resolution_type" DEFAULT 'monitor' NOT NULL;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "requires_purchase" boolean DEFAULT false NOT NULL;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "action_request_id" integer;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "estimated_claim_amount" numeric(12, 2);
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "insurance_policy_ref" varchar(100);
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "insurance_claim_ref" varchar(100);
CREATE INDEX IF NOT EXISTS "idx_issues_action_request" ON "issues" USING btree ("action_request_id");

CREATE TABLE IF NOT EXISTS "inventory_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL REFERENCES "public"."customers"("id") ON DELETE cascade,
	"vendor_id" integer REFERENCES "public"."vendors"("id") ON DELETE set null,
	"purchase_number" varchar(64) NOT NULL,
	"status" "inventory_purchase_order_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"assigned_to_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"submitted_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"shipping_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"duties_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inventory_purchase_orders_customer_number_unique" UNIQUE("customer_id","purchase_number")
);
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_customer" ON "inventory_purchase_orders"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_vendor" ON "inventory_purchase_orders"("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_number" ON "inventory_purchase_orders"("purchase_number");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_status" ON "inventory_purchase_orders"("status");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_assignee" ON "inventory_purchase_orders"("assigned_to_user_id");

CREATE TABLE IF NOT EXISTS "inventory_action_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL REFERENCES "public"."customers"("id") ON DELETE cascade,
	"issue_id" integer NOT NULL REFERENCES "public"."issues"("id") ON DELETE cascade,
	"home_id" integer REFERENCES "public"."homes"("id") ON DELETE set null,
	"inventory_item_id" integer REFERENCES "public"."inventory_items"("id") ON DELETE set null,
	"product_id" integer REFERENCES "public"."products"("id") ON DELETE set null,
	"current_sku_id" integer REFERENCES "public"."skus"("id") ON DELETE set null,
	"replacement_sku_id" integer REFERENCES "public"."skus"("id") ON DELETE set null,
	"action_type" "inventory_action_type" DEFAULT 'replace' NOT NULL,
	"procurement_status" "inventory_action_procurement_status" DEFAULT 'pending' NOT NULL,
	"repair_status" "inventory_action_repair_status" DEFAULT 'not_applicable' NOT NULL,
	"requested_quantity" integer DEFAULT 1 NOT NULL,
	"field_notes" text,
	"internal_notes" text,
	"created_by_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"assigned_to_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"decision_by_user_id" integer REFERENCES "public"."users"("id") ON DELETE set null,
	"decision_made_at" timestamp with time zone,
	"preferred_vendor_id" integer REFERENCES "public"."vendors"("id") ON DELETE set null,
	"vendor_notes" text,
	"unit_price_estimate" numeric(14, 2),
	"claim_amount" numeric(14, 2),
	"is_claim_estimate" boolean DEFAULT true NOT NULL,
	"is_insurance_claim" boolean DEFAULT false NOT NULL,
	"shipping_charge_type" "shipping_charge_type",
	"shipping_charge_value" numeric(14, 2),
	"lead_time_days" integer,
	"shipping_time_days" integer,
	"eta_date" date,
	"current_purchase_order_id" integer REFERENCES "public"."inventory_purchase_orders"("id") ON DELETE set null,
	"queued_for_po_at" timestamp with time zone,
	"ordered_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"metadata" jsonb,
	"action_context" jsonb,
	"last_workflow_touched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_action_requests_customer" ON "inventory_action_requests"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_issue" ON "inventory_action_requests"("issue_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_home" ON "inventory_action_requests"("home_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_inventory" ON "inventory_action_requests"("inventory_item_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_procurement_status" ON "inventory_action_requests"("procurement_status");
CREATE INDEX IF NOT EXISTS "idx_action_requests_repair_status" ON "inventory_action_requests"("repair_status");
CREATE INDEX IF NOT EXISTS "idx_action_requests_vendor_pref" ON "inventory_action_requests"("preferred_vendor_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_po" ON "inventory_action_requests"("current_purchase_order_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_assignee" ON "inventory_action_requests"("assigned_to_user_id");
CREATE INDEX IF NOT EXISTS "idx_action_requests_type" ON "inventory_action_requests"("action_type");

CREATE TABLE IF NOT EXISTS "inventory_purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL REFERENCES "public"."customers"("id") ON DELETE cascade,
	"purchase_order_id" integer NOT NULL REFERENCES "public"."inventory_purchase_orders"("id") ON DELETE cascade,
	"action_request_id" integer REFERENCES "public"."inventory_action_requests"("id") ON DELETE set null,
	"sku_id" integer REFERENCES "public"."skus"("id") ON DELETE set null,
	"description" text,
	"ordered_quantity" integer DEFAULT 1 NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"unit_price_snapshot" numeric(14, 2),
	"extended_price" numeric(14, 2),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_purchase_order_items_customer" ON "inventory_purchase_order_items"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_order_items_po" ON "inventory_purchase_order_items"("purchase_order_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_order_items_action_request" ON "inventory_purchase_order_items"("action_request_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_order_items_sku" ON "inventory_purchase_order_items"("sku_id");

-- end of procurement snapshot
