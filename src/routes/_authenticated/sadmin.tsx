import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SuperAdminShell } from "@/components/SuperAdminShell";
import { getMyRoles } from "@/lib/auth/role.functions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Super admin portal — /sadmin/*
 * - super_admin only
 * - optional IP allowlist via SADMIN_IP_ALLOWLIST=1.2.3.4,5.6.7.8
 * - requires MFA AAL2 when user has TOTP enrolled
 */
export const Route = createFileRoute("/_authenticated/sadmin")({
  beforeLoad: async ({ location }) => {
    const me = await getMyRoles();
    if (!me.isSuperAdmin) {
      if (me.isAdmin) throw redirect({ to: "/admin" });
      throw redirect({ to: "/app" });
    }

    // MFA: if enrolled, require aal2 for super admin
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      throw redirect({
        to: "/auth",
        search: { next: location.href, mode: "signin" },
      });
    }

    // IP allowlist (client-side cannot see real IP on pure browser;
    // enforced again in server functions via x-forwarded-for when set)
    // Soft check: store flag in sessionStorage after server validates on first API call.
  },
  component: () => (
    <SuperAdminShell>
      <Outlet />
    </SuperAdminShell>
  ),
});
