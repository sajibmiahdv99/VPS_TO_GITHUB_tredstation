import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  capabilitiesForRoles,
  hasCapability,
  isStaff,
  isSuperRole,
  type Capability,
  type StaffRole,
  STAFF_ROLE_LABELS,
} from "@/lib/auth/permissions";

export type AppRole = StaffRole;

export type MyRolesResult = {
  roles: AppRole[];
  isAdmin: boolean; // any staff (can open admin area)
  isSuperAdmin: boolean;
  isFinanceAdmin: boolean;
  isOpsAdmin: boolean;
  capabilities: Capability[];
  roleLabels: string[];
};

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyRolesResult> => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as AppRole);
    const caps = capabilitiesForRoles(roles);
    return {
      roles,
      isAdmin: isStaff(roles),
      isSuperAdmin: isSuperRole(roles),
      isFinanceAdmin: hasCapability(roles, "view_payments"),
      isOpsAdmin: hasCapability(roles, "support_tickets"),
      capabilities: Array.from(caps),
      roleLabels: roles.map((r) => STAFF_ROLE_LABELS[r] ?? r),
    };
  });

export async function loadUserRoles(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { role: string }) => r.role as AppRole);
}

export async function assertCapability(
  supabase: { from: (t: string) => any; rpc?: (...a: unknown[]) => unknown },
  userId: string,
  cap: Capability,
): Promise<AppRole[]> {
  const roles = await loadUserRoles(supabase, userId);
  if (!hasCapability(roles, cap)) {
    throw new Error(`Forbidden: requires ${cap}`);
  }
  return roles;
}

export async function assertStaff(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<AppRole[]> {
  const roles = await loadUserRoles(supabase, userId);
  if (!isStaff(roles)) throw new Error("Forbidden: staff role required");
  return roles;
}

export const listAssignableStaffRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCapability(context.supabase, context.userId, "manage_admins");
    return [
      { code: "super_admin", label: "Super admin" },
      { code: "finance_admin", label: "Finance admin" },
      { code: "operations_admin", label: "Operations admin" },
      { code: "moderator", label: "Moderator" },
      { code: "user", label: "User" },
    ];
  });
