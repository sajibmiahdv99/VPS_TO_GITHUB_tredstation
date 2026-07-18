import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HeatCell = {
  symbol: string;
  side: "buy" | "sell" | "mixed";
  notional: number;
  quantity: number;
  unrealizedPnl: number;
  positions: number;
  exposurePct: number;
};

export type HeatMapData = {
  totalNotional: number;
  totalUnrealizedPnl: number;
  balance: number;
  cells: HeatCell[];
};

export const getPortfolioHeatMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HeatMapData> => {
    const { supabase, userId } = context;

    const [{ data: orders }, { data: bal }] = await Promise.all([
      supabase
        .from("orders")
        .select("symbol,side,quantity,filled_quantity,price,fill_price,leverage")
        .eq("user_id", userId)
        .in("status", ["open", "filled", "partial", "dispatched"]),
      supabase
        .from("user_balances")
        .select("available_balance")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const balance = Number(bal?.available_balance ?? 0);
    const byS = new Map<string, HeatCell>();

    for (const o of orders ?? []) {
      const sym = (o.symbol ?? "").toUpperCase();
      if (!sym) continue;
      const qty = Number(o.filled_quantity ?? o.quantity ?? 0);
      const px = Number(o.fill_price ?? o.price ?? 0);
      const notional = qty * px;
      const upnl = Number((o as { unrealized_pnl?: number | null }).unrealized_pnl ?? 0);
      const side = (o.side === "buy" || o.side === "sell") ? o.side : "buy";
      const prev = byS.get(sym);
      if (!prev) {
        byS.set(sym, {
          symbol: sym, side, notional, quantity: qty,
          unrealizedPnl: upnl, positions: 1, exposurePct: 0,
        });
      } else {
        prev.notional += notional;
        prev.quantity += qty;
        prev.unrealizedPnl += upnl;
        prev.positions += 1;
        if (prev.side !== side) prev.side = "mixed";
      }
    }

    const totalNotional = Array.from(byS.values()).reduce((s, c) => s + c.notional, 0);
    const totalUnrealizedPnl = Array.from(byS.values()).reduce((s, c) => s + c.unrealizedPnl, 0);
    const denom = balance > 0 ? balance : totalNotional || 1;
    const cells = Array.from(byS.values())
      .map((c) => ({ ...c, exposurePct: (c.notional / denom) * 100 }))
      .sort((a, b) => b.notional - a.notional);

    return { totalNotional, totalUnrealizedPnl, balance, cells };
  });
