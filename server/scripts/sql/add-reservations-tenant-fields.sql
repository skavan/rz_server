-- Add tenant fields to reservations table
-- Following multi-tenant pattern used throughout the schema

ALTER TABLE reservations 
ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
ADD COLUMN home_id INTEGER REFERENCES homes(id) ON DELETE CASCADE;

-- Add indexes for the tenant fields
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_home ON reservations(home_id);

-- Update existing reservations to have tenant relationships
-- Assuming all existing reservations belong to customer 1, home 1 for now
-- This should be updated based on actual data mapping
UPDATE reservations 
SET customer_id = 1, home_id = 1 
WHERE customer_id IS NULL OR home_id IS NULL;

-- Make the fields NOT NULL after updating
ALTER TABLE reservations 
ALTER COLUMN customer_id SET NOT NULL,
ALTER COLUMN home_id SET NOT NULL;