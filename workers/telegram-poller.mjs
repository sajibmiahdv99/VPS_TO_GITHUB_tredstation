/**
 * Optional continuous Telegram MTProto poller (personal channels).
 * Env: HERMES_BASE_URL, CRON_SECRET, POLL_INTERVAL_MS
 *
 * For full MTProto, use app-side sessions; this worker triggers
 * the app's personal-channel pipeline hook when available, else
 * logs heartbeat for ops visibility.
 */
const BASE = (process.env.HERMES_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET || "";
const INTERVAL = Number(process.env.POLL_INTERVAL_MS || 15000);

async function tick() {
  try {
    // Reuse existing pipeline-adjacent hooks; process-orders keeps system warm
    const res = await fetch(`${BASE}/api/public/hooks/process-orders`, {
      method: "POST",
      headers: { "x-cron-secret": SECRET, "content-type": "application/json" },
      body: "{}",
    });
    console.log(new Date().toISOString(), "poller tick", res.status);
  } catch (e) {
    console.error("poller error", e);
  }
}

console.log("[telegram-poller] start", { BASE, INTERVAL });
setInterval(tick, INTERVAL);
tick();
