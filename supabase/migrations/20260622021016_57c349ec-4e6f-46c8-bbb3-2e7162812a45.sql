
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    substr(md5(NEW.id::text || clock_timestamp()::text), 1, 10)
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_balances (user_id, available_balance, pending_commission, pending_withdrawal, total_earned)
  VALUES (NEW.id, 9748, 320, 0, 12450)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $function$;

INSERT INTO public.user_balances (user_id, available_balance, pending_commission, pending_withdrawal, total_earned)
SELECT u.id, 9748, 320, 0, 12450
FROM auth.users u
LEFT JOIN public.user_balances b ON b.user_id = u.id
WHERE b.user_id IS NULL;
