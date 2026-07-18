import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertCapability, assertStaff, loadUserRoles } from "@/lib/auth/role.functions";
import type { Capability } from "@/lib/auth/permissions";

type Sb = SupabaseClient<Database>;

/** @deprecated prefer assertCapability — kept for gradual migration */
export async function assertAdmin(sb: Sb, userId: string) {
  return assertStaff(sb, userId);
}

export async function requireCap(sb: Sb, userId: string, cap: Capability) {
  return assertCapability(sb, userId, cap);
}

export { loadUserRoles, assertCapability, assertStaff };
