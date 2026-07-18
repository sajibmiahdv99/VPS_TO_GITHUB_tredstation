import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PublicNav, PublicFooter } from "@/components/PublicNav";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/integrations/supabase/client";
import { featuresFromPlan, formatPositionLimit } from "@/lib/plans/entitlements";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: `Pricing — ${BRAND.name}` },
      {
        name: "description",
        content: `Free trial, Starter, Pro, Premium VIP — crypto payments on ${BRAND.name}.`,
      },
    ],
  }),
  component: Page,
});

function FeatureRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className={ok ? "text-foreground/90" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

function Page() {
  const plansQ = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          "code,name,description,monthly_price,yearly_price,max_open_positions,max_daily_trades,features,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mesh-bg min-h-screen text-foreground">
      <PublicNav />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {BRAND.name} plans with clear entitlements. Pay with crypto (NOWPayments / manual USDT). All users get a
          referral code; commissions unlock from Starter up.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {(plansQ.data ?? []).map((p) => {
            const f = featuresFromPlan(p.code, p.features as Record<string, unknown> | null);
            const price = Number(p.monthly_price);
            return (
              <div
                key={p.code}
                className={`card-lift flex flex-col rounded-2xl border p-6 ${
                  p.code === "pro" ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10" : "border-border bg-card/80"
                }`}
              >
                {p.code === "pro" && (
                  <span className="mb-2 w-fit rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    Popular
                  </span>
                )}
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                <p className="mt-4 text-3xl font-bold">
                  {price === 0 ? "Free" : `$${price.toFixed(0)}`}
                  {price > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                </p>
                {Number(p.yearly_price) > 0 && (
                  <p className="text-xs text-muted-foreground">${Number(p.yearly_price).toFixed(0)}/yr</p>
                )}
                <ul className="mt-5 flex-1 space-y-2">
                  <FeatureRow ok label={`${f.max_exchange_accounts} exchange account(s)`} />
                  <FeatureRow
                    ok
                    label={`${formatPositionLimit(f.max_open_positions_limit)} open positions`}
                  />
                  <FeatureRow ok={f.platform_managed_sources} label="Platform signal sources" />
                  <FeatureRow ok={f.user_connected_telegram} label="Connect your Telegram" />
                  <FeatureRow
                    ok={Boolean(f.advanced_risk_controls)}
                    label={
                      f.advanced_risk_controls === "limited"
                        ? "Limited advanced risk"
                        : f.advanced_risk_controls
                          ? "Full advanced risk"
                          : "Basic risk only"
                    }
                  />
                  <FeatureRow ok label={`Analytics: ${f.analytics_depth}`} />
                  <FeatureRow ok={f.affiliate_access} label="Affiliate program" />
                  <FeatureRow ok={f.priority_support} label="Priority support" />
                  <FeatureRow ok={f.custom_risk_templates} label="Custom risk templates" />
                  <FeatureRow ok={f.premium_source_access} label="Premium sources" />
                </ul>
                <Link
                  to="/auth"
                  search={{ mode: "signup" } as never}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20"
                >
                  {price === 0 ? "Start free trial" : "Get started"}
                </Link>
              </div>
            );
          })}
        </div>
        {plansQ.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading plans…</p>}
      </section>
      <PublicFooter />
    </div>
  );
}
