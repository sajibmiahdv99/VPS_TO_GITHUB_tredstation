/**
 * Transactional email HTML templates for AGENT TRED.
 * Used by dispatch-notifications and ad-hoc sends via Resend.
 */

export type EmailTemplateId =
  | "fill"
  | "sl_tp"
  | "margin"
  | "error"
  | "welcome"
  | "subscription"
  | "promo"
  | "generic";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const brand = process.env.BRAND_NAME || "AGENT TRED";
const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export function renderEmailTemplate(
  id: EmailTemplateId,
  vars: { title: string; body?: string | null; meta?: Record<string, string | number | null | undefined> },
): { subject: string; html: string } {
  const title = vars.title;
  const body = vars.body || "";
  const metaRows = Object.entries(vars.meta || {})
    .filter(([, v]) => v != null && v !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px">${escapeHtml(k)}</td><td style="padding:4px 0;font-size:13px;font-weight:600">${escapeHtml(String(v))}</td></tr>`,
    )
    .join("");

  const accent =
    id === "sl_tp"
      ? "#ef4444"
      : id === "fill"
        ? "#22c55e"
        : id === "margin"
          ? "#f59e0b"
          : id === "error"
            ? "#dc2626"
            : "#6366f1";

  const subjectPrefix =
    id === "fill"
      ? "Fill"
      : id === "sl_tp"
        ? "Exit"
        : id === "margin"
          ? "Margin"
          : id === "error"
            ? "Alert"
            : id === "welcome"
              ? "Welcome"
              : id === "subscription"
                ? "Subscription"
                : id === "promo"
                  ? "Promo"
                  : brand;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:Inter,Arial,sans-serif;color:#e2e8f0">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0f1a;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
        <tr>
          <td style="padding:20px 24px;border-bottom:1px solid #1f2937">
            <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};font-weight:700">${escapeHtml(brand)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px">
            <div style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${accent};margin-right:8px"></div>
            <h1 style="display:inline;margin:0;font-size:20px;font-weight:600;color:#f8fafc">${escapeHtml(title)}</h1>
            <p style="margin:16px 0 0;line-height:1.55;color:#94a3b8;font-size:14px">${escapeHtml(body)}</p>
            ${metaRows ? `<table style="margin-top:20px;width:100%">${metaRows}</table>` : ""}
            <a href="${escapeHtml(appUrl)}/app" style="display:inline-block;margin-top:24px;background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600">Open dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #1f2937;font-size:11px;color:#64748b">
            You receive this because notifications are enabled for your ${escapeHtml(brand)} account.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `[${subjectPrefix}] ${title}`,
    html,
  };
}

export function templateIdFromEvent(eventType: string): EmailTemplateId {
  const e = eventType.toLowerCase();
  if (e.includes("fill")) return "fill";
  if (e.includes("sl") || e.includes("tp") || e.includes("closed")) return "sl_tp";
  if (e.includes("margin") || e.includes("liquidation")) return "margin";
  if (e.includes("error") || e.includes("invalid")) return "error";
  if (e.includes("welcome")) return "welcome";
  if (e.includes("sub") || e.includes("plan") || e.includes("payment")) return "subscription";
  if (e.includes("promo")) return "promo";
  return "generic";
}

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  apiKey?: string;
  from?: string;
}): Promise<void> {
  const apiKey = opts.apiKey || process.env.RESEND_API_KEY || "";
  const from = opts.from || process.env.EMAIL_FROM || `${brand} <onboarding@resend.dev>`;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}
