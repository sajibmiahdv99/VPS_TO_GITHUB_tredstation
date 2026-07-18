// AI-based signal parser fallback. Calls any OpenAI-compatible chat completions
// endpoint (OpenRouter, OpenAI, self-hosted vLLM, Gemini proxy, etc.).
// Server-only — reads AI_API_KEY / AI_GATEWAY_URL / AI_MODEL from process.env
// (or platform_secrets at runtime via getAiConfig when available).
//
// Used by parseSignalHybrid() when the regex parser returns low confidence
// (Bangla text, image-style formatting, unusual phrasing, multi-line, etc).

import type { ParsedSignal, Side } from "./signalParser";

function getAiConfig() {
  return {
    gatewayUrl:
      process.env.AI_GATEWAY_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://openrouter.ai/api/v1/chat/completions",
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
    model: process.env.AI_MODEL || "google/gemini-2.0-flash-001",
  };
}

const SYSTEM_PROMPT = `You are a strict crypto trading-signal parser. Extract structured order data from messy multilingual chat messages (English, Bangla, Hindi mixed) or from a SCREENSHOT of a signal. Return JSON ONLY matching the schema. Use null for unknown fields. Symbol must be uppercase concatenated like "BTCUSDT". Side must be "long" or "short". Numbers must be plain numbers (no commas, no currency symbols). If the input is clearly NOT a trading signal, return all nulls and confidence 0.

Examples:
Input: "BTC/USDT LONG entry 67250 SL 66800 TP1 68000 TP2 69000 lev 10x"
Output: { symbol:"BTCUSDT", side:"long", entry:67250, stopLoss:66800, takeProfit:[68000,69000], leverage:10, confidence:0.95 }

Input (Bangla): "ETHUSDT এ শর্ট নাও, এন্ট্রি ৩৪৫০, স্টপ ৩৫২০, টার্গেট ৩৩৮০ ও ৩৩০০, লিভারেজ ২০x"
Output: { symbol:"ETHUSDT", side:"short", entry:3450, stopLoss:3520, takeProfit:[3380,3300], leverage:20, confidence:0.9 }

Input (Hindi mix): "SOL buy karo @ 142.5, stoploss 138, target 150 155 160, 5x leverage"
Output: { symbol:"SOLUSDT", side:"long", entry:142.5, stopLoss:138, takeProfit:[150,155,160], leverage:5, confidence:0.85 }

Input: "Good morning everyone!" → not a signal
Output: { symbol:null, side:null, entry:null, stopLoss:null, takeProfit:[], leverage:null, confidence:0 }`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "emit_signal",
    description: "Emit the parsed trading signal",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        symbol: { type: ["string", "null"] },
        side: { type: ["string", "null"], enum: ["long", "short", null] },
        entry: { type: ["number", "null"] },
        stopLoss: { type: ["number", "null"] },
        takeProfit: { type: "array", items: { type: "number" } },
        leverage: { type: ["number", "null"] },
        confidence: { type: "number" },
      },
      required: ["symbol", "side", "entry", "stopLoss", "takeProfit", "leverage", "confidence"],
    },
  },
} as const;

export const AI_PARSER_VERSION = "ai-gemini-3-flash-v1";

export async function parseSignalAI(
  rawText: string,
  imageUrl?: string | null,
): Promise<ParsedSignal | null> {
  const { gatewayUrl, apiKey, model } = getAiConfig();
  if (!apiKey) return null;

  try {
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: rawText.slice(0, 4000) || "(image only — parse the signal from the screenshot)" },
    ];
    if (imageUrl) {
      userContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "emit_signal" } },
        temperature: 0,
      }),
    });

    if (!res.ok) {
      console.error("[aiParser] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }

    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) return null;

    const parsed = JSON.parse(argsStr) as {
      symbol: string | null;
      side: Side | null;
      entry: number | null;
      stopLoss: number | null;
      takeProfit: number[] | null;
      leverage: number | null;
      confidence: number;
    };

    const sym = parsed.symbol?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
    const sideValid = parsed.side === "long" || parsed.side === "short" ? parsed.side : null;
    const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    return {
      symbol: sym,
      side: sideValid,
      entry: typeof parsed.entry === "number" ? parsed.entry : null,
      stopLoss: typeof parsed.stopLoss === "number" ? parsed.stopLoss : null,
      takeProfit: Array.isArray(parsed.takeProfit)
        ? parsed.takeProfit.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        : [],
      leverage: typeof parsed.leverage === "number" ? parsed.leverage : null,
      confidence: conf,
      parserVersion: AI_PARSER_VERSION,
      error: conf < 0.4 ? "low confidence (ai)" : undefined,
    };
  } catch (e) {
    console.error("[aiParser] exception", e);
    return null;
  }
}

// Hybrid parser: regex first; if confidence low, try AI and keep the better one.
export async function parseSignalHybrid(
  rawText: string,
  regexResult: ParsedSignal,
  imageUrl?: string | null,
): Promise<ParsedSignal> {
  if (regexResult.confidence >= 0.7 && !imageUrl) return regexResult;

  const ai = await parseSignalAI(rawText, imageUrl);
  if (!ai) return regexResult;

  // Prefer the result with higher confidence; if AI wins, merge missing fields from regex.
  if (ai.confidence > regexResult.confidence) {
    return {
      symbol: ai.symbol ?? regexResult.symbol,
      side: ai.side ?? regexResult.side,
      entry: ai.entry ?? regexResult.entry,
      stopLoss: ai.stopLoss ?? regexResult.stopLoss,
      takeProfit: ai.takeProfit.length ? ai.takeProfit : regexResult.takeProfit,
      leverage: ai.leverage ?? regexResult.leverage,
      confidence: ai.confidence,
      parserVersion: ai.parserVersion,
      error: ai.error,
    };
  }
  return regexResult;
}
