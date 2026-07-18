CREATE TABLE public.live_prices (
  exchange_code text NOT NULL,
  symbol text NOT NULL,
  price numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange_code, symbol)
);

GRANT SELECT ON public.live_prices TO authenticated;
GRANT ALL ON public.live_prices TO service_role;

ALTER TABLE public.live_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_prices_auth_read"
  ON public.live_prices
  FOR SELECT
  TO authenticated
  USING (true);