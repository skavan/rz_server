-- Update a known admin user's password to a new bcrypt hash.
-- Usage: tsx scripts/run-sql.ts scripts/sql/reset-admin-password.sql

-- Replace values below as needed. This uses suresh.kavan@gmail.com and a hash for 'Passw0rd!'
UPDATE users
SET password_hash = '$2a$10$5lD8CWBPlBLY0Y8y3MBDXe8YE9YD02Av.9.DtbEwIJqLLj2RarqUW'
WHERE lower(email) = 'suresh.kavan@gmail.com';

-- Optional: ensure is_active and session_version sane
UPDATE users
SET is_active = true, session_version = COALESCE(session_version, 0)
WHERE lower(email) = 'suresh.kavan@gmail.com';
