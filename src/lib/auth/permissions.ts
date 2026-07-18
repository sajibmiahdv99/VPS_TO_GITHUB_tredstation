/**
 * Staff capability matrix for AGENT TRED.
 * Legacy role "admin" is treated as super_admin.
 */

export type StaffRole =
  | "admin"
  | "super_admin"
  | "finance_admin"
  | "operations_admin"
  | "moderator"
  | "user";

export type Capability =
  | "platform_settings"
  | "manage_admins"
  | "feature_flags"
  | "signal_sources"
  | "suspend_users"
  | "pause_system"
  | "all_dashboards"
  | "emergency_controls"
  | "view_invoices"
  | "view_payments"
  | "view_revenue"
  | "review_payouts"
  | "approve_payouts"
  | "finance_reports"
  | "support_tickets"
  | "parsed_signals"
  | "trade_monitoring"
  | "affiliate_eligibility"
  | "source_status"
  | "ops_user_state"
  | "access_admin_area"
  | "manage_promos";

const SUPER_CAPS: Capability[] = [
  "access_admin_area",
  "platform_settings",
  "manage_admins",
  "manage_promos",
  "feature_flags",
  "signal_sources",
  "suspend_users",
  "pause_system",
  "all_dashboards",
  "emergency_controls",
  "view_invoices",
  "view_payments",
  "view_revenue",
  "review_payouts",
  "approve_payouts",
  "finance_reports",
  "support_tickets",
  "parsed_signals",
  "trade_monitoring",
  "affiliate_eligibility",
  "source_status",
  "ops_user_state",
];

const FINANCE_CAPS: Capability[] = [
  "access_admin_area",
  "view_invoices",
  "view_payments",
  "view_revenue",
  "review_payouts",
  "approve_payouts",
  "finance_reports",
];

const OPS_CAPS: Capability[] = [
  "access_admin_area",
  "support_tickets",
  "parsed_signals",
  "trade_monitoring",
  "affiliate_eligibility",
  "source_status",
  "ops_user_state",
];

export function isSuperRole(roles: string[]): boolean {
  return roles.includes("super_admin") || roles.includes("admin");
}

export function isFinanceRole(roles: string[]): boolean {
  return isSuperRole(roles) || roles.includes("finance_admin");
}

export function isOpsRole(roles: string[]): boolean {
  return isSuperRole(roles) || roles.includes("operations_admin");
}

export function isStaff(roles: string[]): boolean {
  return (
    isSuperRole(roles) ||
    roles.includes("finance_admin") ||
    roles.includes("operations_admin")
  );
}

export function capabilitiesForRoles(roles: string[]): Set<Capability> {
  const caps = new Set<Capability>();
  if (isSuperRole(roles)) {
    for (const c of SUPER_CAPS) caps.add(c);
  }
  if (roles.includes("finance_admin")) {
    for (const c of FINANCE_CAPS) caps.add(c);
  }
  if (roles.includes("operations_admin")) {
    for (const c of OPS_CAPS) caps.add(c);
  }
  return caps;
}

export function hasCapability(roles: string[], cap: Capability): boolean {
  return capabilitiesForRoles(roles).has(cap);
}

/** Admin nav items keyed by required capability */
/** Primary capability required to show a nav item (super has all). */
export const ADMIN_NAV_CAPS: Record<string, Capability | Capability[]> = {
  "/admin": "all_dashboards",
  "/admin/control": "emergency_controls",
  "/admin/monitoring": "trade_monitoring",
  "/admin/users": ["suspend_users", "ops_user_state"],
  "/admin/subscriptions": "view_revenue",
  "/admin/payments": "view_payments",
  "/admin/sources": ["signal_sources", "source_status"],
  "/admin/parsed-signals": "parsed_signals",
  "/admin/trades": "trade_monitoring",
  "/admin/risk-templates": "platform_settings",
  "/admin/affiliates": "affiliate_eligibility",
  "/admin/payouts": "review_payouts",
  "/admin/support": "support_tickets",
  "/admin/audit-logs": "all_dashboards",
  "/admin/settings": "platform_settings",
  "/admin/promos": "manage_promos",
};

function pathAllowed(roles: string[], cap: Capability | Capability[]): boolean {
  if (Array.isArray(cap)) return cap.some((c) => hasCapability(roles, c));
  return hasCapability(roles, cap);
}

export function canAccessAdminPath(roles: string[], path: string): boolean {
  if (isSuperRole(roles)) return true;
  const keys = Object.keys(ADMIN_NAV_CAPS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (path === key || path.startsWith(key + "/")) {
      return pathAllowed(roles, ADMIN_NAV_CAPS[key]);
    }
  }
  if (path === "/admin" || path.startsWith("/admin")) {
    return hasCapability(roles, "access_admin_area");
  }
  return false;
}

export const STAFF_ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Super admin (legacy)",
  finance_admin: "Finance admin",
  operations_admin: "Operations admin",
  moderator: "Moderator",
  user: "User",
};
