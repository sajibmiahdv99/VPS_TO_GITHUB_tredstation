
-- exchange_accounts: column-level SELECT/UPDATE, exclude credentials
REVOKE SELECT, UPDATE, INSERT ON public.exchange_accounts FROM authenticated;
GRANT SELECT (id, user_id, label, exchange_code, status, permissions, validated_at, last_balance_sync_at, last_error, last_balance_error, execution_mode, created_at, updated_at) ON public.exchange_accounts TO authenticated;
GRANT INSERT (id, user_id, label, exchange_code, status, permissions, encrypted_api_key, encrypted_api_secret, passphrase, execution_mode, created_at, updated_at) ON public.exchange_accounts TO authenticated;
GRANT UPDATE (label, status, permissions, encrypted_api_key, encrypted_api_secret, passphrase, execution_mode, updated_at) ON public.exchange_accounts TO authenticated;
GRANT DELETE ON public.exchange_accounts TO authenticated;

-- telegram_accounts: column-level SELECT, exclude session/phone secrets
REVOKE SELECT, UPDATE, INSERT ON public.telegram_accounts FROM authenticated;
GRANT SELECT (id, user_id, label, tg_user_id, tg_username, masked_phone, status, requires_2fa, last_error, sync_info, created_at, updated_at) ON public.telegram_accounts TO authenticated;
GRANT INSERT (id, user_id, label, tg_user_id, tg_username, masked_phone, status, requires_2fa, encrypted_session, phone_e164, phone_code_hash, session_ref, last_error, sync_info, created_at, updated_at) ON public.telegram_accounts TO authenticated;
GRANT UPDATE (label, status, requires_2fa, last_error, sync_info, updated_at) ON public.telegram_accounts TO authenticated;
GRANT DELETE ON public.telegram_accounts TO authenticated;

-- affiliates: restrict UPDATE to payout_method only
REVOKE UPDATE ON public.affiliates FROM authenticated;
GRANT UPDATE (payout_method, updated_at) ON public.affiliates TO authenticated;

-- profiles: split policy and restrict UPDATE to safe columns
DROP POLICY IF EXISTS profiles_self_rw ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
REVOKE UPDATE, INSERT ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, timezone, locale, updated_at) ON public.profiles TO authenticated;

-- support_tickets: split policy and restrict UPDATE to user-editable columns
DROP POLICY IF EXISTS st_self_rw ON public.support_tickets;
CREATE POLICY st_self_select ON public.support_tickets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY st_self_insert ON public.support_tickets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY st_self_update ON public.support_tickets FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE UPDATE ON public.support_tickets FROM authenticated;
GRANT UPDATE (subject, description, category, updated_at) ON public.support_tickets TO authenticated;
