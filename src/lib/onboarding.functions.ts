import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingStatus = {
  hasMfa: boolean;
  hasExchange: boolean;
  hasRisk: boolean;
  hasSource: boolean;
  hasPlan: boolean;
  stepsDone: number;
  stepsTotal: number;
  complete: boolean;
};

export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingStatus> => {
    const sb = context.supabase;
    const uid = context.userId;

    const [ex, risk, channels, sub, mfa] = await Promise.all([
      sb.from("exchange_accounts").select("id", { count: "exact", head: true }).eq("user_id", uid),
      sb.from("user_risk_settings").select("user_id").eq("user_id", uid).maybeSingle(),
      sb.from("personal_signal_channels").select("id", { count: "exact", head: true }).eq("user_id", uid),
      sb
        .from("subscriptions")
        .select("id,status")
        .eq("user_id", uid)
        .in("status", ["active", "trialing"])
        .limit(1)
        .maybeSingle(),
      sb.auth.mfa.listFactors().catch(() => ({ data: { totp: [] as { status: string }[] } })),
    ]);

    // Also count platform sources linked via risk allowed_source_ids as "has source"
    const hasSource =
      (channels.count ?? 0) > 0 ||
      Boolean(
        risk.data &&
          Array.isArray((risk.data as { allowed_source_ids?: string[] }).allowed_source_ids) &&
          ((risk.data as { allowed_source_ids?: string[] }).allowed_source_ids?.length ?? 0) > 0,
      );

    const hasMfa = Boolean(
      (mfa as { data?: { totp?: { status: string }[] } })?.data?.totp?.some((f) => f.status === "verified"),
    );
    const hasExchange = (ex.count ?? 0) > 0;
    const hasRisk = Boolean(risk.data);
    const hasPlan = Boolean(sub.data);

    const flags = [hasMfa, hasExchange, hasRisk, hasSource, hasPlan];
    const stepsDone = flags.filter(Boolean).length;
    return {
      hasMfa,
      hasExchange,
      hasRisk,
      hasSource,
      hasPlan,
      stepsDone,
      stepsTotal: 5,
      complete: stepsDone >= 4, // MFA optional for "complete" feel — require 4 of 5
    };
  });
