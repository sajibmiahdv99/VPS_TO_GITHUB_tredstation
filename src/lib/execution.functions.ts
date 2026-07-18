// Execution queue interface and order lifecycle management.
//
// Hermes MT5 / exchange execution cannot run on edge Workers. An external
// self-hosted worker polls `claimQueuedOrders`, places the order with the
// broker, then calls `reportExecution` to update fill state. See
// docs/EXECUTION_WORKER.md for the full contract.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Worker-facing ---------------------------------------------------------

export const claimQueuedOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Pull queued orders + any open orders pending cancel/modify so worker
    // can act on user-initiated state changes too.
    const { data: queued, error: qErr } = await context.supabase
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (qErr) throw new Error(qErr.message);

    const ids = (queued ?? []).map((r) => r.id);
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("orders")
        .update({ status: "dispatched" })
        .in("id", ids)
        .eq("user_id", context.userId);
      // Audit: queued -> dispatched
      await context.supabase.from("order_events").insert(
        ids.map((id) => ({
          order_id: id,
          user_id: context.userId,
          event_type: "claim",
          from_status: "queued",
          to_status: "dispatched",
          payload: {},
        })),
      );
    }


    // Pending modify/cancel — surface to worker without flipping status yet.
    const { data: pendingMods } = await context.supabase
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .in("status", ["open", "partial", "dispatched"])
      .or("cancel_requested.eq.true,modify_requested.eq.true")
      .limit(50);

    return { orders: queued ?? [], pending: pendingMods ?? [] };
  });

export const reportExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(["filled", "partial", "open", "cancelled", "rejected", "closed"]),
        exchangeOrderId: z.string().max(128).optional(),
        clientOrderId: z.string().max(128).optional(),
        fillPrice: z.number().positive().optional(),
        filledQuantity: z.number().nonnegative().optional(),
        pnl: z.number().optional(),
        errorMessage: z.string().max(500).optional(),
        expectedVersion: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Load current row for state-machine validation & idempotency.
    const { data: current, error: loadErr } = await context.supabase
      .from("orders")
      .select("id,status,version,filled_quantity,exchange_order_id,client_order_id")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!current) throw new Error("order not found");

    // Idempotency: same exchangeOrderId+status reported twice is a no-op.
    if (
      data.exchangeOrderId &&
      current.exchange_order_id === data.exchangeOrderId &&
      current.status === data.status
    ) {
      return { ok: true, idempotent: true };
    }

    // Optimistic lock (optional)
    if (data.expectedVersion != null && data.expectedVersion !== current.version) {
      throw new Error(`version conflict: expected ${data.expectedVersion}, current ${current.version}`);
    }

    // Accumulate filled_quantity for partial fills.
    const accumulatedQty =
      data.filledQuantity != null && (data.status === "partial" || data.status === "filled")
        ? Number(current.filled_quantity ?? 0) + Number(data.filledQuantity)
        : data.filledQuantity ?? current.filled_quantity ?? null;

    type OrderUpdate = {
      status: typeof data.status;
      exchange_order_id?: string;
      client_order_id?: string;
      fill_price?: number;
      filled_quantity?: number;
      pnl?: number;
      error_message?: string;
      cancel_requested?: boolean;
      modify_requested?: boolean;
    };
    const update: OrderUpdate = { status: data.status };
    if (data.exchangeOrderId !== undefined) update.exchange_order_id = data.exchangeOrderId;
    if (data.clientOrderId !== undefined) update.client_order_id = data.clientOrderId;
    if (data.fillPrice !== undefined) update.fill_price = data.fillPrice;
    if (accumulatedQty !== null) update.filled_quantity = Number(accumulatedQty);
    if (data.pnl !== undefined) update.pnl = data.pnl;
    if (data.errorMessage !== undefined) update.error_message = data.errorMessage;
    if (["filled", "cancelled", "closed", "rejected"].includes(data.status)) {
      update.cancel_requested = false;
      update.modify_requested = false;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("orders")
      .update(update)
      .eq("id", data.orderId)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);


    await context.supabase.from("order_events").insert({
      order_id: data.orderId,
      user_id: context.userId,
      event_type: `report_${data.status}`,
      from_status: current.status,
      to_status: data.status,
      payload: {
        fill_price: data.fillPrice,
        filled_quantity: data.filledQuantity,
        accumulated: accumulatedQty,
        pnl: data.pnl,
        error: data.errorMessage,
        exchange_order_id: data.exchangeOrderId,
      },
    });

    return { ok: true, idempotent: false };
  });

// ---- User-facing lifecycle controls ---------------------------------------

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error: lErr } = await context.supabase
      .from("orders")
      .select("id,status")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!row) throw new Error("order not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Queued orders cancel immediately; live orders flag for worker.
    if (row.status === "queued") {
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ status: "cancelled", cancel_requested: false })
        .eq("id", data.orderId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      await context.supabase.from("order_events").insert({
        order_id: data.orderId,
        user_id: context.userId,
        event_type: "user_cancel",
        from_status: "queued",
        to_status: "cancelled",
        payload: {},
      });
      return { ok: true, immediate: true };
    }

    if (!["open", "partial", "dispatched"].includes(row.status)) {
      throw new Error(`cannot cancel order in status ${row.status}`);
    }
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ cancel_requested: true })
      .eq("id", data.orderId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    await context.supabase.from("order_events").insert({
      order_id: data.orderId,
      user_id: context.userId,
      event_type: "user_cancel_requested",
      from_status: row.status,
      to_status: null,
      payload: {},
    });
    return { ok: true, immediate: false };
  });

export const modifyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        stop_loss: z.number().positive().nullable().optional(),
        take_profit: z.number().positive().nullable().optional(),
        quantity: z.number().positive().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    type ModUpdate = {
      modify_requested: boolean;
      stop_loss?: number | null;
      take_profit?: number | null;
      quantity?: number;
    };
    const update: ModUpdate = { modify_requested: true };
    if (data.stop_loss !== undefined) update.stop_loss = data.stop_loss;
    if (data.take_profit !== undefined) update.take_profit = data.take_profit;
    if (data.quantity !== undefined) update.quantity = data.quantity;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update(update)
      .eq("id", data.orderId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);


    await context.supabase.from("order_events").insert({
      order_id: data.orderId,
      user_id: context.userId,
      event_type: "user_modify_requested",
      from_status: null,
      to_status: null,
      payload: { stop_loss: data.stop_loss, take_profit: data.take_profit, quantity: data.quantity },
    });
    return { ok: true };
  });

export const setTrailingStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        distance: z.number().positive(),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        trailing_stop_distance: data.distance,
        trailing_stop_active: data.active,
        modify_requested: true,
      })
      .eq("id", data.orderId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);


    await context.supabase.from("order_events").insert({
      order_id: data.orderId,
      user_id: context.userId,
      event_type: "trailing_stop_set",
      from_status: null,
      to_status: null,
      payload: { distance: data.distance, active: data.active },
    });
    return { ok: true };
  });

// Configure a partial take-profit ladder. Percentages must sum to 100.
// Worker reads tp_levels in order and closes each slice when price hits it.
export const setPartialTakeProfits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        levels: z
          .array(z.object({ price: z.number().positive(), percent: z.number().min(1).max(100) }))
          .min(1)
          .max(6),
      })
      .refine(
        (v) => Math.round(v.levels.reduce((s, l) => s + l.percent, 0)) === 100,
        { message: "Percentages must sum to 100" },
      )
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tp_levels = data.levels.map((l) => ({ price: l.price, percent: l.percent, hit: false }));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        tp_levels,
        take_profit: data.levels[0].price,
        modify_requested: true,
      })
      .eq("id", data.orderId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);


    await context.supabase.from("order_events").insert({
      order_id: data.orderId,
      user_id: context.userId,
      event_type: "partial_tp_set",
      from_status: null,
      to_status: null,
      payload: { levels: tp_levels },
    });
    return { ok: true };
  });


export const listOrderEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("order_events")
      .select("id,event_type,from_status,to_status,payload,created_at")
      .eq("order_id", data.orderId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
