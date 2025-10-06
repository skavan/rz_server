-- ============================================
-- CATEGORIES TABLE RLS POLICIES
-- ============================================

-- Enable row level security
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;

-- Read policy (SELECT)
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
      RAISE NOTICE 'Created policy tenant_read on categories';
    END IF;
  END IF;
END;
$do$;

-- Write policy (INSERT)
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
      RAISE NOTICE 'Created policy tenant_write on categories';
    END IF;
  END IF;
END;
$do$;

-- Update policy (UPDATE)
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
      RAISE NOTICE 'Created policy tenant_update on categories';
    END IF;
  END IF;
END;
$do$;

-- Delete policy (DELETE)
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
      RAISE NOTICE 'Created policy tenant_delete on categories';
    END IF;
  END IF;
END;
$do$;
