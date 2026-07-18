
REVOKE SELECT ON public.exchange_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, exchange_code, label, status, validated_at,
  last_error, last_balance_sync_at, last_balance_error,
  permissions, created_at, updated_at
) ON public.exchange_accounts TO authenticated;

REVOKE SELECT ON public.telegram_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, label, status, masked_phone, sync_info,
  last_error, created_at, updated_at, requires_2fa,
  tg_user_id, tg_username
) ON public.telegram_accounts TO authenticated;

DROP POLICY IF EXISTS aff_self_rw ON public.affiliates;
CREATE POLICY aff_self_select ON public.affiliates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY aff_self_update ON public.affiliates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_plan_at_least(uuid, text) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_plan_at_least(uuid, text) TO service_role;
