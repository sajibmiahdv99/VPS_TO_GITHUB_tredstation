
-- exchange_accounts: revoke SELECT on sensitive columns from authenticated
REVOKE SELECT ON public.exchange_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, exchange_code, label, status, permissions, validated_at,
  last_error, created_at, updated_at, last_balance_sync_at, last_balance_error,
  execution_mode
) ON public.exchange_accounts TO authenticated;

-- telegram_accounts: revoke SELECT on sensitive columns from authenticated
REVOKE SELECT ON public.telegram_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, label, status, masked_phone, sync_info, last_error,
  created_at, updated_at, requires_2fa, tg_user_id, tg_username
) ON public.telegram_accounts TO authenticated;

-- affiliates: restrict self-UPDATE to payout_method + updated_at only
REVOKE UPDATE ON public.affiliates FROM authenticated;
GRANT UPDATE (payout_method, updated_at) ON public.affiliates TO authenticated;
-- Admin path uses service_role (supabaseAdmin), which retains full privileges.
