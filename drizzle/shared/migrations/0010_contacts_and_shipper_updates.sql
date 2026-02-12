-- Migration: Contacts and Shipper Updates
-- 1. Create contact_type enum
-- 2. Create contacts table (customer-scoped)
-- 3. Add contact_ids and notes to shippers

-- Step 1: Create contact_type enum
DO $$
BEGIN
  CREATE TYPE contact_type AS ENUM (
    'vendor',
    'shipper',
    'builder',
    'service',
    'agent',
    'sales'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE cascade,
  first_name varchar(255),
  last_name varchar(255),
  phone_number varchar(50),
  email_address varchar(255),
  street_address varchar(255),
  city varchar(100),
  state varchar(100),
  zip_code varchar(20),
  country varchar(100),
  notes text,
  contact_type contact_type,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(first_name, last_name);

-- Step 3: Add contact_ids and notes to shippers
ALTER TABLE shippers
  ADD COLUMN IF NOT EXISTS contact_ids integer[];

ALTER TABLE shippers
  ADD COLUMN IF NOT EXISTS notes text;
