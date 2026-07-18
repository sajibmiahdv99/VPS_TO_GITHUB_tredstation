# Hermes Price Relay Contract

Hermes is designed so the app process does not hold long-lived exchange
WebSocket connections in constrained environments. Position monitoring
(`src/routes/api/public/hooks/monitor-positions.ts`) therefore falls back
to per-symbol REST ticker calls each cron tick.

The **price relay** is an **optional** self-hosted process the operator
runs (VPS, home machine, small always-on container) that subscribes to
exchange WebSockets and pushes ticks into the app over authenticated REST.
When it is running, the position monitor uses those fresh prices and
skips REST calls entirely.

## Fallback design (this is optional)

- `monitor-positions.ts`'s `ticker(code, sym)` helper first reads the
  matching row from `live_prices`. If `updated_at` is within the last
  15 seconds, that price is used and no REST call is made.
- If the row is missing or stale, the monitor calls
  `fetchExchangeTicker(code, sym)` exactly as before.
- An operator who never runs the relay sees **zero** behavior change: the
  app polls REST tickers as it always has, just without near-real-time
  updates between cron ticks.

## API surface

### `POST /api/public/hooks/price-tick`

- Header: `x-relay-secret: <PRICE_RELAY_SECRET>` (constant-time compared;
  a dedicated secret, distinct from `CRON_SECRET`, because this endpoint
  is pushed to continuously rather than invoked on a schedule).
- Body:

  ```json
  {
    "ticks": [
      { "exchange_code": "binance", "symbol": "BTCUSDT", "price": 68321.5 },
      { "exchange_code": "bybit",   "symbol": "ETHUSDT", "price": 3210.4 }
    ]
  }
  ```

- Up to 200 entries per request. Non-finite or non-positive prices are
  rejected. Within a single batch the latest entry per
  `(exchange_code, symbol)` wins.
- Returns `{ "ok": true, "updated": <N> }`.

## Coverage

The reference implementation below covers **Binance USD-M futures** and
**Bybit v5 linear perpetuals**, matching the exchanges currently served
by `fetchExchangeTicker`'s REST path where near-real-time updates are
most useful. OKX / KuCoin / MEXC continue to use the existing REST
fallback in `monitor-positions.ts`; this relay does not regress them.

## Reference implementation

Save as `price-relay.mjs` and run with either Node 22+ (native
`WebSocket`) or Bun. No dependencies. The operator hosts this process
themselves; the app's edge runtime cannot host it.

```js
// price-relay.mjs
// Environment:
//   HERMES_BASE_URL       e.g. https://your-domain.com
//   PRICE_RELAY_SECRET    matches the value set in the Hermes backend
//   RELAY_SYMBOLS         comma list, uppercase, e.g. "BTCUSDT,ETHUSDT,SOLUSDT"
//   FLUSH_INTERVAL_MS     optional, default 1500

const BASE_URL = process.env.HERMES_BASE_URL;
const SECRET = process.env.PRICE_RELAY_SECRET;
const SYMBOLS = (process.env.RELAY_SYMBOLS ?? "BTCUSDT,ETHUSDT")
  .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const FLUSH_MS = Number(process.env.FLUSH_INTERVAL_MS ?? 1500);

if (!BASE_URL || !SECRET || SYMBOLS.length === 0) {
  console.error("HERMES_BASE_URL, PRICE_RELAY_SECRET, RELAY_SYMBOLS required");
  process.exit(1);
}

// Latest price per (exchange, symbol); flushed as a batch.
const pending = new Map(); // key -> { exchange_code, symbol, price }
function record(exchange_code, symbol, price) {
  if (!Number.isFinite(price) || price <= 0) return;
  pending.set(`${exchange_code}:${symbol}`, { exchange_code, symbol, price });
}

async function flush() {
  if (pending.size === 0) return;
  const ticks = [...pending.values()];
  pending.clear();
  try {
    const res = await fetch(`${BASE_URL}/api/public/hooks/price-tick`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-secret": SECRET,
      },
      body: JSON.stringify({ ticks }),
    });
    if (!res.ok) {
      console.error("relay push failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("relay push error", e);
  }
}
setInterval(flush, FLUSH_MS);

// ---------- Binance USD-M futures (markPrice@arr@1s) ----------
// Broadcasts a snapshot of every symbol's mark price once per second.
function connectBinance() {
  let backoff = 1000;
  const url = "wss://fstream.binance.com/ws/!markPrice@arr@1s";
  const wanted = new Set(SYMBOLS);

  const open = () => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => { backoff = 1000; console.log("binance connected"); });
    ws.addEventListener("message", (ev) => {
      let data; try { data = JSON.parse(ev.data.toString()); } catch { return; }
      if (!Array.isArray(data)) return;
      for (const row of data) {
        const sym = String(row.s ?? "").toUpperCase();
        if (!wanted.has(sym)) continue;
        const price = Number(row.p); // mark price
        record("binance", sym, price);
      }
    });
    const retry = () => {
      const wait = Math.min(backoff, 30_000);
      backoff = Math.min(backoff * 2, 30_000);
      console.warn(`binance reconnect in ${wait}ms`);
      setTimeout(open, wait);
    };
    ws.addEventListener("close", retry);
    ws.addEventListener("error", () => { try { ws.close(); } catch {} });
  };
  open();
}

// ---------- Bybit v5 public linear ----------
// Subscribes to per-symbol tickers.<SYMBOL> topics.
function connectBybit() {
  let backoff = 1000;
  const url = "wss://stream.bybit.com/v5/public/linear";

  const open = () => {
    const ws = new WebSocket(url);
    let pingTimer = null;
    ws.addEventListener("open", () => {
      backoff = 1000;
      console.log("bybit connected");
      const args = SYMBOLS.map((s) => `tickers.${s}`);
      ws.send(JSON.stringify({ op: "subscribe", args }));
      pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ op: "ping" })); } catch {}
      }, 20_000);
    });
    ws.addEventListener("message", (ev) => {
      let msg; try { msg = JSON.parse(ev.data.toString()); } catch { return; }
      if (!msg?.topic || !String(msg.topic).startsWith("tickers.")) return;
      const d = msg.data;
      if (!d) return;
      const sym = String(d.symbol ?? "").toUpperCase();
      // Bybit sends deltas; lastPrice may be missing on some updates.
      const price = Number(d.lastPrice ?? d.markPrice);
      if (!sym || !Number.isFinite(price)) return;
      record("bybit", sym, price);
    });
    const retry = () => {
      if (pingTimer) clearInterval(pingTimer);
      const wait = Math.min(backoff, 30_000);
      backoff = Math.min(backoff * 2, 30_000);
      console.warn(`bybit reconnect in ${wait}ms`);
      setTimeout(open, wait);
    };
    ws.addEventListener("close", retry);
    ws.addEventListener("error", () => { try { ws.close(); } catch {} });
  };
  open();
}

connectBinance();
connectBybit();
console.log(`relay started for ${SYMBOLS.length} symbols`);
```

### Running it

```bash
export HERMES_BASE_URL="https://your-domain.com"
export PRICE_RELAY_SECRET="..."           # same value stored in Hermes secrets
export RELAY_SYMBOLS="BTCUSDT,ETHUSDT,SOLUSDT"
node price-relay.mjs   # or: bun price-relay.mjs
```

Keep the process supervised (systemd, pm2, Docker restart policy) so
disconnects and crashes recover automatically.
