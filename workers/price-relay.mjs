// Price relay: Binance + Bybit futures WS → Hermes /api/public/hooks/price-tick
// Env: HERMES_BASE_URL, PRICE_RELAY_SECRET, RELAY_SYMBOLS, FLUSH_INTERVAL_MS

const BASE_URL = process.env.HERMES_BASE_URL;
const SECRET = process.env.PRICE_RELAY_SECRET;
const SYMBOLS = (process.env.RELAY_SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
const FLUSH_MS = Number(process.env.FLUSH_INTERVAL_MS ?? 1500);

if (!BASE_URL || !SECRET || SYMBOLS.length === 0) {
  console.error("HERMES_BASE_URL, PRICE_RELAY_SECRET, RELAY_SYMBOLS required");
  process.exit(1);
}

/** @type {Map<string, { exchange_code: string, symbol: string, price: number }>} */
const latest = new Map();

function key(ex, sym) {
  return `${ex}:${sym}`;
}

async function flush() {
  if (latest.size === 0) return;
  const ticks = Array.from(latest.values());
  latest.clear();
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/public/hooks/price-tick`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-secret": SECRET,
      },
      body: JSON.stringify({ ticks }),
    });
    if (!res.ok) {
      console.error("[price-relay] push failed", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[price-relay] push error", e);
  }
}

setInterval(flush, FLUSH_MS);

function connectBinance() {
  const streams = SYMBOLS.map((s) => `${s.toLowerCase()}@markPrice@1s`).join("/");
  const url = `wss://fstream.binance.com/stream?streams=${streams}`;
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      const d = msg.data ?? msg;
      const sym = String(d.s || "").toUpperCase();
      const price = Number(d.p ?? d.markPrice);
      if (sym && Number.isFinite(price) && price > 0) {
        latest.set(key("binance", sym), { exchange_code: "binance", symbol: sym, price });
      }
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => setTimeout(connectBinance, 3000);
  ws.onerror = () => ws.close();
}

function connectBybit() {
  const url = "wss://stream.bybit.com/v5/public/linear";
  const ws = new WebSocket(url);
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        op: "subscribe",
        args: SYMBOLS.map((s) => `tickers.${s}`),
      }),
    );
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      const list = Array.isArray(msg.data) ? msg.data : msg.data ? [msg.data] : [];
      for (const d of list) {
        const sym = String(d.symbol || "").toUpperCase();
        const price = Number(d.markPrice ?? d.lastPrice);
        if (sym && Number.isFinite(price) && price > 0) {
          latest.set(key("bybit", sym), { exchange_code: "bybit", symbol: sym, price });
        }
      }
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => setTimeout(connectBybit, 3000);
  ws.onerror = () => ws.close();
}

console.log("[price-relay] starting", { BASE_URL, SYMBOLS, FLUSH_MS });
connectBinance();
connectBybit();
