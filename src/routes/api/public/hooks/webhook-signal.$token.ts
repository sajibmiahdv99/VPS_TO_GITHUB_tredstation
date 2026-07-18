// Public webhook endpoint for TradingView alerts and generic webhook signal
// sources. Auth is by the opaque `token` path segment mapped to a
// personal_signal_channels row with channel_type = 'webhook'. Body may be
// plain text (TradingView default) or JSON with a text/message/alert_message
// field. Delegates parsing + sizing + queueing to the existing
// ingestSignalForPersonalChannel pipeline — no duplicated business logic.

import { createFileRoute } from "@tanstack/react-router";
import { ingestSignalForPersonalChannel } from "@/lib/pipeline.functions";

const MAX_BODY_BYTES = 8 * 1024;

export const Route = createFileRoute("/api/public/hooks/webhook-signal/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { rateLimit, clientIp } = await import("@/lib/rateLimit.server");
        const rl = rateLimit({
          key: `sig-wh:${clientIp(request)}:${params.token?.slice(0, 8) ?? ""}`,
          limit: 60,
          windowMs: 60_000,
        });
        if (!rl.ok) {
          return Response.json({ ok: false, error: "rate limited" }, { status: 429 });
        }

        const token = params.token;
        if (!token || token.length < 16 || token.length > 128) {
          return Response.json({ ok: false, error: "not found" }, { status: 404 });
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return Response.json({ ok: false, error: "payload too large" }, { status: 413 });
        }

        let text: string;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "string") {
            text = parsed;
          } else if (parsed && typeof parsed === "object") {
            text = parsed.text ?? parsed.message ?? parsed.alert_message ?? raw;
          } else {
            text = raw;
          }
        } catch {
          text = raw;
        }

        text = (text ?? "").trim();
        if (!text) {
          return Response.json({ ok: false, error: "empty body" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: channel } = await supabaseAdmin
          .from("personal_signal_channels")
          .select("id,is_active,channel_type")
          .eq("webhook_token", token)
          .eq("channel_type", "webhook")
          .eq("is_active", true)
          .maybeSingle();

        // Do not leak whether the token almost-matched anything.
        if (!channel) {
          return Response.json({ ok: false, error: "not found" }, { status: 404 });
        }

        try {
          const result = await ingestSignalForPersonalChannel(text, channel.id);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("webhook ingest failed", err);
          return Response.json({ ok: false, error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
