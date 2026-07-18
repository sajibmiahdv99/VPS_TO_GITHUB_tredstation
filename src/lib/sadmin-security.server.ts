/** Super-admin IP allowlist for sensitive mutations */

import { getRequest } from "@tanstack/react-start/server";
import { clientIp } from "@/lib/rateLimit.server";

/**
 * When SADMIN_IP_ALLOWLIST is set (comma-separated IPs), only those clients
 * may run super-admin mutations. Reads x-forwarded-for / x-real-ip.
 * If no allowlist is configured, all IPs are allowed (dev-friendly).
 */
export function assertSadminIp(request?: Request | null) {
  const list = (process.env.SADMIN_IP_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return; // open if not configured

  let req = request ?? null;
  if (!req) {
    try {
      req = getRequest();
    } catch {
      return; // no request context (background jobs)
    }
  }
  if (!req) return;

  const ip = clientIp(req);
  if (ip === "unknown") return; // local/dev without proxy headers
  if (!list.includes(ip)) {
    throw new Error(`Super-admin IP not allowed (${ip})`);
  }
}

/** True when MFA AAL2 is required by env (SADMIN_REQUIRE_MFA=1). */
export function sadminMfaRequired(): boolean {
  const v = (process.env.SADMIN_REQUIRE_MFA || "1").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
