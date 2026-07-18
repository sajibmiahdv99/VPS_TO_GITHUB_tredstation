/** Lightweight observability + optional Sentry DSN */

export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[agent-tred]", msg, context);
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  // Fire-and-forget envelope-style log (no SDK dependency)
  try {
    void fetch(`${dsn.replace(/\/$/, "")}/api/store/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: msg,
        level: "error",
        extra: context,
        timestamp: new Date().toISOString(),
        platform: "node",
        tags: { app: "agent-tred" },
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function healthPayload() {
  return {
    ok: true,
    service: "agent-tred",
    ts: new Date().toISOString(),
    uptime_s: Math.floor(process.uptime()),
    node: process.version,
  };
}
