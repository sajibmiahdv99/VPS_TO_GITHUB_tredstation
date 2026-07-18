/** Plan feature entitlements for AGENT TRED */

export type AnalyticsDepth = "basic" | "standard" | "advanced" | "premium";
export type AdvancedRisk = boolean | "limited" | false;

export type PlanFeatures = {
  max_exchange_accounts: number;
  platform_managed_sources: boolean;
  user_connected_telegram: boolean;
  advanced_risk_controls: AdvancedRisk;
  max_open_positions_limit: number | null; // null = unlimited
  analytics_depth: AnalyticsDepth;
  affiliate_access: boolean;
  priority_support: boolean;
  custom_risk_templates: boolean;
  premium_source_access: boolean;
};

export const PLAN_DEFAULTS: Record<string, PlanFeatures> = {
  free_trial: {
    max_exchange_accounts: 1,
    platform_managed_sources: true,
    user_connected_telegram: false,
    advanced_risk_controls: false,
    max_open_positions_limit: 3,
    analytics_depth: "basic",
    affiliate_access: false,
    priority_support: false,
    custom_risk_templates: false,
    premium_source_access: false,
  },
  starter: {
    max_exchange_accounts: 1,
    platform_managed_sources: true,
    user_connected_telegram: false,
    advanced_risk_controls: "limited",
    max_open_positions_limit: 10,
    analytics_depth: "standard",
    affiliate_access: true,
    priority_support: false,
    custom_risk_templates: false,
    premium_source_access: false,
  },
  pro: {
    max_exchange_accounts: 3,
    platform_managed_sources: true,
    user_connected_telegram: true,
    advanced_risk_controls: true,
    max_open_positions_limit: 25,
    analytics_depth: "advanced",
    affiliate_access: true,
    priority_support: true,
    custom_risk_templates: true,
    premium_source_access: true,
  },
  premium_vip: {
    max_exchange_accounts: 10,
    platform_managed_sources: true,
    user_connected_telegram: true,
    advanced_risk_controls: true,
    max_open_positions_limit: null,
    analytics_depth: "premium",
    affiliate_access: true,
    priority_support: true,
    custom_risk_templates: true,
    premium_source_access: true,
  },
  // legacy aliases
  premium: {
    max_exchange_accounts: 3,
    platform_managed_sources: true,
    user_connected_telegram: true,
    advanced_risk_controls: true,
    max_open_positions_limit: 25,
    analytics_depth: "advanced",
    affiliate_access: true,
    priority_support: true,
    custom_risk_templates: true,
    premium_source_access: true,
  },
  professional: {
    max_exchange_accounts: 10,
    platform_managed_sources: true,
    user_connected_telegram: true,
    advanced_risk_controls: true,
    max_open_positions_limit: null,
    analytics_depth: "premium",
    affiliate_access: true,
    priority_support: true,
    custom_risk_templates: true,
    premium_source_access: true,
  },
};

export function featuresFromPlan(
  code: string | null | undefined,
  featuresJson?: Record<string, unknown> | null,
): PlanFeatures {
  const base = PLAN_DEFAULTS[code ?? "free_trial"] ?? PLAN_DEFAULTS.free_trial;
  if (!featuresJson || typeof featuresJson !== "object") return base;
  return {
    max_exchange_accounts: Number(featuresJson.max_exchange_accounts ?? base.max_exchange_accounts),
    platform_managed_sources: Boolean(
      featuresJson.platform_managed_sources ?? base.platform_managed_sources,
    ),
    user_connected_telegram: Boolean(
      featuresJson.user_connected_telegram ?? base.user_connected_telegram,
    ),
    advanced_risk_controls: (featuresJson.advanced_risk_controls ??
      base.advanced_risk_controls) as AdvancedRisk,
    max_open_positions_limit:
      featuresJson.max_open_positions_limit === null
        ? null
        : featuresJson.max_open_positions_limit !== undefined
          ? Number(featuresJson.max_open_positions_limit)
          : base.max_open_positions_limit,
    analytics_depth: (featuresJson.analytics_depth as AnalyticsDepth) ?? base.analytics_depth,
    affiliate_access: Boolean(featuresJson.affiliate_access ?? base.affiliate_access),
    priority_support: Boolean(featuresJson.priority_support ?? base.priority_support),
    custom_risk_templates: Boolean(
      featuresJson.custom_risk_templates ?? base.custom_risk_templates,
    ),
    premium_source_access: Boolean(
      featuresJson.premium_source_access ?? base.premium_source_access,
    ),
  };
}

export function formatPositionLimit(n: number | null): string {
  return n == null ? "Unlimited" : String(n);
}
