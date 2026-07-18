// Fetches OHLCV candles from Binance public REST. No auth required.
// Worker-safe (fetch only). In-memory cache per (symbol, interval) window.

export type Candle = {
  t: number; // open time ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const cache = new Map<string, Candle[]>();
const BASE = "https://api.binance.com/api/v3/klines";

const MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/** Fetch klines between [from, to] in ms. Paginates 1000-at-a-time. */
export async function fetchCandles(
  symbol: string,
  interval: Interval,
  from: number,
  to: number,
): Promise<Candle[]> {
  const key = `${symbol}:${interval}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const out: Candle[] = [];
  let cursor = from;
  const step = MS[interval];
  while (cursor < to) {
    const url = `${BASE}?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&startTime=${cursor}&endTime=${to}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance klines ${res.status}: ${symbol} ${interval}`);
    }
    const rows = (await res.json()) as unknown[][];
    if (!rows.length) break;
    for (const r of rows) {
      out.push({
        t: r[0] as number,
        o: parseFloat(r[1] as string),
        h: parseFloat(r[2] as string),
        l: parseFloat(r[3] as string),
        c: parseFloat(r[4] as string),
        v: parseFloat(r[5] as string),
      });
    }
    const last = rows[rows.length - 1][0] as number;
    if (rows.length < 1000) break;
    cursor = last + step;
  }
  cache.set(key, out);
  return out;
}

export function intervalForRange(days: number): Interval {
  if (days <= 3) return "1m";
  if (days <= 14) return "5m";
  if (days <= 45) return "15m";
  if (days <= 120) return "1h";
  return "4h";
}
