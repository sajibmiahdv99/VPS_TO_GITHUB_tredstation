/** Simple in-memory sliding window rate limit (single Node process). */

type Bucket = { ts: number[] };
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number } {
  const now = Date.now();
  const b = buckets.get(opts.key) ?? { ts: [] };
  b.ts = b.ts.filter((t) => now - t < opts.windowMs);
  if (b.ts.length >= opts.limit) {
    buckets.set(opts.key, b);
    return { ok: false, remaining: 0 };
  }
  b.ts.push(now);
  buckets.set(opts.key, b);
  return { ok: true, remaining: opts.limit - b.ts.length };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
