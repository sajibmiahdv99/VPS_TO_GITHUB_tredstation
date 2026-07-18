-- exchange_accounts: hide encrypted creds from authenticated SELECT
REVOKE SELECT ON public.exchange_accounts FROM authenticated;
GRANT SELECT (id, user_id, exchange_code, label, status, permissions, validated_at, last_error, created_at, updated_at, last_balance_sync_at, last_balance_error, execution_mode) ON public.exchange_accounts TO authenticated;

-- telegram_accounts: hide session/phone secrets from authenticated SELECT
REVOKE SELECT ON public.telegram_accounts FROM authenticated;
GRANT SELECT (id, user_id, label, status, masked_phone, session_ref, sync_info, last_error, created_at, updated_at, requires_2fa, tg_user_id, tg_username) ON public.telegram_accounts TO authenticated;

-- affiliates: restrict user-writable columns to payout_method + updated_at
REVOKE UPDATE ON public.affiliates FROM authenticated;
GRANT SELECT ON public.affiliates TO authenticated;
GRANT INSERT ON public.affiliates TO authenticated;
GRANT UPDATE (payout_method, updated_at) ON public.affiliates TO authenticated;