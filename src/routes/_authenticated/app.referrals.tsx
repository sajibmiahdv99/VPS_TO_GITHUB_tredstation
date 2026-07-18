import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { getReferrals } from "@/lib/user.functions";

const opts = queryOptions({ queryKey: ["referrals"], queryFn: () => getReferrals() });

export const Route = createFileRoute("/_authenticated/app/referrals")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const aff = data.affiliate;
  const code = data.referralCode ?? "";
  const link =
    typeof window !== "undefined" && code ? `${window.location.origin}/auth?ref=${code}&mode=signup` : "";

  if (!data.entitled) {
    return (
      <>
        <PageHeader title="Affiliate program" subtitle="Earn multi-level commissions on paid subscriptions." />
        <Card className="border-primary/30">
          <p className="text-sm font-medium">Affiliate access starts on Starter and above</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Free trial users do not earn commissions. Upgrade to unlock your referral link and rank path.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link to="/app/billing">View plans</Link>
          </Button>
        </Card>
      </>
    );
  }

  const directs = Number(aff?.direct_referrals ?? 0);

  return (
    <>
      <PageHeader
        title="Affiliate program"
        subtitle="7-generation commissions · rank bonuses paid manually by admin"
      />

      <Card className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Your referral link</p>
        <div className="mt-2 flex gap-2">
          <Input readOnly value={link} />
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(link);
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Code: <span className="font-mono text-foreground">{code}</span>
        </p>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <p className="text-xs uppercase text-muted-foreground">Rank</p>
          <p className="mt-2 text-lg font-semibold">{aff?.rank ?? "Member"}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted-foreground">Direct referrals</p>
          <p className="mt-2 text-2xl font-semibold">{directs}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted-foreground">Your L1 rate</p>
          <p className="mt-2 text-2xl font-semibold text-primary">{data.l1Rate}%</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {directs >= 15 ? "Max tier" : directs >= 10 ? "Next: 20% at 15 directs" : "Next: 15% at 10 directs"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted-foreground">Total earned</p>
          <p className="mt-2 text-2xl font-semibold">{Number(aff?.total_earned ?? 0).toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted-foreground">Pending</p>
          <p className="mt-2 text-2xl font-semibold">{Number(aff?.total_pending ?? 0).toFixed(2)}</p>
        </Card>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold">Generation commissions</p>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {data.structure.levels.map((l) => (
              <li key={l.level} className="flex justify-between gap-2 border-b border-border/50 py-1">
                <span>{l.label}</span>
                <span className="font-medium text-foreground">{l.rates}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="text-sm font-semibold">Rank path</p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {data.structure.ranks.map((r) => (
              <li key={r.rank}>
                <span className="font-medium text-foreground">{r.rank}</span>
                <span className="block">{r.condition}</span>
                {"bonus" in r && r.bonus && (
                  <Badge variant="outline" className="mt-1">
                    Bonus {r.bonus}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-amber-400/90">
            Rank bonuses are not auto-paid — finance admin pays them manually.
          </p>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Recent commissions
      </h2>
      {data.commissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No commissions yet. Share your link when friends subscribe.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.commissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>L{c.level}</TableCell>
                  <TableCell className="text-xs">
                    {(c as { rate?: number }).rate != null
                      ? `${Number((c as { rate?: number }).rate).toFixed(1)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{Number(c.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs uppercase">{c.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
