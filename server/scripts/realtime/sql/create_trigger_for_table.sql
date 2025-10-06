-- :table will be replaced at runtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_notify_{{table}}') THEN
    EXECUTE 'CREATE TRIGGER tr_notify_{{table}} '
         || 'AFTER INSERT OR UPDATE OR DELETE ON public.{{table}} '
         || 'FOR EACH ROW EXECUTE FUNCTION notify_data_change()';
  END IF;
END;
$$;
