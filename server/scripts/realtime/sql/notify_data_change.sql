-- Creates or replaces a generic trigger function that NOTIFYs data_change with a compact JSON payload
CREATE OR REPLACE FUNCTION notify_data_change() RETURNS trigger AS $$
DECLARE
  v_op text := TG_OP;
  v_type text;
  v_id bigint;
  v_home_id bigint;
  v_payload jsonb;
  v_changed_cols text[];
BEGIN
  IF v_op = 'INSERT' THEN
    v_type := 'create';
    v_id := NEW.id;
    BEGIN v_home_id := NEW.home_id; EXCEPTION WHEN undefined_column THEN v_home_id := NULL; END;
  ELSIF v_op = 'UPDATE' THEN
    v_type := 'update';
    v_id := NEW.id;
    BEGIN v_home_id := NEW.home_id; EXCEPTION WHEN undefined_column THEN v_home_id := NULL; END;
    -- optional minimal diff without extensions
    v_changed_cols := ARRAY(
      SELECT key
      FROM jsonb_each(to_jsonb(NEW)) AS n(key, val)
      WHERE to_jsonb(OLD)->key IS DISTINCT FROM n.val
        AND key NOT IN ('updated_at')
    );
  ELSIF v_op = 'DELETE' THEN
    v_type := 'delete';
    v_id := OLD.id;
    BEGIN v_home_id := OLD.home_id; EXCEPTION WHEN undefined_column THEN v_home_id := NULL; END;
  END IF;

  v_payload := jsonb_build_object(
    'resource', TG_TABLE_NAME,
    'type', v_type,
    'id', v_id,
    'homeId', v_home_id
  );

  IF v_type = 'update' THEN
    v_payload := v_payload || jsonb_build_object('changedColumns', COALESCE(to_jsonb(v_changed_cols), '[]'::jsonb));
  END IF;

  PERFORM pg_notify('data_change', v_payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
