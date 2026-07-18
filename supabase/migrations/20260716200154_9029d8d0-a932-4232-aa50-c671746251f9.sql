
-- =========================================================
-- PART A: signup_blocked_networks + before-user-created hook
-- =========================================================
CREATE TABLE public.signup_blocked_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr cidr NOT NULL,
  country_code text,
  reason text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX signup_blocked_networks_cidr_idx ON public.signup_blocked_networks USING gist (cidr inet_ops);

GRANT SELECT ON public.signup_blocked_networks TO authenticated;
GRANT ALL ON public.signup_blocked_networks TO service_role;

ALTER TABLE public.signup_blocked_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_networks_admin_select"
  ON public.signup_blocked_networks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Writes go through service-role only (admin server functions).

-- Auth hook function: called by Supabase Auth with { user_id, metadata: { ip_address, ... }, ... }
CREATE OR REPLACE FUNCTION public.hook_restrict_signup_by_network(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_ip inet;
  match_row record;
  msg text;
BEGIN
  BEGIN
    client_ip := (event->'metadata'->>'ip_address')::inet;
  EXCEPTION WHEN others THEN
    client_ip := NULL;
  END;

  IF client_ip IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT reason INTO match_row
  FROM public.signup_blocked_networks
  WHERE client_ip << cidr
  LIMIT 1;

  IF FOUND THEN
    msg := COALESCE(match_row.reason, 'Signups are not available in your region.');
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', msg,
        'http_code', 403
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

-- Required grants for Auth hooks
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_by_network(jsonb) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_by_network(jsonb) TO supabase_auth_admin;

-- NOTE: enable this function as the "before user created" hook in
-- Supabase Dashboard → Auth → Hooks. This project's supabase/config.toml
-- has no [auth.hook.*] section, so wiring is done via the dashboard.

-- =========================================================
-- PART B: kyc_verifications
-- =========================================================
CREATE TABLE public.kyc_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','pending','verified','rejected')),
  external_reference_id text,
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kyc_verifications TO authenticated;
GRANT ALL ON public.kyc_verifications TO service_role;

ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kyc_self_select"
  ON public.kyc_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE go through service-role only.

CREATE TRIGGER kyc_verifications_set_updated_at
BEFORE UPDATE ON public.kyc_verifications
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
