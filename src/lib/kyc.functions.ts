import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type KycStatus = "not_started" | "pending" | "verified" | "rejected";

export const getMyKycStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("kyc_verifications")
      .select("status,provider,submitted_at,verified_at,rejected_reason,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        status: "not_started" as KycStatus,
        provider: null as string | null,
        submitted_at: null as string | null,
        verified_at: null as string | null,
        rejected_reason: null as string | null,
        updated_at: null as string | null,
      };
    }
    return { ...data, status: data.status as KycStatus };
  });

export const requestKycVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("KYC verification is not yet available — check back soon.");
  });
