-- ============================================
-- PRODUCTS TABLE RLS POLICIES
-- ============================================

-- Enable row level security
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

-- Read policy (SELECT): adapts to available columns
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
      RAISE NOTICE 'Created policy tenant_read on products';
    END IF;
  END IF;
END
$do$;

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
      RAISE NOTICE 'Created policy tenant_delete on products';
    END IF;
  END IF;
END
$do$;

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
      RAISE NOTICE 'Created policy tenant_write on products';
    END IF;
  END IF;
END
$do$;

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
      RAISE NOTICE 'Created policy tenant_update on products';
    END IF;
  END IF;
END
$do$;

-- Grants
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
  EXECUTE $$GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO PUBLIC$$;
  RAISE NOTICE 'Granted permissions on products';
  ELSE
    RAISE NOTICE 'Table public.products not found; skipping GRANT';
  END IF;
END
$do$;
