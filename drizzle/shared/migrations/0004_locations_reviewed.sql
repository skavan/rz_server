ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reviewed_date date;
