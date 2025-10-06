-- Row Level Security Policies for skus table

ALTER TABLE IF EXISTS public.skus ENABLE ROW LEVEL SECURITY;

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

-- Completion notice  
DO $do$
BEGIN
  RAISE NOTICE 'RLS policies for public.skus created successfully';
END
$do$;
