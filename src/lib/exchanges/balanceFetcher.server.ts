// Server-only: fetch wallet balances from exchange REST APIs.
// No CCXT — those packages have Node/native deps incompatible with Workers.
// Each adapter returns a normalized list of { asset, free, used, total }.

import { createHmac } from "crypto";

export type BalanceRow = {
  asset: string;
  free: number;
  used: number;
  total: number;
};

export type FetchInput = {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
};

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---- Binance (spot) -------------------------------------------------------
async function fetchBinance({ apiKey, apiSecret }: FetchInput): Promise<BalanceRow[]> {
  const ts = Date.now();
  const qs = `timestamp=${ts}&recvWindow=10000`;
  const sig = sign(apiSecret, qs);
  const res = await fetch(`https://api.binance.com/api/v3/account?${qs}&signature=${sig}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { balances: { asset: string; free: string; locked: string }[] };
  return json.balances
    .map((b) => {
      const free = Number(b.free);
      const used = Number(b.locked);
      return { asset: b.asset, free, used, total: free + used };
    })
    .filter((b) => b.total > 0);
}

// ---- Bybit (unified v5) ---------------------------------------------------
async function fetchBybit({ apiKey, apiSecret }: FetchInput): Promise<BalanceRow[]> {
  const ts = Date.now().toString();
  const recv = "10000";
  const query = "accountType=UNIFIED";
  const preSign = ts + apiKey + recv + query;
  const sig = sign(apiSecret, preSign);
  const res = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${query}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recv,
      "X-BAPI-SIGN": sig,
    },
  });
  if (!res.ok) throw new Error(`Bybit ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    retCode: number;
    retMsg: string;
    result: { list: { coin: { coin: string; walletBalance: string; locked: string }[] }[] };
  };
  if (json.retCode !== 0) throw new Error(`Bybit: ${json.retMsg}`);
  const coins = json.result.list[0]?.coin ?? [];
  return coins
    .map((c) => {
      const total = Number(c.walletBalance);
      const used = Number(c.locked || 0);
      return { asset: c.coin, free: Math.max(total - used, 0), used, total };
    })
    .filter((b) => b.total > 0);
}

// ---- OKX v5 ---------------------------------------------------------------
async function fetchOKX({ apiKey, apiSecret, passphrase }: FetchInput): Promise<BalanceRow[]> {
  const ts = new Date().toISOString();
  const path = "/api/v5/asset/balances";
  const preSign = ts + "GET" + path;
  const sig = sign(apiSecret, preSign);
  const res = await fetch(`https://www.okx.com${path}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": Buffer.from(
        require("crypto").createHmac("sha256", apiSecret).update(preSign).digest()
      ).toString("base64"),
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": passphrase ?? "",
    },
  });
  if (!res.ok) throw new Error(`OKX ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { code: string; data: Array<{ ccy: string; availBal: string; frozenBal: string }> };
  if (json.code !== "0") throw new Error(`OKX balance: code ${json.code}`);
  return json.data.map((b) => {
    const free = Number(b.availBal);
    const used = Number(b.frozenBal);
    return { asset: b.ccy, free, used, total: free + used };
  }).filter((b) => b.total > 0);
  void sig;
}

// ---- MEXC Futures v1 -------------------------------------------------------
async function fetchMEXC({ apiKey, apiSecret }: FetchInput): Promise<BalanceRow[]> {
  const ts = Date.now().toString();
  const bodyStr = "";
  const sig = sign(apiSecret, bodyStr + ts);
  const res = await fetch("https://futures.mexc.com/api/v1/private/account/assets", {
    headers: {
      "ApiKey": apiKey,
      "Request-Time": ts,
      "Signature": sig,
    },
  });
  if (!res.ok) throw new Error(`MEXC ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { success: boolean; data: Array<{ currency: string; availableBalance: number; frozenBalance: number }> };
  if (!json.success) throw new Error("MEXC balance fetch failed");
  return (json.data ?? []).map((b) => {
    const free = Number(b.availableBalance ?? 0);
    const used = Number(b.frozenBalance ?? 0);
    return { asset: b.currency, free, used, total: free + used };
  }).filter((b) => b.total > 0);
}

// ---- Generic bridge (MT5 / DEX) -------------------------------------------
async function fetchBridge({ apiKey, apiSecret }: FetchInput): Promise<BalanceRow[]> {
  const url = apiKey.replace(/\/+$/, "") + "/balance";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiSecret}` } });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { balances?: Array<{ asset: string; free?: number; used?: number; total?: number }> };
  return (json.balances ?? [])
    .map((b) => {
      const free = Number(b.free ?? 0);
      const used = Number(b.used ?? 0);
      const total = Number(b.total ?? free + used);
      return { asset: b.asset, free, used, total };
    })
    .filter((b) => b.total > 0);
}

const ADAPTERS: Record<string, (i: FetchInput) => Promise<BalanceRow[]>> = {
  binance:    fetchBinance,
  bybit:      fetchBybit,
  okx:        fetchOKX,
  mexc:       fetchMEXC,
  mt5_bridge: fetchBridge,
  dex_bridge: fetchBridge,
};

export async function fetchExchangeBalances(
  exchangeCode: string,
  creds: FetchInput,
): Promise<BalanceRow[]> {
  const adapter = ADAPTERS[exchangeCode];
  if (!adapter) throw new Error(`Balance sync not yet supported for ${exchangeCode}`);
  return adapter(creds);
}

// ---- USD valuation via Binance public tickers ----------------------------
let _priceCache: { at: number; map: Record<string, number> } | null = null;

async function loadPrices(): Promise<Record<string, number>> {
  if (_priceCache && Date.now() - _priceCache.at < 60_000) return _priceCache.map;
  const res = await fetch("https://api.binance.com/api/v3/ticker/price");
  if (!res.ok) return _priceCache?.map ?? {};
  const arr = (await res.json()) as { symbol: string; price: string }[];
  const map: Record<string, number> = {};
  for (const t of arr) map[t.symbol] = Number(t.price);
  _priceCache = { at: Date.now(), map };
  return map;
}

export async function valuateUsd(rows: BalanceRow[]): Promise<(BalanceRow & { usd_value: number | null })[]> {
  const prices = await loadPrices();
  return rows.map((r) => {
    const a = r.asset.toUpperCase();
    let usd: number | null = null;
    if (a === "USDT" || a === "USDC" || a === "BUSD" || a === "FDUSD" || a === "DAI" || a === "TUSD") usd = r.total;
    else if (prices[`${a}USDT`]) usd = r.total * prices[`${a}USDT`];
    else if (prices[`${a}BUSD`]) usd = r.total * prices[`${a}BUSD`];
    return { ...r, usd_value: usd };
  });
}
