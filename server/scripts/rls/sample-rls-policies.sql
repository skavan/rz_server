-- Sample RLS setup for multi-tenant isolation using per-request GUCs
--
-- This script is SAFE to run multiple times; it uses CREATE POLICY IF NOT EXISTS
-- where available and guards with EXISTS checks.
--
-- Concepts
-- - app.customer_id (text) and app.home_ids (comma-separated text) are set per request.
-- - Policies reference these GUCs via current_setting(..., missing_ok := true).
-- - When home_ids is empty or null, allow-by-customer only.
-- - Use a dedicated application role (e.g., app_role) that is NOT BYPASSRLS.
--
-- Prereqs
-- - Create an application role and grant it to your DB user/connection, e.g.:
--     CREATE ROLE app_role NOINHERIT;
--     GRANT app_role TO CURRENT_USER; -- or to the DB user used by the API
--
-- Note: Adjust schema/table names to your schema. Example uses public.products.

-- ============================================
-- CATEGORIES TABLE RLS POLICIES
-- ============================================

-- Ensure row level security is enabled
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Read policy (SELECT) for categories
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'tenant_read'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.categories
        FOR SELECT TO PUBLIC
        USING (
          coalesce(current_setting('app.customer_id', true), '')::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_read ON public.categories
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    END IF;
    
    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END;
$do$;

--> statement-breakpoint

-- Write policy (INSERT) for categories
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'tenant_write'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.categories
        FOR INSERT TO PUBLIC
        WITH CHECK (
          coalesce(current_setting('app.customer_id', true), '')::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_write ON public.categories
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    END IF;
    
    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END;
$do$;

--> statement-breakpoint

-- Update policy (UPDATE) for categories
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'tenant_update'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.categories
        FOR UPDATE TO PUBLIC
        USING (
          coalesce(current_setting('app.customer_id', true), '')::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )
        WITH CHECK (
          coalesce(current_setting('app.customer_id', true), '')::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_update ON public.categories
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    END IF;
    
    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END;
$do$;

--> statement-breakpoint

-- Delete policy (DELETE) for categories
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'tenant_delete'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.categories
        FOR DELETE TO PUBLIC
        USING (
          coalesce(current_setting('app.customer_id', true), '')::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.categories
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    END IF;
    
    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END;
$do$;

--> statement-breakpoint

-- Ensure row level security is enabled
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Optional: drop existing policies for clean re-run (comment out if undesired)
-- DROP POLICY IF EXISTS tenant_read ON public.products;
-- DROP POLICY IF EXISTS tenant_write ON public.products;
-- DROP POLICY IF EXISTS tenant_update ON public.products;

-- Read policy (SELECT):
-- Dynamically adapts based on presence of customer_id and/or home_id columns
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'tenant_read'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.products
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.products
        FOR SELECT TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_read ON public.products
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.products has neither customer_id nor home_id; skipping tenant_read policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Delete policy (DELETE): adapts to available columns
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'tenant_delete'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.products
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.products
        FOR DELETE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.products
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.products has neither customer_id nor home_id; skipping tenant_delete policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Insert policy (INSERT): adapts to available columns
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'tenant_write'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.products
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.products
        FOR INSERT TO PUBLIC
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_write ON public.products
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.products has neither customer_id nor home_id; skipping tenant_write policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Update policy (UPDATE): adapts to available columns
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'tenant_update'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.products
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.products
        FOR UPDATE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_update ON public.products
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.products has neither customer_id nor home_id; skipping tenant_update policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Grants: typical pattern is to allow the app role to read/write, relying on RLS to filter rows
-- Adjust to your needs.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
  EXECUTE $$GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO PUBLIC$$; -- or app_role
  ELSE
    RAISE NOTICE 'Table public.products not found; skipping GRANT';
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint


-- ============================================
-- SKUS TABLE
-- ============================================

-- Ensure row level security is enabled
ALTER TABLE IF EXISTS public.skus ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Read policy (SELECT) for skus
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'skus' AND policyname = 'tenant_read'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.skus
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.skus
        FOR SELECT TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_read ON public.skus
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.skus has neither customer_id nor home_id; skipping tenant_read policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Delete policy (DELETE) for skus
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'skus' AND policyname = 'tenant_delete'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.skus
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.skus
        FOR DELETE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.skus
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.skus has neither customer_id nor home_id; skipping tenant_delete policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Insert policy (INSERT) for skus
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'skus' AND policyname = 'tenant_write'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.skus
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.skus
        FOR INSERT TO PUBLIC
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_write ON public.skus
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.skus has neither customer_id nor home_id; skipping tenant_write policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Update policy (UPDATE) for skus
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'skus' AND policyname = 'tenant_update'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.skus
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.skus
        FOR UPDATE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_update ON public.skus
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.skus has neither customer_id nor home_id; skipping tenant_update policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Grants
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'skus'
  ) THEN
  EXECUTE $$GRANT SELECT, INSERT, UPDATE, DELETE ON public.skus TO PUBLIC$$; -- or app_role
  ELSE
    RAISE NOTICE 'Table public.skus not found; skipping GRANT';
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint


-- ============================================
-- LOCATIONS TABLE
-- ============================================

-- Ensure row level security is enabled
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Read policy (SELECT) for locations
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'tenant_read'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.locations
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.locations
        FOR SELECT TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_read ON public.locations
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.locations has neither customer_id nor home_id; skipping tenant_read policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Delete policy (DELETE) for locations
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'tenant_delete'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.locations
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.locations
        FOR DELETE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.locations
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.locations has neither customer_id nor home_id; skipping tenant_delete policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Insert policy (INSERT) for locations
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'tenant_write'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.locations
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.locations
        FOR INSERT TO PUBLIC
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_write ON public.locations
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.locations has neither customer_id nor home_id; skipping tenant_write policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Update policy (UPDATE) for locations
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'tenant_update'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.locations
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.locations
        FOR UPDATE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_update ON public.locations
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.locations has neither customer_id nor home_id; skipping tenant_update policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Grants
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'locations'
  ) THEN
  EXECUTE $$GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO PUBLIC$$; -- or app_role
  ELSE
    RAISE NOTICE 'Table public.locations not found; skipping GRANT';
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint


-- ============================================
-- INVENTORY ITEMS TABLE
-- ============================================

-- Ensure row level security is enabled
ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Read policy (SELECT) for inventory_items
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'tenant_read'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.inventory_items
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_read ON public.inventory_items
        FOR SELECT TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_read ON public.inventory_items
        FOR SELECT TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.inventory_items has neither customer_id nor home_id; skipping tenant_read policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Delete policy (DELETE) for inventory_items
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'tenant_delete'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.inventory_items
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.inventory_items
        FOR DELETE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_delete ON public.inventory_items
        FOR DELETE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.inventory_items has neither customer_id nor home_id; skipping tenant_delete policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Insert policy (INSERT) for inventory_items
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'tenant_write'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.inventory_items
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_write ON public.inventory_items
        FOR INSERT TO PUBLIC
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_write ON public.inventory_items
        FOR INSERT TO PUBLIC
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.inventory_items has neither customer_id nor home_id; skipping tenant_write policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Update policy (UPDATE) for inventory_items
DO $do$
DECLARE
  has_cust boolean;
  has_home boolean;
  sql_text text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'customer_id'
  ) INTO has_cust;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'home_id'
  ) INTO has_home;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'tenant_update'
  ) THEN
    IF has_cust AND has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.inventory_items
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
          AND (
            coalesce(current_setting('app.home_ids', true), '') = ''
            OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
          )
        )$$;
    ELSIF has_home THEN
      sql_text := $$CREATE POLICY tenant_update ON public.inventory_items
        FOR UPDATE TO PUBLIC
        USING (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )
        WITH CHECK (
          coalesce(current_setting('app.home_ids', true), '') = ''
          OR home_id = ANY (string_to_array(current_setting('app.home_ids', true), ',')::int[])
        )$$;
    ELSIF has_cust THEN
      sql_text := $$CREATE POLICY tenant_update ON public.inventory_items
        FOR UPDATE TO PUBLIC
        USING (
          (current_setting('app.customer_id', true))::int = customer_id
        )
        WITH CHECK (
          (current_setting('app.customer_id', true))::int = customer_id
        )$$;
    ELSE
      RAISE NOTICE 'Table public.inventory_items has neither customer_id nor home_id; skipping tenant_update policy';
      sql_text := NULL;
    END IF;

    IF sql_text IS NOT NULL THEN
      EXECUTE sql_text;
    END IF;
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint

-- Grants
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
  ) THEN
  EXECUTE $$GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO PUBLIC$$; -- or app_role
  ELSE
    RAISE NOTICE 'Table public.inventory_items not found; skipping GRANT';
  END IF;
END
$do$ LANGUAGE plpgsql;

--> statement-breakpoint
