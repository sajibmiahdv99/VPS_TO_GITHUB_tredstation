ALTER TABLE public.user_risk_settings
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS entry_levels_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS entry_range_percent numeric,
  ADD COLUMN IF NOT EXISTS entry_distribution text NOT NULL DEFAULT 'equal';

ALTER TABLE public.user_risk_settings
  DROP CONSTRAINT IF EXISTS user_risk_settings_entry_mode_check,
  ADD CONSTRAINT user_risk_settings_entry_mode_check CHECK (entry_mode IN ('single','scale_in'));

ALTER TABLE public.user_risk_settings
  DROP CONSTRAINT IF EXISTS user_risk_settings_entry_distribution_check,
  ADD CONSTRAINT user_risk_settings_entry_distribution_check CHECK (entry_distribution IN ('equal','front_loaded','back_loaded'));

ALTER TABLE public.user_risk_settings
  DROP CONSTRAINT IF EXISTS user_risk_settings_entry_levels_count_check,
  ADD CONSTRAINT user_risk_settings_entry_levels_count_check CHECK (entry_levels_count BETWEEN 1 AND 10);