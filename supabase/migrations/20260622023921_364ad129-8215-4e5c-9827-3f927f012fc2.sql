ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tp_levels jsonb,
  ADD COLUMN IF NOT EXISTS tp_levels_hit integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.tp_levels IS 'Array of partial take-profit levels: [{price: number, percent: number (0-100), hit: boolean}]. Worker fills partials in order and updates hit=true + tp_levels_hit counter.';
COMMENT ON COLUMN public.orders.tp_levels_hit IS 'Number of partial TP levels already filled by the execution worker.';