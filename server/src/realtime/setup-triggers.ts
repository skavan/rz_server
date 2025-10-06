import { pool } from '../db/index.js';

// Idempotently create a generic trigger function and per-table triggers
export async function ensureDataChangeTriggers() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION notify_data_change() RETURNS trigger AS $$
      DECLARE
        v_op text := TG_OP;
        v_type text;
        v_id bigint;
        v_home_id bigint;
        v_customer_id bigint;
        v_payload jsonb;
      BEGIN
        IF v_op = 'INSERT' THEN
          v_type := 'create';
          v_id := NEW.id;
          BEGIN v_home_id := NEW.home_id; EXCEPTION WHEN undefined_column THEN v_home_id := NULL; END;
          BEGIN v_customer_id := NEW.customer_id; EXCEPTION WHEN undefined_column THEN v_customer_id := NULL; END;
        ELSIF v_op = 'UPDATE' THEN
          v_type := 'update';
          v_id := NEW.id;
          BEGIN v_home_id := NEW.home_id; EXCEPTION WHEN undefined_column THEN v_home_id := NULL; END;
          BEGIN v_customer_id := NEW.customer_id; EXCEPTION WHEN undefined_column THEN v_customer_id := NULL; END;
        ELSIF v_op = 'DELETE' THEN
          v_type := 'delete';
          v_id := OLD.id;
          BEGIN v_home_id := OLD.home_id; EXCEPTION WHEN undefined_column THEN v_home_id := NULL; END;
          BEGIN v_customer_id := OLD.customer_id; EXCEPTION WHEN undefined_column THEN v_customer_id := NULL; END;
        END IF;

        v_payload := jsonb_build_object(
          'resource', TG_TABLE_NAME,
          'type', v_type,
          'id', v_id,
          'homeId', v_home_id,
          'customerId', v_customer_id
        );

        PERFORM pg_notify('data_change', v_payload::text);
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Helper to create a trigger if it doesn't exist
  async function createTriggerIfMissing(table: string) {
      await client.query(`
        DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'tr_notify_${table}'
        ) THEN
          EXECUTE 'CREATE TRIGGER tr_notify_${table} AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION notify_data_change()';
        END IF;
        END $$;
      `);
    }

  await createTriggerIfMissing('products');
  await createTriggerIfMissing('inventory_items');
  await createTriggerIfMissing('locations');
  await createTriggerIfMissing('homes');
  await createTriggerIfMissing('product_components');
  await createTriggerIfMissing('vendors');
  await createTriggerIfMissing('brands');
  await createTriggerIfMissing('skus');
  await createTriggerIfMissing('sku_components');

    // Optional: broaden scope to all public tables when enabled
    if (process.env.ENABLE_BROAD_TRIGGERS === '1') {
      try {
        const { rows } = await client.query<{ table_name: string }>(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_type = 'BASE TABLE'
             AND table_name NOT LIKE 'pg_%'
             AND table_name NOT LIKE 'sql_%'`
        );
        for (const r of rows) {
          await createTriggerIfMissing(r.table_name);
        }
        console.log(`✅ Broad triggers ensured for ${rows.length} public tables`);
      } catch (e) {
        console.warn('⚠️ Failed to ensure broad triggers:', (e as any)?.message || e);
      }
    }

    console.log('✅ Data change triggers ensured (products, inventory_items, locations, homes, product_components, vendors, brands, skus, sku_components)');
  } finally {
    client.release();
  }
}
