
ALTER TABLE public.orders DISABLE TRIGGER USER;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_side_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;

UPDATE public.orders SET
  status = CASE lower(status) WHEN 'pending' THEN 'open' WHEN 'failed' THEN 'rejected' ELSE lower(status) END,
  side = CASE lower(side) WHEN 'buy' THEN 'long' WHEN 'sell' THEN 'short' ELSE lower(side) END,
  order_type = lower(order_type);

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('queued','dispatched','open','partial','filled','rejected','cancelled','closed'));
ALTER TABLE public.orders ADD CONSTRAINT orders_side_check
  CHECK (side IN ('long','short'));
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('market','limit'));

ALTER TABLE public.orders ENABLE TRIGGER USER;
