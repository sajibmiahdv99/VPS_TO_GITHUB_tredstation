// Server-only: place / cancel / fetch orders on real exchanges via REST.
// Targets USD-M perpetual futures (leverage-friendly auto-trading).
// No CCXT — Workers-compatible fetch + HMAC only.

import { createHmac } from "crypto";

export type PlaceOrderInput = {
  symbol: string;          // e.g. "BTCUSDT"
  side: "long" | "short";  // normalised
  quantity: number;
  entry?: number | null;   // null = market
  stopLoss?: number | null;
  takeProfit?: number | null;
  leverage?: number | null;
  clientOrderId: string;
};

export type PlaceOrderResult = {
  exchangeOrderId: string;
  status: "open" | "filled" | "partial" | "rejected";
  fillPrice?: number;
  filledQuantity?: number;
  raw: unknown;
};

export type ExchangeCreds = {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
};

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function qs(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

// ---- Binance USD-M Futures ------------------------------------------------
const BINANCE_FAPI = "https://fapi.binance.com";

async function binanceSigned(
  creds: ExchangeCreds,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const ts = Date.now();
  const body = qs({ ...params, timestamp: ts, recvWindow: 10000 });
  const sig = sign(creds.apiSecret, body);
  const url = `${BINANCE_FAPI}${path}?${body}&signature=${sig}`;
  const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": creds.apiKey } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Binance ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function binancePlace(creds: ExchangeCreds, o: PlaceOrderInput): Promise<PlaceOrderResult> {
  // Set leverage first (idempotent; ignore errors that just say "no change")
  if (o.leverage && o.leverage > 1) {
    await binanceSigned(creds, "POST", "/fapi/v1/leverage", {
      symbol: o.symbol,
      leverage: Math.floor(o.leverage),
    }).catch(() => undefined);
  }

  const side = o.side === "long" ? "BUY" : "SELL";
  const type = o.entry ? "LIMIT" : "MARKET";
  const params: Record<string, string | number | undefined> = {
    symbol: o.symbol,
    side,
    type,
    quantity: o.quantity,
    newClientOrderId: o.clientOrderId,
  };
  if (type === "LIMIT") {
    params.price = o.entry!;
    params.timeInForce = "GTC";
  }

  const placed = (await binanceSigned(creds, "POST", "/fapi/v1/order", params)) as {
    orderId: number;
    status: string;
    avgPrice?: string;
    executedQty?: string;
  };

  // Best-effort attach SL / TP as reduce-only stop/limit orders
  const closeSide = side === "BUY" ? "SELL" : "BUY";
  if (o.stopLoss) {
    await binanceSigned(creds, "POST", "/fapi/v1/order", {
      symbol: o.symbol,
      side: closeSide,
      type: "STOP_MARKET",
      stopPrice: o.stopLoss,
      closePosition: "true",
      newClientOrderId: `${o.clientOrderId}-sl`,
    }).catch(() => undefined);
  }
  if (o.takeProfit) {
    await binanceSigned(creds, "POST", "/fapi/v1/order", {
      symbol: o.symbol,
      side: closeSide,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: o.takeProfit,
      closePosition: "true",
      newClientOrderId: `${o.clientOrderId}-tp`,
    }).catch(() => undefined);
  }

  const status = mapBinanceStatus(placed.status);
  return {
    exchangeOrderId: String(placed.orderId),
    status,
    fillPrice: placed.avgPrice ? Number(placed.avgPrice) : undefined,
    filledQuantity: placed.executedQty ? Number(placed.executedQty) : undefined,
    raw: placed,
  };
}

function mapBinanceStatus(s: string): PlaceOrderResult["status"] {
  switch (s) {
    case "FILLED": return "filled";
    case "PARTIALLY_FILLED": return "partial";
    case "NEW": return "open";
    case "REJECTED":
    case "EXPIRED":
    case "CANCELED": return "rejected";
    default: return "open";
  }
}

async function binanceCancel(creds: ExchangeCreds, symbol: string, exchangeOrderId: string): Promise<void> {
  await binanceSigned(creds, "DELETE", "/fapi/v1/order", { symbol, orderId: exchangeOrderId });
}

async function binanceFetch(creds: ExchangeCreds, symbol: string, exchangeOrderId: string): Promise<PlaceOrderResult> {
  const r = (await binanceSigned(creds, "GET", "/fapi/v1/order", { symbol, orderId: exchangeOrderId })) as {
    orderId: number; status: string; avgPrice?: string; executedQty?: string;
  };
  return {
    exchangeOrderId: String(r.orderId),
    status: mapBinanceStatus(r.status),
    fillPrice: r.avgPrice ? Number(r.avgPrice) : undefined,
    filledQuantity: r.executedQty ? Number(r.executedQty) : undefined,
    raw: r,
  };
}

// ---- Bybit v5 Linear Perp -------------------------------------------------
const BYBIT = "https://api.bybit.com";

async function bybitSigned(
  creds: ExchangeCreds,
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const ts = Date.now().toString();
  const recv = "10000";
  const body = method === "GET" ? qs(params as Record<string, string | number>) : JSON.stringify(params);
  const preSign = ts + creds.apiKey + recv + body;
  const sig = sign(creds.apiSecret, preSign);
  const url = method === "GET" ? `${BYBIT}${path}?${body}` : `${BYBIT}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recv,
      "X-BAPI-SIGN": sig,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? body : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bybit ${res.status}: ${text}`);
  const json = JSON.parse(text) as { retCode: number; retMsg: string; result: unknown };
  if (json.retCode !== 0) throw new Error(`Bybit: ${json.retMsg}`);
  return json.result;
}

async function bybitPlace(creds: ExchangeCreds, o: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (o.leverage && o.leverage > 1) {
    await bybitSigned(creds, "POST", "/v5/position/set-leverage", {
      category: "linear",
      symbol: o.symbol,
      buyLeverage: String(Math.floor(o.leverage)),
      sellLeverage: String(Math.floor(o.leverage)),
    }).catch(() => undefined);
  }

  const placed = (await bybitSigned(creds, "POST", "/v5/order/create", {
    category: "linear",
    symbol: o.symbol,
    side: o.side === "long" ? "Buy" : "Sell",
    orderType: o.entry ? "Limit" : "Market",
    qty: String(o.quantity),
    price: o.entry ? String(o.entry) : undefined,
    timeInForce: o.entry ? "GTC" : undefined,
    stopLoss: o.stopLoss ? String(o.stopLoss) : undefined,
    takeProfit: o.takeProfit ? String(o.takeProfit) : undefined,
    orderLinkId: o.clientOrderId,
  })) as { orderId: string; orderLinkId: string };

  return {
    exchangeOrderId: placed.orderId,
    status: "open",
    raw: placed,
  };
}

async function bybitCancel(creds: ExchangeCreds, symbol: string, exchangeOrderId: string): Promise<void> {
  await bybitSigned(creds, "POST", "/v5/order/cancel", {
    category: "linear",
    symbol,
    orderId: exchangeOrderId,
  });
}

async function bybitFetch(creds: ExchangeCreds, symbol: string, exchangeOrderId: string): Promise<PlaceOrderResult> {
  const r = (await bybitSigned(creds, "GET", "/v5/order/realtime", {
    category: "linear",
    symbol,
    orderId: exchangeOrderId,
  })) as { list: { orderId: string; orderStatus: string; avgPrice?: string; cumExecQty?: string }[] };
  const row = r.list?.[0];
  if (!row) throw new Error("bybit: order not found");
  return {
    exchangeOrderId: row.orderId,
    status: mapBybitStatus(row.orderStatus),
    fillPrice: row.avgPrice ? Number(row.avgPrice) : undefined,
    filledQuantity: row.cumExecQty ? Number(row.cumExecQty) : undefined,
    raw: row,
  };
}

function mapBybitStatus(s: string): PlaceOrderResult["status"] {
  switch (s) {
    case "Filled": return "filled";
    case "PartiallyFilled": return "partial";
    case "New":
    case "Created":
    case "Untriggered": return "open";
    case "Rejected":
    case "Cancelled":
    case "Deactivated": return "rejected";
    default: return "open";
  }
}

// ---- OKX v5 ---------------------------------------------------------------
const OKX = "https://www.okx.com";

function okxSign(secret: string, ts: string, method: string, path: string, body: string): string {
  const preSign = ts + method + path + body;
  return createHmac("sha256", secret).update(preSign).digest("base64");
}

async function okxRequest(
  creds: ExchangeCreds,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const ts = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sig = okxSign(creds.apiSecret, ts, method, path, bodyStr);
  const url = `${OKX}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "OK-ACCESS-KEY": creds.apiKey,
      "OK-ACCESS-SIGN": sig,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
      "Content-Type": "application/json",
    },
    body: bodyStr || undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OKX ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { code: string; msg: string; data: unknown };
  if (json.code !== "0") throw new Error(`OKX: ${json.msg}`);
  return json.data;
}

async function okxPlace(creds: ExchangeCreds, o: PlaceOrderInput): Promise<PlaceOrderResult> {
  const body: Record<string, unknown> = {
    instId: o.symbol,
    tdMode: "cross",
    side: o.side === "long" ? "buy" : "sell",
    posSide: o.side === "long" ? "long" : "short",
    ordType: o.entry ? "limit" : "market",
    sz: String(o.quantity),
    clOrdId: o.clientOrderId,
  };
  if (o.entry) body.px = String(o.entry);
  if (o.leverage && o.leverage > 1) {
    await okxRequest(creds, "POST", "/api/v5/account/set-leverage", {
      instId: o.symbol, lever: String(Math.floor(o.leverage)), mgnMode: "cross",
    }).catch(() => undefined);
  }
  const data = (await okxRequest(creds, "POST", "/api/v5/trade/order", body)) as Array<{ ordId: string; sCode: string; sMsg: string }>;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.sCode !== "0") throw new Error(`OKX order failed: ${row?.sMsg}`);
  return { exchangeOrderId: row.ordId, status: "open", raw: row };
}

async function okxCancel(creds: ExchangeCreds, symbol: string, id: string): Promise<void> {
  await okxRequest(creds, "POST", "/api/v5/trade/cancel-order", { instId: symbol, ordId: id });
}

async function okxFetch(creds: ExchangeCreds, symbol: string, id: string): Promise<PlaceOrderResult> {
  const data = (await okxRequest(creds, "GET", `/api/v5/trade/order?instId=${encodeURIComponent(symbol)}&ordId=${encodeURIComponent(id)}`)) as Array<{ ordId: string; state: string; avgPx?: string; accFillSz?: string }>;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("OKX: order not found");
  const stMap: Record<string, PlaceOrderResult["status"]> = { filled: "filled", partially_filled: "partial", live: "open", cancelled: "rejected", mmp_canceled: "rejected" };
  return { exchangeOrderId: row.ordId, status: stMap[row.state] ?? "open", fillPrice: row.avgPx ? Number(row.avgPx) : undefined, filledQuantity: row.accFillSz ? Number(row.accFillSz) : undefined, raw: row };
}

async function okxValidate(creds: ExchangeCreds): Promise<ValidationResult> {
  try {
    await okxRequest(creds, "GET", "/api/v5/account/balance");
    return { ok: true, canTrade: true, permissions: ["trade", "read"] };
  } catch (e) {
    return { ok: false, canTrade: false, permissions: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- KuCoin Futures v1 ---------------------------------------------------
const KUCOIN_FUTURES = "https://api-futures.kucoin.com";

function kcSign(secret: string, ts: string, method: string, path: string, body: string): string {
  return createHmac("sha256", secret).update(ts + method + path + body).digest("base64");
}

async function kcRequest(
  creds: ExchangeCreds,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const ts = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const sig = kcSign(creds.apiSecret, ts, method, path, bodyStr);
  const passphraseSig = createHmac("sha256", creds.apiSecret).update(creds.passphrase ?? "").digest("base64");
  const url = `${KUCOIN_FUTURES}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "KC-API-KEY": creds.apiKey,
      "KC-API-SIGN": sig,
      "KC-API-TIMESTAMP": ts,
      "KC-API-PASSPHRASE": passphraseSig,
      "KC-API-KEY-VERSION": "3",
      "Content-Type": "application/json",
    },
    body: bodyStr || undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KuCoin ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { code: string; msg: string; data: unknown };
  if (json.code !== "200000") throw new Error(`KuCoin: ${json.msg}`);
  return json.data;
}

async function kcPlace(creds: ExchangeCreds, o: PlaceOrderInput): Promise<PlaceOrderResult> {
  const body: Record<string, unknown> = {
    clientOid: o.clientOrderId,
    side: o.side === "long" ? "buy" : "sell",
    symbol: o.symbol,
    type: o.entry ? "limit" : "market",
    size: o.quantity,
    leverage: o.leverage ? String(Math.floor(o.leverage)) : "1",
  };
  if (o.entry) body.price = String(o.entry);
  if (o.stopLoss) body.stopPrice = String(o.stopLoss);
  const data = (await kcRequest(creds, "POST", "/api/v1/orders", body)) as { orderId: string };
  return { exchangeOrderId: data.orderId, status: "open", raw: data };
}

async function kcCancel(creds: ExchangeCreds, _symbol: string, id: string): Promise<void> {
  await kcRequest(creds, "DELETE", `/api/v1/orders/${id}`);
}

async function kcFetch(creds: ExchangeCreds, _symbol: string, id: string): Promise<PlaceOrderResult> {
  const data = (await kcRequest(creds, "GET", `/api/v1/orders/${id}`)) as { id: string; status: string; dealValue?: string; dealSize?: string };
  const stMap: Record<string, PlaceOrderResult["status"]> = { done: "filled", open: "open", active: "open", cancelled: "rejected" };
  return { exchangeOrderId: data.id, status: stMap[data.status] ?? "open", filledQuantity: data.dealSize ? Number(data.dealSize) : undefined, raw: data };
}

async function kcValidate(creds: ExchangeCreds): Promise<ValidationResult> {
  try {
    await kcRequest(creds, "GET", "/api/v1/account-overview?currency=USDT");
    return { ok: true, canTrade: true, permissions: ["trade", "read"] };
  } catch (e) {
    return { ok: false, canTrade: false, permissions: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- MEXC Futures v1 ----------------------------------------------------
const MEXC_FUTURES = "https://futures.mexc.com";

function mexcSign(secret: string, ts: string, body: string): string {
  return createHmac("sha256", secret).update(body + ts).digest("hex");
}

async function mexcRequest(
  creds: ExchangeCreds,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const ts = Date.now().toString();
  const bodyStr = params ? JSON.stringify(params) : "";
  const sig = mexcSign(creds.apiSecret, ts, bodyStr);
  const url = method === "GET" && params
    ? `${MEXC_FUTURES}${path}?${Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&")}`
    : `${MEXC_FUTURES}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "ApiKey": creds.apiKey,
      "Request-Time": ts,
      "Signature": sig,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? bodyStr : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MEXC ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { success: boolean; code: number; message?: string; data: unknown };
  if (!json.success) throw new Error(`MEXC: ${json.message ?? json.code}`);
  return json.data;
}

async function mexcPlace(creds: ExchangeCreds, o: PlaceOrderInput): Promise<PlaceOrderResult> {
  // MEXC side: 1=open_long, 2=close_short, 3=open_short, 4=close_long
  const side = o.side === "long" ? 1 : 3;
  const body: Record<string, unknown> = {
    symbol: o.symbol,
    side,
    orderType: o.entry ? 1 : 5, // 1=limit, 5=market
    vol: o.quantity,
    leverage: o.leverage ? Math.floor(o.leverage) : 1,
    openType: 2, // cross
  };
  if (o.entry) body.price = o.entry;
  if (o.stopLoss) body.stopLossPrice = o.stopLoss;
  if (o.takeProfit) body.takeProfitPrice = o.takeProfit;
  const data = (await mexcRequest(creds, "POST", "/api/v1/private/order/submit", body)) as { orderId: string };
  return { exchangeOrderId: data.orderId, status: "open", raw: data };
}

async function mexcCancel(creds: ExchangeCreds, symbol: string, id: string): Promise<void> {
  await mexcRequest(creds, "POST", "/api/v1/private/order/cancel", { orderId: id, symbol });
}

async function mexcFetch(creds: ExchangeCreds, _symbol: string, id: string): Promise<PlaceOrderResult> {
  const data = (await mexcRequest(creds, "GET", `/api/v1/private/order/get/${id}`)) as { orderId: string; state: number; avgPrice?: number; filledVolume?: number };
  const stMap: Record<number, PlaceOrderResult["status"]> = { 2: "filled", 4: "partial", 1: "open", 3: "rejected", 5: "rejected" };
  return { exchangeOrderId: data.orderId, status: stMap[data.state] ?? "open", fillPrice: data.avgPrice ?? undefined, filledQuantity: data.filledVolume ?? undefined, raw: data };
}

async function mexcValidate(creds: ExchangeCreds): Promise<ValidationResult> {
  try {
    await mexcRequest(creds, "GET", "/api/v1/private/account/assets");
    return { ok: true, canTrade: true, permissions: ["trade", "read"] };
  } catch (e) {
    return { ok: false, canTrade: false, permissions: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Validation (signed read to confirm key + trade permission) ----------
export type ValidationResult = {
  ok: boolean;
  canTrade: boolean;
  permissions: string[];
  error?: string;
};

async function binanceValidate(creds: ExchangeCreds): Promise<ValidationResult> {
  try {
    const r = (await binanceSigned(creds, "GET", "/fapi/v2/account", {})) as {
      canTrade: boolean;
      canDeposit: boolean;
      canWithdraw: boolean;
    };
    const perms: string[] = [];
    if (r.canTrade) perms.push("trade");
    if (r.canDeposit) perms.push("deposit");
    if (r.canWithdraw) perms.push("withdraw");
    return { ok: true, canTrade: !!r.canTrade, permissions: perms };
  } catch (e) {
    return { ok: false, canTrade: false, permissions: [], error: friendlyError(e, "binance") };
  }
}

async function bybitValidate(creds: ExchangeCreds): Promise<ValidationResult> {
  try {
    const r = (await bybitSigned(creds, "GET", "/v5/user/query-api", {})) as {
      permissions?: Record<string, string[]>;
      readOnly?: number;
    };
    const flat = Object.values(r.permissions ?? {}).flat();
    const canTrade = !r.readOnly && (flat.includes("Order") || flat.includes("ContractTrade") || flat.includes("DerivativesTrade"));
    return { ok: true, canTrade, permissions: flat };
  } catch (e) {
    return { ok: false, canTrade: false, permissions: [], error: friendlyError(e, "bybit") };
  }
}

function friendlyError(e: unknown, prefix: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/-2014|API-key format invalid|Invalid API-key/i.test(raw)) return "API key is malformed.";
  if (/-2015|Invalid API-key, IP, or permissions/i.test(raw)) return "Invalid key, IP not whitelisted, or missing futures permission.";
  if (/-2008|signature/i.test(raw)) return "API secret is incorrect (bad signature).";
  if (/10003|10004|10005|invalid api key/i.test(raw)) return "Bybit rejected the API key.";
  if (/timestamp|recvWindow/i.test(raw)) return "Clock drift — please retry.";
  return `${prefix}: ${raw.slice(0, 200)}`;
}

// ---- Generic Bridge (MT5 / DEX self-hosted) -------------------------------
// Customer runs a small HTTP bridge against their MT5 terminal or DEX wallet.
// Credentials: apiKey = bridge base URL, apiSecret = bearer token.
// Bridge must implement: POST /place, POST /cancel, GET /order, GET /position,
// GET /ticker, GET /balance, GET /health (all JSON).
async function bridgeReq<T>(
  creds: ExchangeCreds,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = creds.apiKey.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiSecret}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function bridgePlace(c: ExchangeCreds, o: PlaceOrderInput): Promise<PlaceOrderResult> {
  const r = await bridgeReq<{ orderId: string; status: string; fillPrice?: number; filledQuantity?: number; raw?: unknown }>(
    c, "POST", "/place", o,
  );
  const s = r.status?.toLowerCase();
  const status: PlaceOrderResult["status"] =
    s === "filled" ? "filled" : s === "partial" ? "partial" : s === "rejected" ? "rejected" : "open";
  return { exchangeOrderId: r.orderId, status, fillPrice: r.fillPrice, filledQuantity: r.filledQuantity, raw: r.raw ?? r };
}
async function bridgeCancel(c: ExchangeCreds, symbol: string, id: string): Promise<void> {
  await bridgeReq(c, "POST", "/cancel", { symbol, orderId: id });
}
async function bridgeFetch(c: ExchangeCreds, symbol: string, id: string): Promise<PlaceOrderResult> {
  const r = await bridgeReq<{ orderId: string; status: string; fillPrice?: number; filledQuantity?: number; raw?: unknown }>(
    c, "GET", `/order?symbol=${encodeURIComponent(symbol)}&orderId=${encodeURIComponent(id)}`,
  );
  const s = r.status?.toLowerCase();
  const status: PlaceOrderResult["status"] =
    s === "filled" ? "filled" : s === "partial" ? "partial" : s === "rejected" ? "rejected" : "open";
  return { exchangeOrderId: r.orderId, status, fillPrice: r.fillPrice, filledQuantity: r.filledQuantity, raw: r.raw ?? r };
}
async function bridgeValidate(c: ExchangeCreds): Promise<ValidationResult> {
  if (!/^https?:\/\//i.test(c.apiKey)) {
    return { ok: false, canTrade: false, permissions: [], error: "Bridge URL must start with http(s)://" };
  }
  try {
    const r = await bridgeReq<{ ok?: boolean; canTrade?: boolean; permissions?: string[]; venue?: string }>(c, "GET", "/health");
    return { ok: r.ok !== false, canTrade: r.canTrade !== false, permissions: r.permissions ?? ["spot", "futures"] };
  } catch (e) {
    return { ok: false, canTrade: false, permissions: [], error: e instanceof Error ? e.message : "Bridge unreachable" };
  }
}

// ---- Dispatcher -----------------------------------------------------------
type Adapter = {
  place: (c: ExchangeCreds, o: PlaceOrderInput) => Promise<PlaceOrderResult>;
  cancel: (c: ExchangeCreds, symbol: string, id: string) => Promise<void>;
  fetch: (c: ExchangeCreds, symbol: string, id: string) => Promise<PlaceOrderResult>;
  validate: (c: ExchangeCreds) => Promise<ValidationResult>;
};
// Lazy stub adapters (Bitget, Gate, Coinbase, Kraken) — validate only until live REST lands
function stubAdapter(name: string): Adapter {
  const notReady = () => {
    throw new Error(`${name} live execution is not enabled yet — use paper mode or another exchange`);
  };
  return {
    place: async () => notReady(),
    cancel: async () => notReady(),
    fetch: async () => notReady(),
    validate: async (c) => {
      if (!c.apiKey || !c.apiSecret) {
        return { ok: false, canTrade: false, permissions: [], error: `${name}: API key and secret required` };
      }
      return {
        ok: false,
        canTrade: false,
        permissions: [],
        error: `${name} adapter is stubbed — keys can be stored; live trading coming soon`,
      };
    },
  };
}

const ADAPTERS: Record<string, Adapter> = {
  binance:    { place: binancePlace, cancel: binanceCancel, fetch: binanceFetch, validate: binanceValidate },
  bybit:      { place: bybitPlace,   cancel: bybitCancel,   fetch: bybitFetch,   validate: bybitValidate },
  okx:        { place: okxPlace,     cancel: okxCancel,     fetch: okxFetch,     validate: okxValidate },
  kucoin:     { place: kcPlace,      cancel: kcCancel,      fetch: kcFetch,      validate: kcValidate },
  mexc:       { place: mexcPlace,    cancel: mexcCancel,    fetch: mexcFetch,    validate: mexcValidate },
  bitget:     stubAdapter("Bitget"),
  gateio:     stubAdapter("Gate.io"),
  coinbase:   stubAdapter("Coinbase Advanced"),
  kraken:     stubAdapter("Kraken Futures"),
  mt5_bridge: { place: bridgePlace,  cancel: bridgeCancel,  fetch: bridgeFetch,  validate: bridgeValidate },
  dex_bridge: { place: bridgePlace,  cancel: bridgeCancel,  fetch: bridgeFetch,  validate: bridgeValidate },
};

/** Live-executable exchanges (place orders). Stubs return false. */
export function isLiveExecutable(code: string): boolean {
  return ["binance", "bybit", "okx", "kucoin", "mexc", "mt5_bridge", "dex_bridge"].includes(code);
}

export function isBridgeExchange(code: string): boolean {
  return code === "mt5_bridge" || code === "dex_bridge";
}

export async function validateExchangeCreds(
  exchangeCode: string,
  creds: ExchangeCreds,
): Promise<ValidationResult> {
  const a = ADAPTERS[exchangeCode];
  if (!a) return { ok: false, canTrade: false, permissions: [], error: `Exchange ${exchangeCode} not yet supported` };
  return a.validate(creds);
}

export async function placeExchangeOrder(
  exchangeCode: string,
  creds: ExchangeCreds,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const a = ADAPTERS[exchangeCode];
  if (!a) throw new Error(`Execution not yet supported for ${exchangeCode}`);
  return a.place(creds, input);
}

export async function cancelExchangeOrder(
  exchangeCode: string,
  creds: ExchangeCreds,
  symbol: string,
  exchangeOrderId: string,
): Promise<void> {
  const a = ADAPTERS[exchangeCode];
  if (!a) throw new Error(`Execution not yet supported for ${exchangeCode}`);
  return a.cancel(creds, symbol, exchangeOrderId);
}

export async function fetchExchangeOrderStatus(
  exchangeCode: string,
  creds: ExchangeCreds,
  symbol: string,
  exchangeOrderId: string,
): Promise<PlaceOrderResult> {
  const a = ADAPTERS[exchangeCode];
  if (!a) throw new Error(`Execution not yet supported for ${exchangeCode}`);
  return a.fetch(creds, symbol, exchangeOrderId);
}

export function isExchangeExecutable(code: string): boolean {
  // Only live adapters count as executable for cron/position sync
  return isLiveExecutable(code);
}

export function isExchangeKnown(code: string): boolean {
  return code in ADAPTERS;
}

// ---- Public ticker (no auth) ---------------------------------------------
// Returns last price for a USD-M perp pair. Used by position monitor.
export async function fetchExchangeTicker(
  exchangeCode: string,
  symbol: string,
): Promise<number | null> {
  try {
    if (exchangeCode === "binance") {
      const res = await fetch(`${BINANCE_FAPI}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) return null;
      const j = (await res.json()) as { price?: string };
      const n = j.price ? Number(j.price) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    if (exchangeCode === "bybit") {
      const res = await fetch(`${BYBIT}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) return null;
      const j = (await res.json()) as { result?: { list?: Array<{ lastPrice?: string }> } };
      const p = j.result?.list?.[0]?.lastPrice;
      const n = p ? Number(p) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Live position fetch (signed) ----------------------------------------
// Returns the open position for `symbol`, or null when flat.
// Used by the position-sync worker to reconcile DB rows with exchange truth
// (e.g. detect exchange-side SL/TP execution).
export type PositionSnapshot = {
  positionAmt: number;     // signed: + long, - short, 0 = flat
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number | null;
  raw: unknown;
};

export async function fetchExchangePosition(
  exchangeCode: string,
  creds: ExchangeCreds,
  symbol: string,
): Promise<PositionSnapshot | null> {
  if (exchangeCode === "binance") {
    const r = (await binanceSigned(creds, "GET", "/fapi/v2/positionRisk", { symbol })) as Array<{
      positionAmt: string; entryPrice: string; markPrice: string; unRealizedProfit: string;
    }>;
    const row = Array.isArray(r) ? r[0] : null;
    if (!row) return null;
    const amt = Number(row.positionAmt);
    return {
      positionAmt: Number.isFinite(amt) ? amt : 0,
      entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
      markPrice: row.markPrice ? Number(row.markPrice) : null,
      unrealizedPnl: row.unRealizedProfit ? Number(row.unRealizedProfit) : null,
      raw: row,
    };
  }
  if (exchangeCode === "bybit") {
    const r = (await bybitSigned(creds, "GET", "/v5/position/list", {
      category: "linear", symbol,
    })) as { list?: Array<{ size: string; side: string; avgPrice: string; markPrice: string; unrealisedPnl: string }> };
    const row = r.list?.[0];
    if (!row) return null;
    const size = Number(row.size);
    const signed = row.side === "Sell" ? -size : size;
    return {
      positionAmt: Number.isFinite(signed) ? signed : 0,
      entryPrice: row.avgPrice ? Number(row.avgPrice) : null,
      markPrice: row.markPrice ? Number(row.markPrice) : null,
      unrealizedPnl: row.unrealisedPnl ? Number(row.unrealisedPnl) : null,
      raw: row,
    };
  }
  if (isBridgeExchange(exchangeCode)) {
    try {
      const r = await bridgeReq<{ positionAmt?: number; entryPrice?: number; markPrice?: number; unrealizedPnl?: number; raw?: unknown }>(
        creds, "GET", `/position?symbol=${encodeURIComponent(symbol)}`,
      );
      return {
        positionAmt: Number(r.positionAmt ?? 0),
        entryPrice: r.entryPrice ?? null,
        markPrice: r.markPrice ?? null,
        unrealizedPnl: r.unrealizedPnl ?? null,
        raw: r.raw ?? r,
      };
    } catch { return null; }
  }
  return null;
}
