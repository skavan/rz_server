ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_by_user_id integer REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_issues_deleted_at ON issues (deleted_at);
