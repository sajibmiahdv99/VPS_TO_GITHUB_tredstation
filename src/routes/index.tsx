import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, ShieldCheck, Radio, Zap, Network, Activity,
  FlaskConical, BarChart3, Users, Clock, ArrowRight, Star, Trophy, Rocket,
} from "lucide-react";
import { PublicNav, PublicFooter } from "@/components/PublicNav";
import { getPublicStats } from "@/lib/public.functions";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — AI Crypto Signal Trading` },
      {
        name: "description",
        content: `${BRAND.name} auto-trades Telegram signals across Binance, Bybit, OKX and more — adaptive risk, monitoring, backtests, and crypto billing.`,
      },
      { property: "og:title", content: `${BRAND.name} — Automated Signal Trading` },
      {
        property: "og:description",
        content: "Parse signals, enforce risk, execute 24/7 across your exchanges.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

const features = [
  { i: Radio, t: "Signal Intelligence", d: "Hybrid rules + AI parser extracts symbol, side, entry, SL, and multi-TP from any channel." },
  { i: Network, t: "Multi-Exchange", d: "Binance, Bybit, OKX, KuCoin, MEXC — paper or live with encrypted API keys." },
  { i: ShieldCheck, t: "Adaptive Risk Engine", d: "Per-trade %, daily loss, drawdown, cooldowns, symbol caps, streak-aware sizing." },
  { i: Activity, t: "Real-time Monitoring", d: "Server-side TP/SL, trailing stops, and anomaly kill-switches — laptop closed, still trading." },
  { i: FlaskConical, t: "Backtesting & Optimizer", d: "Replay strategies on historical candles. AI risk optimizer picks stronger configs." },
  { i: Trophy, t: "Leaderboard & Quality", d: "Rank signal sources by quality score; auto-mute chronic underperformers." },
  { i: Users, t: "Affiliate Program", d: "Multi-level commissions with admin payouts in USDT." },
  { i: Clock, t: "24/7 Automation", d: "Cron workers process orders, sync balances, and dispatch alerts around the clock." },
];

const steps = [
  { n: "01", t: "Connect an exchange", d: "Add a trade-only API key. Withdrawal permission is rejected on validation." },
  { n: "02", t: "Subscribe to signals", d: "Telegram, TradingView webhooks, or marketplace channels with per-source risk." },
  { n: "03", t: `Let ${BRAND.name} trade`, d: "Risk engine sizes every order, executor places it, monitor manages exits." },
];

const exchanges = ["Binance", "Bybit", "OKX", "KuCoin", "MEXC"];

function Landing() {
  const statsQ = useQuery({ queryKey: ["public-stats"], queryFn: () => getPublicStats() });
  const s = statsQ.data;

  const stats = [
    { v: s ? String(s.exchanges) + "+" : "5+", l: "Exchanges ready" },
    { v: s ? String(s.traders) : "—", l: "Traders onboarded" },
    { v: s ? String(s.executedOrders) : "—", l: "Orders tracked" },
    { v: s ? String(s.signals7d) : "—", l: "Signals (7d)" },
  ];

  return (
    <div className="mesh-bg min-h-screen text-foreground">
      <PublicNav />

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-14 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1 text-xs font-medium text-primary shadow-lg shadow-primary/10">
            <Zap className="h-3 w-3" /> {BRAND.name} · Live workstation
          </span>
          <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-semibold tracking-tight md:text-6xl md:leading-[1.08]">
            Automate signal trading with{" "}
            <span className="bg-gradient-to-r from-primary to-violet-300 bg-clip-text text-transparent">
              risk you control
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {BRAND.name} parses Telegram and webhook signals, enforces adaptive risk, and executes across your
            exchange accounts — self-hosted, crypto-paid, admin-controlled.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/30 transition hover:opacity-90"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/pricing"
              className="rounded-xl border border-border bg-card/40 px-6 py-3 text-sm font-medium backdrop-blur transition hover:border-primary/40 hover:bg-accent"
            >
              See pricing
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signin" } as never}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-medium transition hover:bg-accent"
            >
              <Rocket className="h-4 w-4" /> Open workstation
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card/50 p-5 shadow-2xl shadow-primary/5 backdrop-blur-xl md:grid-cols-4 md:gap-4 md:p-6">
            {stats.map((st) => (
              <div key={st.l} className="rounded-xl bg-secondary/30 px-2 py-3 text-center">
                <div className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">{st.v}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
                  {st.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Trades on the venues you already use
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {exchanges.map((e) => (
            <div key={e} className="text-2xl font-semibold text-muted-foreground/70 transition hover:text-foreground">
              {e}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Everything you need to run signals safely.</h2>
          <p className="mt-3 text-muted-foreground">Ultimate stack inside one workstation.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.t}
              className="card-lift rounded-2xl border border-border bg-card/80 p-6 shadow-[0_0_0_1px_oklch(1_0_0_/_2%)_inset]"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <f.i className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card/40 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-semibold">Three steps to live automation</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((st) => (
              <div key={st.n} className="rounded-xl border border-border bg-background p-6">
                <div className="text-sm font-mono text-primary">{st.n}</div>
                <h3 className="mt-2 text-lg font-semibold">{st.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{st.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <Star className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 text-3xl font-semibold">Ready for AGENT TRED?</h2>
        <p className="mt-3 text-muted-foreground">
          Self-hosted. Crypto billing. Admin Control Center. Built for serious signal operators.
        </p>
        <Link
          to="/auth"
          search={{ mode: "signup" } as never}
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Create account <TrendingUp className="h-4 w-4" />
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}
