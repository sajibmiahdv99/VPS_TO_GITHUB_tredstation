// Exchange balance sync — pulls real wallet snapshots from connected exchanges.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listExchangeBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ exchange_account_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("exchange_balances")
      .select("id,exchange_account_id,asset,free,used,total,usd_value,snapshot_at")
      .eq("user_id", context.userId)
      .order("usd_value", { ascending: false, nullsFirst: false });
    if (data.exchange_account_id) q = q.eq("exchange_account_id", data.exchange_account_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

async function performSync(opts: {
  userId: string;
  accountId: string;
  exchangeCode: string;
  encApiKey: string;
  encApiSecret: string;
  encPassphrase: string | null;
}) {
  const { decryptSecret } = await import("@/lib/crypto.server");
  const { fetchExchangeBalances, valuateUsd } = await import("@/lib/exchanges/balanceFetcher.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const apiKey = decryptSecret(opts.encApiKey).trim();
  const apiSecret = decryptSecret(opts.encApiSecret).trim();
  const passphrase = opts.encPassphrase ? decryptSecret(opts.encPassphrase).trim() : undefined;

  try {
    const raw = await fetchExchangeBalances(opts.exchangeCode, { apiKey, apiSecret, passphrase });
    const valued = await valuateUsd(raw);
    const now = new Date().toISOString();

    if (valued.length) {
      const { error: upErr } = await supabaseAdmin.from("exchange_balances").upsert(
        valued.map((b) => ({
          user_id: opts.userId,
          exchange_account_id: opts.accountId,
          asset: b.asset,
          free: b.free,
          used: b.used,
          total: b.total,
          usd_value: b.usd_value,
          snapshot_at: now,
        })),
        { onConflict: "exchange_account_id,asset" },
      );
      if (upErr) throw new Error(upErr.message);
    }

    // Remove stale assets (no longer held)
    const keep = valued.map((b) => b.asset);
    if (keep.length) {
      await supabaseAdmin
        .from("exchange_balances")
        .delete()
        .eq("exchange_account_id", opts.accountId)
        .not("asset", "in", `(${keep.map((a) => `"${a}"`).join(",")})`);
    } else {
      await supabaseAdmin
        .from("exchange_balances")
        .delete()
        .eq("exchange_account_id", opts.accountId);
    }

    await supabaseAdmin
      .from("exchange_accounts")
      .update({
        last_balance_sync_at: now,
        last_balance_error: null,
        status: "connected",
      })
      .eq("id", opts.accountId);

    return { ok: true as const, count: valued.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("exchange_accounts")
      .update({ last_balance_error: msg.slice(0, 500), status: "error" })
      .eq("id", opts.accountId);
    throw new Error(msg);
  }
}

export const syncExchangeBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ exchange_account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Sensitive credential columns are not SELECT-grantable to the client role;
    // read them server-side with the service-role client, scoped by user_id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acc, error } = await supabaseAdmin
      .from("exchange_accounts")
      .select("id,exchange_code,encrypted_api_key,encrypted_api_secret,passphrase")
      .eq("id", data.exchange_account_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acc) throw new Error("Exchange account not found");

    return performSync({
      userId: context.userId,
      accountId: acc.id,
      exchangeCode: acc.exchange_code,
      encApiKey: acc.encrypted_api_key,
      encApiSecret: acc.encrypted_api_secret,
      encPassphrase: acc.passphrase,
    });
  });

// Service-role helper used by the cron hook. Not exposed via RPC.
export async function syncAllExchangeBalances(): Promise<{ scanned: number; ok: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: accounts, error } = await supabaseAdmin
    .from("exchange_accounts")
    .select("id,user_id,exchange_code,encrypted_api_key,encrypted_api_secret,passphrase")
    .in("status", ["connected", "pending", "error"]);
  if (error) throw new Error(error.message);

  let ok = 0;
  let failed = 0;
  for (const a of accounts ?? []) {
    try {
      await performSync({
        userId: a.user_id,
        accountId: a.id,
        exchangeCode: a.exchange_code,
        encApiKey: a.encrypted_api_key,
        encApiSecret: a.encrypted_api_secret,
        encPassphrase: a.passphrase,
      });
      ok++;
    } catch {
      failed++;
    }
  }
  return { scanned: accounts?.length ?? 0, ok, failed };
}
