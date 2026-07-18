// Pure TypeScript port of the Hermes signal parser.
// Worker-safe: no Node-only APIs, no I/O.
//
// Input: raw text from a Telegram/Discord message.
// Output: structured signal candidate + confidence score.

export type Side = "long" | "short";

export interface ParsedSignal {
  symbol: string | null;
  side: Side | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number[];
  leverage: number | null;
  confidence: number; // 0..1
  parserVersion: string;
  error?: string;
}

export const PARSER_VERSION = "ts-1.0.0";

const SYMBOL_RE =
  /\b([A-Z]{2,10})[\/\-]?(USDT|USD|USDC|BUSD|BTC|ETH|EUR|GBP|JPY)\b/i;

const SIDE_LONG = /\b(long|buy|bull|bullish)\b/i;
const SIDE_SHORT = /\b(short|sell|bear|bearish)\b/i;

const ENTRY_RE =
  /\b(entry|enter|buy\s*@|sell\s*@|open|@)\s*[:=]?\s*([\d]+(?:[.,]\d+)?)/i;

const SL_RE = /\b(sl|stop[-\s]?loss|stop)\s*[:=@]?\s*([\d]+(?:[.,]\d+)?)/i;

const TP_RE = /\b(tp\s*\d*|take[-\s]?profit\s*\d*|target\s*\d*)\s*[:=@]?\s*([\d]+(?:[.,]\d+)?)/gi;

const LEV_RE = /\b(lev(?:erage)?|x)\s*[:=]?\s*(\d{1,3})x?\b/i;

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const v = Number(raw.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

export function parseSignal(text: string): ParsedSignal {
  const out: ParsedSignal = {
    symbol: null,
    side: null,
    entry: null,
    stopLoss: null,
    takeProfit: [],
    leverage: null,
    confidence: 0,
    parserVersion: PARSER_VERSION,
  };

  if (!text || typeof text !== "string") {
    out.error = "empty text";
    return out;
  }

  const cleaned = text.replace(/\s+/g, " ").trim();

  const sym = cleaned.match(SYMBOL_RE);
  if (sym) out.symbol = `${sym[1].toUpperCase()}${sym[2].toUpperCase()}`;

  if (SIDE_LONG.test(cleaned)) out.side = "long";
  else if (SIDE_SHORT.test(cleaned)) out.side = "short";

  const entry = cleaned.match(ENTRY_RE);
  out.entry = num(entry?.[2]);

  const sl = cleaned.match(SL_RE);
  out.stopLoss = num(sl?.[2]);

  const tps: number[] = [];
  for (const m of cleaned.matchAll(TP_RE)) {
    const v = num(m[2]);
    if (v != null) tps.push(v);
  }
  out.takeProfit = tps;

  const lev = cleaned.match(LEV_RE);
  out.leverage = num(lev?.[2]);

  // Confidence: weighted by completeness of the signal.
  let score = 0;
  if (out.symbol) score += 0.3;
  if (out.side) score += 0.2;
  if (out.entry != null) score += 0.2;
  if (out.stopLoss != null) score += 0.15;
  if (out.takeProfit.length > 0) score += 0.15;
  out.confidence = Math.round(score * 100) / 100;

  if (score < 0.5) out.error = "low confidence";
  return out;
}
