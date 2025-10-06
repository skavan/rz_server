-- Row Level Security Policies for inventory_items table

ALTER TABLE IF EXISTS public.inventory_items ENABLE ROW LEVEL SECURITY;

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

-- Completion notice
DO $do$
BEGIN
  RAISE NOTICE 'RLS policies for public.inventory_items created successfully';
END
$do$;
