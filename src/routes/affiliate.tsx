import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicNav, PublicFooter } from "@/components/PublicNav";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/affiliate")({
  head: () => ({
    meta: [
      { title: `Affiliate Program — ${BRAND.name}` },
      {
        name: "description",
        content: `Earn 7-generation commissions and rank bonuses by referring traders to ${BRAND.name}.`,
      },
      { property: "og:title", content: `Affiliate Program — ${BRAND.name}` },
      {
        property: "og:description",
        content: "Multi-level affiliate: 30% / 10% / 5% downline + rank bonuses.",
      },
    ],
  }),
  component: Page,
});

const ranks = [
  { name: "Member", req: "Join Starter+", bonus: "—" },
  { name: "Team Leader", req: "3 direct actives", bonus: "—" },
  { name: "Manager", req: "10 directs + volume", bonus: "—" },
  { name: "Director", req: "25 directs + volume", bonus: "—" },
  { name: "Brand Executive", req: "50 directs + volume", bonus: "2% rank" },
  { name: "Senior Brand Executive", req: "100 directs + volume", bonus: "1% rank" },
];

const gens = [
  { g: "G1", rate: "30%" },
  { g: "G2", rate: "10%" },
  { g: "G3", rate: "5%" },
  { g: "G4–G7", rate: "configured in admin" },
];

function Page() {
  return (
    <div className="mesh-bg min-h-screen text-foreground">
      <PublicNav />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <span className="inline-flex rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          7-layer affiliate
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Earn with every trader you bring
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          {BRAND.name} pays multi-generation commissions on paid plans plus manual rank bonuses.
          Affiliate access unlocks on <strong className="text-foreground">Starter</strong> and above.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {gens.map((x) => (
            <div
              key={x.g}
              className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm backdrop-blur"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{x.g}</div>
              <div className="mt-2 text-2xl font-semibold text-primary">{x.rate}</div>
              <div className="mt-1 text-xs text-muted-foreground">of paid subscription</div>
            </div>
          ))}
        </div>

        <h2 className="mt-14 text-xl font-semibold">Rank path</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Typical requirements</th>
                <th className="px-4 py-3">Rank bonus</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) => (
                <tr key={r.name} className="border-t border-border/80">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.req}</td>
                  <td className="px-4 py-3 text-primary">{r.bonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            Create account
          </Link>
          <Link
            to="/app/referrals"
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            Open affiliate dashboard
          </Link>
          <Link
            to="/pricing"
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            View plans
          </Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
