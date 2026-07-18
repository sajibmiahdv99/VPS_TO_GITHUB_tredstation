import { createFileRoute } from "@tanstack/react-router";
import { PublicNav, PublicFooter } from "@/components/PublicNav";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "Privacy Policy — AGENT TRED" },
    { name: "description", content: "How AGENT TRED handles your data." },
    { property: "og:title", content: "Privacy Policy — AGENT TRED" },
    { property: "og:description", content: "How AGENT TRED handles your data." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-muted-foreground">How AGENT TRED handles your data.</p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Detailed content for this page will be added in the next phase.
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
