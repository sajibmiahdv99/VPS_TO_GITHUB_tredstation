// Telegram bot webhook. Validates the secret token Telegram sends, looks up
// the chat -> signal_source mapping via signal_sources.code = telegram chat id,
// then runs the ingest pipeline.
//
// Required env: TELEGRAM_WEBHOOK_SECRET (set in Lovable Cloud secrets).

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { ingestSignalForSource } from "@/lib/pipeline.functions";

function safeEqual(a: string | null | undefined, b: string): boolean {
  const buf = Buffer.from(a ?? "");
  const exp = Buffer.from(b);
  if (buf.length !== exp.length) return false;
  return timingSafeEqual(buf, exp);
}

export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rateLimit, clientIp } = await import("@/lib/rateLimit.server");
        const rl = rateLimit({
          key: `tg-wh:${clientIp(request)}`,
          limit: 120,
          windowMs: 60_000,
        });
        if (!rl.ok) return new Response("rate limited", { status: 429 });

        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!secret) return new Response("not configured", { status: 503 });
        const provided = request.headers.get("x-telegram-bot-api-secret-token");
        if (!safeEqual(provided, secret)) {
          return new Response("unauthorized", { status: 401 });
        }

        let update: any;
        try {
          update = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const msg = update.message ?? update.channel_post ?? update.edited_message;
        const text: string | undefined = msg?.text ?? msg?.caption;
        const chatId: string | number | undefined = msg?.chat?.id;
        if (!text || chatId == null) {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: source } = await supabaseAdmin
          .from("signal_sources")
          .select("id, status")
          .eq("source_type", "telegram")
          .eq("code", String(chatId))
          .maybeSingle();

        if (!source || source.status !== "active") {
          return Response.json({ ok: true, ignored: "unknown source" });
        }

        try {
          const result = await ingestSignalForSource(text, source.id);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("telegram ingest failed", err);
          return Response.json({ ok: false, error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
