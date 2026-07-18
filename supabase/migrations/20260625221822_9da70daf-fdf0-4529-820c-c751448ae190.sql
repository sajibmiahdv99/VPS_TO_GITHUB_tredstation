
-- 1) Remove admin SELECT policy on exchange_accounts. Admin access uses supabaseAdmin (service role) only.
DROP POLICY IF EXISTS ex_admin_read ON public.exchange_accounts;

-- 2) Restrict authenticated SELECT on profiles.email. Users obtain their own email via auth.users (supabase.auth.getUser()).
REVOKE SELECT, UPDATE ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, timezone, locale, referral_code, is_active, last_login_at, created_at, updated_at) ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, timezone, locale) ON public.profiles TO authenticated;
