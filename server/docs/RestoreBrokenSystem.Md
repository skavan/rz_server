Option A (fast/hotfix): keep postgres for now, but ensure queries run under app_role

In pgAdmin, run:
GRANT app_role TO postgres;
In .env, add:
APP_DB_ROLE=app_role
This lets the server keep using postgres, but it will SET LOCAL ROLE app_role per request so RLS behavior is correct. Use this only as a temporary bridge.
Option B (recommended): switch the server to app_user

In pgAdmin, set a new password for app_user (if you don’t know it):
ALTER ROLE app_user WITH LOGIN PASSWORD 'YOUR_NEW_STRONG_PASSWORD';
Update .env:
DATABASE_URL=postgresql://app_user:YOUR_NEW_STRONG_PASSWORD@YOUR_HOST:5432/rental_inventory
APP_DB_ROLE=app_role
Optionally, set multiple dev origins: CLIENT_URLS=http://localhost:3000,http://localhost:3001
Tip: URL-encode special characters in the password.
This uses least-privilege and ensures RLS via SET LOCAL ROLE app_role (since app_role is NOINHERIT).