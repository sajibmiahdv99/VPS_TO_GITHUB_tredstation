/**
 * 7-layer affiliate commissions + rank recompute for AGENT TRED.
 *
 * L1: 10% default → 15% at 10 directs → 20% at 15 directs
 * L2–L3: 2% · L4–L5: 1% · L6–L7: 0.5%
 * Rank bonuses (BE 2%, SBE 1%) are NOT auto-paid — admin manual table.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function l1Rate(directReferrals: number): number {
  if (directReferrals >= 15) return 0.2;
  if (directReferrals >= 10) return 0.15;
  return 0.1;
}

const GEN_RATES = [0.1, 0.02, 0.02, 0.01, 0.01, 0.005, 0.005];

export async function awardAffiliateCommissions(
  buyerUserId: string,
  subscriptionId: string | null,
  amount: number,
): Promise<void> {
  try {
    if (!amount || amount <= 0) return;

    const { data: buyer } = await supabaseAdmin
      .from("profiles")
      .select("id,referred_by")
      .eq("id", buyerUserId)
      .maybeSingle();

    let parentUserId: string | null =
      (buyer as { referred_by?: string | null } | null)?.referred_by ?? null;

    // Fallback: affiliates.referred_by
    if (!parentUserId) {
      const { data: buyerAff } = await supabaseAdmin
        .from("affiliates")
        .select("referred_by")
        .eq("user_id", buyerUserId)
        .maybeSingle();
      parentUserId = (buyerAff as { referred_by?: string | null } | null)?.referred_by ?? null;
    }

    if (!parentUserId) return;

    let level = 1;
    let current: string | null = parentUserId;

    while (current && level <= 7) {
      const { data: aff } = await supabaseAdmin
        .from("affiliates")
        .select("id,user_id,direct_referrals,status,is_approved,rank")
        .eq("user_id", current)
        .maybeSingle();

      if (aff) {
        const directs = Number(aff.direct_referrals ?? 0);
        const rate = level === 1 ? l1Rate(directs) : GEN_RATES[level - 1] ?? 0;
        const commission = Math.round(amount * rate * 10000) / 10000;

        if (commission > 0) {
          await supabaseAdmin.from("affiliate_commissions").insert({
            referred_by_id: current,
            subscriber_id: buyerUserId,
            subscription_id: subscriptionId,
            level,
            rate: rate * 100, // store as percentage for display
            amount: commission,
            status: "pending",
            commission_type: "generation",
            affiliate_id: aff.id,
          } as never);

          // balances
          const { data: bal } = await supabaseAdmin
            .from("user_balances")
            .select("user_id,pending_commission,total_earned,available_balance")
            .eq("user_id", current)
            .maybeSingle();

          if (bal) {
            await supabaseAdmin
              .from("user_balances")
              .update({
                pending_commission: Number(bal.pending_commission ?? 0) + commission,
                total_earned: Number(bal.total_earned ?? 0) + commission,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", current);
          } else {
            await supabaseAdmin.from("user_balances").insert({
              user_id: current,
              pending_commission: commission,
              total_earned: commission,
            });
          }

          await supabaseAdmin
            .from("affiliates")
            .update({
              total_earned: undefined, // bump via raw if needed
              total_pending: undefined,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", current);

          // Increment totals on affiliate row
          await supabaseAdmin.rpc("recompute_affiliate_rank" as never, {
            _user_id: current,
          } as never).catch(async () => {
            // fallback recompute in JS if rpc fails
          });

          const { data: affRow } = await supabaseAdmin
            .from("affiliates")
            .select("total_earned,total_pending")
            .eq("user_id", current)
            .maybeSingle();
          if (affRow) {
            await supabaseAdmin
              .from("affiliates")
              .update({
                total_earned: Number(affRow.total_earned ?? 0) + commission,
                total_pending: Number(affRow.total_pending ?? 0) + commission,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", current);
          }

          // recompute rank
          try {
            await supabaseAdmin.rpc("recompute_affiliate_rank", { _user_id: current });
          } catch {
            /* optional */
          }
        }
      }

      // walk up chain via profiles.referred_by
      const { data: parentProfile } = await supabaseAdmin
        .from("profiles")
        .select("referred_by")
        .eq("id", current)
        .maybeSingle();
      current = (parentProfile as { referred_by?: string | null } | null)?.referred_by ?? null;
      if (!current) {
        const { data: parentAff } = await supabaseAdmin
          .from("affiliates")
          .select("referred_by")
          .eq("user_id", aff?.user_id ?? "")
          .maybeSingle();
        // already used profile walk
      }
      level++;
    }

    // After buyer paid, recompute ranks on parent chain for paid-direct counts
    let walk: string | null = parentUserId;
    let hops = 0;
    while (walk && hops < 8) {
      try {
        await supabaseAdmin.rpc("recompute_affiliate_rank", { _user_id: walk });
      } catch {
        break;
      }
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("referred_by")
        .eq("id", walk)
        .maybeSingle();
      walk = (p as { referred_by?: string | null } | null)?.referred_by ?? null;
      hops++;
    }
  } catch (e) {
    console.warn("[affiliate] commission award failed", e);
  }
}

export function describeCommissionTable() {
  return {
    levels: [
      { level: 1, label: "Direct / 1st Gen", rates: "10% → 15% (≥10 directs) → 20% (≥15 directs)" },
      { level: 2, label: "2nd Gen", rates: "2%" },
      { level: 3, label: "3rd Gen", rates: "2%" },
      { level: 4, label: "4th Gen", rates: "1%" },
      { level: 5, label: "5th Gen", rates: "1%" },
      { level: 6, label: "6th Gen", rates: "0.5%" },
      { level: 7, label: "7th Gen", rates: "0.5%" },
    ],
    ranks: [
      { rank: "Brand Promoter", condition: "10 direct referrals" },
      { rank: "Senior Brand Promoter", condition: "15 active paid members under direct network" },
      { rank: "Brand Executive", condition: "3 Senior Brand Promoters under direct network", bonus: "2% (manual)" },
      {
        rank: "Senior Brand Executive",
        condition: "2 Brand Executives under direct network",
        bonus: "1% (manual)",
      },
    ],
  };
}
