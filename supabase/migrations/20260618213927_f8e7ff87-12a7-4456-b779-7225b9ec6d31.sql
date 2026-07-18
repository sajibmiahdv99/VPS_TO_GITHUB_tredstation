-- orders: lifecycle columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS client_order_id text,
  ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modify_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trailing_stop_distance numeric(28,10),
  ADD COLUMN IF NOT EXISTS trailing_stop_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trailing_high_watermark numeric(28,10),
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_idempotency_key
  ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_orders_parent ON public.orders(parent_order_id);
CREATE INDEX IF NOT EXISTS ix_orders_user_status ON public.orders(user_id, status);

-- order_events: full lifecycle audit
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oe_self_read" ON public.order_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "oe_self_insert" ON public.order_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "oe_admin_read" ON public.order_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ix_order_events_order ON public.order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_order_events_user ON public.order_events(user_id, created_at DESC);

-- State machine: validate transitions on orders.status update
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  allowed := (OLD.status, NEW.status) IN (
    ('queued','dispatched'), ('queued','cancelled'), ('queued','rejected'),
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
$$;

DROP TRIGGER IF EXISTS orders_validate_transition ON public.orders;
CREATE TRIGGER orders_validate_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_status_transition();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
ALTER TABLE public.order_events REPLICA IDENTITY FULL;