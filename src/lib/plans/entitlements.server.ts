import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { featuresFromPlan, type PlanFeatures } from "@/lib/plans/entitlements";

export type UserEntitlements = {
  planCode: string;
  planName: string;
  status: string | null;
  features: PlanFeatures;
};

export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_code,status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planCode = sub?.plan_code ?? "free_trial";
  const { data: plan } = await supabaseAdmin
    .from("plans")
    .select("code,name,features")
    .eq("code", planCode)
    .maybeSingle();

  const features = featuresFromPlan(
    planCode,
    (plan as { features?: Record<string, unknown> } | null)?.features as Record<string, unknown> | null,
  );

  return {
    planCode,
    planName: plan?.name ?? planCode,
    status: sub?.status ?? null,
    features,
  };
}
