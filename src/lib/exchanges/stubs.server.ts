/**
 * Stub adapters for upcoming CEXes (Bitget, Gate.io, Coinbase Advanced, Kraken Futures).
 * Validate returns a clear "coming soon" message; place/cancel/fetch throw until live.
 * Wire into ADAPTERS when REST signing is complete.
 */

import type { ExchangeCreds, PlaceOrderInput, PlaceOrderResult } from "./executor.server";

export type ValidationResult = {
  ok: boolean;
  canTrade: boolean;
  permissions: string[];
  error?: string;
};

function notReady(name: string): never {
  throw new Error(`${name} live execution is not enabled yet — use paper mode or another exchange`);
}

function stubValidate(name: string): (c: ExchangeCreds) => Promise<ValidationResult> {
  return async (c) => {
    if (!c.apiKey || !c.apiSecret) {
      return { ok: false, canTrade: false, permissions: [], error: `${name}: API key and secret required` };
    }
    return {
      ok: false,
      canTrade: false,
      permissions: [],
      error: `${name} adapter is stubbed — keys accepted for storage; live trading coming soon`,
    };
  };
}

export function makeStubAdapter(name: string) {
  return {
    place: async (_c: ExchangeCreds, _o: PlaceOrderInput): Promise<PlaceOrderResult> => notReady(name),
    cancel: async (_c: ExchangeCreds, _symbol: string, _id: string): Promise<void> => notReady(name),
    fetch: async (_c: ExchangeCreds, _symbol: string, _id: string): Promise<PlaceOrderResult> => notReady(name),
    validate: stubValidate(name),
  };
}

/** Codes reserved for roadmap CEX expansion (not live-executable yet). */
export const STUB_EXCHANGE_CODES = [
  "bitget",
  "gateio",
  "coinbase",
  "kraken",
] as const;

export type StubExchangeCode = (typeof STUB_EXCHANGE_CODES)[number];
