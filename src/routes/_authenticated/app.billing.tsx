import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBilling } from "@/lib/user.functions";
import {
  claimManualPayment,
  listCheckoutProviders,
  startPlanCheckout,
} from "@/lib/payment.functions";
import { redeemPromoCode } from "@/lib/promo.functions";

const opts = queryOptions({ queryKey: ["billing"], queryFn: () => getBilling() });

export const Route = createFileRoute("/_authenticated/app/billing")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const sub = data.subscription;
  const providersQ = useQuery({ queryKey: ["checkout-providers"], queryFn: () => listCheckoutProviders() });
  const startFn = useServerFn(startPlanCheckout);
  const claimFn = useServerFn(claimManualPayment);

  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutResult, setCheckoutResult] = useState<Awaited<ReturnType<typeof startPlanCheckout>> | null>(
    null,
  );

  const checkout = useMutation({
    mutationFn: (args: { plan_code: string; provider: "nowpayments" | "manual_usdt" | "stripe" | "paddle" }) =>
      startFn({ data: { plan_code: args.plan_code, interval, provider: args.provider } }),
    onSuccess: (res) => {
      setCheckoutResult(res);
      toast.success("Checkout created");
      qc.invalidateQueries({ queryKey: ["billing"] });
      if (res.payUrl) window.open(res.payUrl, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const claim = useMutation({
    mutationFn: (invoice_id: string) => claimFn({ data: { invoice_id } }),
    onSuccess: () => {
      toast.success("Marked as paid — waiting for admin confirmation");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [promo, setPromo] = useState("");
  const redeemFn = useServerFn(redeemPromoCode);
  const redeem = useMutation({
    mutationFn: () => redeemFn({ data: { code: promo } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setPromo("");
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const providers = (providersQ.data ?? []).filter((p) => p.configured || p.id === "manual_usdt");
  const publicCrypto = providers.filter((p) => p.id === "nowpayments" || p.id === "manual_usdt");
  // Card providers only if admin explicitly enabled them (listCheckoutProviders already filters)
  const cards = providers.filter((p) => p.id === "stripe" || p.id === "paddle");

  return (
    <>
      <PageHeader title="Billing" subtitle="Subscription and crypto payments (USDT)." />
      <Card className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Promo code</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Redeem an admin-issued code to activate a plan without payment.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[180px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="PROMOCODE"
            value={promo}
            onChange={(e) => setPromo(e.target.value.toUpperCase())}
          />
          <Button
            size="sm"
            onClick={() => redeem.mutate()}
            disabled={!promo.trim() || redeem.isPending}
          >
            {redeem.isPending ? "…" : "Redeem"}
          </Button>
        </div>
      </Card>
      <Card className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Current subscription</p>
        {sub ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-xl font-semibold capitalize">{sub.plan_code}</p>
            <p className="text-sm text-muted-foreground">
              {sub.billing_interval} · {sub.status}
            </p>
            {sub.current_period_ends_at && (
              <p className="text-xs text-muted-foreground">
                Renews {new Date(sub.current_period_ends_at).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No active subscription.</p>
        )}
      </Card>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Billing interval:</span>
        <Button
          size="sm"
          variant={interval === "monthly" ? "default" : "outline"}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </Button>
        <Button
          size="sm"
          variant={interval === "yearly" ? "default" : "outline"}
          onClick={() => setInterval("yearly")}
        >
          Yearly
        </Button>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plans</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans.map((p) => {
          const price = interval === "yearly" ? Number(p.yearly_price) : Number(p.monthly_price);
          return (
            <Card key={p.code}>
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
              <p className="mt-3 text-2xl font-bold">
                ${price.toFixed(0)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{interval === "yearly" ? "yr" : "mo"}
                </span>
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>
                  {Number(p.max_open_positions) >= 9999 ? "Unlimited" : p.max_open_positions} open positions
                </li>
                <li>{p.max_daily_trades} trades / day</li>
              </ul>
              <div className="mt-4 flex flex-col gap-2">
                {publicCrypto.map((prov) => (
                  <Button
                    key={prov.id}
                    size="sm"
                    variant={prov.id === "nowpayments" ? "default" : "outline"}
                    disabled={!prov.configured || checkout.isPending}
                    onClick={() =>
                      checkout.mutate({
                        plan_code: p.code,
                        provider: prov.id as "nowpayments" | "manual_usdt",
                      })
                    }
                  >
                    {prov.id === "nowpayments" ? "Pay with crypto" : "Manual USDT"}
                    {!prov.configured ? " (not configured)" : ""}
                  </Button>
                ))}
                {cards.map((prov) => (
                  <Button
                    key={prov.id}
                    size="sm"
                    variant="secondary"
                    disabled={!prov.configured || checkout.isPending}
                    onClick={() =>
                      checkout.mutate({
                        plan_code: p.code,
                        provider: prov.id as "stripe" | "paddle",
                      })
                    }
                  >
                    {prov.label}
                  </Button>
                ))}
                {publicCrypto.length === 0 && (
                  <p className="text-xs text-muted-foreground">No payment methods available. Contact admin.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {checkoutResult?.deposit && (
        <Card className="mt-6 border-amber-500/40">
          <p className="text-sm font-semibold">USDT deposit instructions</p>
          <p className="mt-2 text-xs text-muted-foreground">{checkoutResult.deposit.instructions}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Network</dt>
              <dd className="font-medium">{checkoutResult.deposit.network}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-medium">
                {checkoutResult.deposit.amount} {checkoutResult.deposit.currency}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Address</dt>
              <dd className="break-all font-mono text-xs">{checkoutResult.deposit.address}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Memo / invoice</dt>
              <dd className="font-mono text-xs">{checkoutResult.deposit.memo}</dd>
            </div>
          </dl>
        </Card>
      )}

      {checkoutResult?.payUrl && (
        <Card className="mt-6">
          <p className="text-sm">
            If the payment page did not open,{" "}
            <a className="text-amber-400 underline" href={checkoutResult.payUrl} target="_blank" rel="noreferrer">
              click here
            </a>
            .
          </p>
        </Card>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Invoices</h2>
      {data.invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.invoice_number}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {i.issued_at ? new Date(i.issued_at).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell>
                    {Number(i.amount).toFixed(2)} {i.currency}
                  </TableCell>
                  <TableCell className="text-xs uppercase">{i.status}</TableCell>
                  <TableCell className="text-right">
                    {(i.status === "open" || i.status === "pending") && (
                      <Button size="sm" variant="outline" onClick={() => claim.mutate(i.id)} disabled={claim.isPending}>
                        I paid
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
