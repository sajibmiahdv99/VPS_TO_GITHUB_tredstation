// Signal Quality Score: historical accuracy → auto-mute low performers.
// Used by pipeline fan-out when features.signal_quality_gate is enabled.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSetting } from "@/lib/platform/settings.server";

export type SourceQuality = {
  sourceId: string;
  score: number; // 0-100
  sampleSize: number;
  muted: boolean;
};

export async function computeSourceQuality(sourceId: string): Promise<SourceQuality> {
  const { data: sigs } = await supabaseAdmin
    .from("signals")
    .select("id")
    .eq("source_id", sourceId)
    .limit(1000);
  const signalIds = (sigs ?? []).map((s) => s.id);
  if (signalIds.length === 0) {
    return { sourceId, score: 50, sampleSize: 0, muted: false };
  }

  const { data: closed } = await supabaseAdmin
    .from("orders")
    .select("pnl,status")
    .in("signal_id", signalIds)
    .in("status", ["filled", "closed", "FILLED", "CLOSED"])
    .limit(500);

  const pnls = (closed ?? []).map((r) => Number(r.pnl ?? 0));
  const sampleSize = pnls.length;
  const wins = pnls.filter((p) => p > 0).length;
  const winRate = sampleSize ? (wins / sampleSize) * 100 : 50;
  const sampleScore = Math.min(100, (Math.log10(sampleSize + 1) / 3) * 100);
  const score = Math.round(winRate * 0.6 + sampleScore * 0.4);

  const minScore = Number(await getSetting("signal_quality.min_score", 25));
  const minSample = Number(await getSetting("signal_quality.min_sample", 10));
  const muteEnabled = Boolean(await getSetting("features.signal_quality_gate", true));

  const muted = muteEnabled && sampleSize >= minSample && score < minScore;
  return { sourceId, score, sampleSize, muted };
}

export async function shouldMuteSource(sourceId: string): Promise<boolean> {
  try {
    const q = await computeSourceQuality(sourceId);
    return q.muted;
  } catch {
    return false;
  }
}
