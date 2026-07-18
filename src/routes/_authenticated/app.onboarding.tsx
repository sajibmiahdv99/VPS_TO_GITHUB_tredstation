import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { getOnboardingStatus } from "@/lib/onboarding.functions";
import { BRAND } from "@/lib/brand";

const opts = queryOptions({
  queryKey: ["onboarding"],
  queryFn: () => getOnboardingStatus(),
});

export const Route = createFileRoute("/_authenticated/app/onboarding")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const steps = [
    {
      done: data.hasMfa,
      title: "Secure your account (2FA)",
      desc: "Enable TOTP multi-factor authentication on your profile.",
      to: "/app/profile",
      cta: "Open security",
    },
    {
      done: data.hasExchange,
      title: "Connect an exchange",
      desc: "Add Binance, Bybit, OKX, KuCoin, MEXC API keys — or paper mode.",
      to: "/app/exchanges",
      cta: "Connect exchange",
    },
    {
      done: data.hasRisk,
      title: "Configure risk",
      desc: "Set position size, daily loss limits, and kill-switch preferences.",
      to: "/app/risk",
      cta: "Risk settings",
    },
    {
      done: data.hasSource,
      title: "Add a signal source",
      desc: "Bind Telegram / webhooks or subscribe on the marketplace.",
      to: "/app/sources",
      cta: "Trade plan",
    },
    {
      done: data.hasPlan,
      title: "Activate a plan",
      desc: "Pay with crypto (NOWPayments) or manual USDT.",
      to: "/app/billing",
      cta: "Billing",
    },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome to ${BRAND.name}`}
        subtitle={`Setup guide — ${data.stepsDone}/${data.stepsTotal} complete. Trade safely with full control.`}
      />
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(data.stepsDone / data.stepsTotal) * 100}%` }}
        />
      </div>
      {data.complete && (
        <Card className="mb-4 border-primary/40">
          <p className="text-sm font-medium text-primary">You&apos;re ready to trade on {BRAND.name}.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep monitoring Active Trades and enable the kill switch if markets turn chaotic.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/app">Go to dashboard</Link>
          </Button>
        </Card>
      )}
      <div className="space-y-3">
        {steps.map((s, i) => (
          <Card key={s.title} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {i + 1}. {s.title}
                </p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
            {!s.done && (
              <Button asChild size="sm" variant="outline">
                <Link to={s.to as never}>{s.cta}</Link>
              </Button>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
