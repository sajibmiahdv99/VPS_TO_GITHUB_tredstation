CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  allowed boolean := false;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  allowed := (OLD.status, NEW.status) IN (
    ('queued','dispatched'), ('queued','open'), ('queued','partial'), ('queued','filled'),
    ('queued','cancelled'), ('queued','rejected'),
    ('dispatched','open'), ('dispatched','partial'), ('dispatched','filled'),
    ('dispatched','rejected'), ('dispatched','cancelled'),
    ('open','partial'), ('open','filled'), ('open','cancelled'), ('open','closed'),
    ('partial','partial'), ('partial','filled'), ('partial','cancelled'), ('partial','closed'),
    ('filled','closed'), ('filled','partial')
  );
  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;
  NEW.version := COALESCE(OLD.version,1) + 1;
  NEW.last_event_at := now();
  RETURN NEW;
END;
$function$;