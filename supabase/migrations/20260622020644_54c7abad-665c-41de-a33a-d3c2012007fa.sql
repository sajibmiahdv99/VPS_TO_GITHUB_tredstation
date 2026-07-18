DROP POLICY IF EXISTS po_self_insert ON public.payouts;
CREATE POLICY po_self_insert ON public.payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND amount > 0
  );