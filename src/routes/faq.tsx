import { createFileRoute } from "@tanstack/react-router";
import { PublicNav, PublicFooter } from "@/components/PublicNav";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [
    { title: "FAQ — AGENT TRED" },
    { name: "description", content: "Answers to common questions about AGENT TRED." },
    { property: "og:title", content: "FAQ — AGENT TRED" },
    { property: "og:description", content: "Answers to common questions about AGENT TRED." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">FAQ</h1>
        <p className="mt-3 text-muted-foreground">Answers to common questions about AGENT TRED.</p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Detailed content for this page will be added in the next phase.
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
