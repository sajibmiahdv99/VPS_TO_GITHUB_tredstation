import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { getLocale, setLocale, t, type Locale } from "@/lib/i18n";

export function PublicNav() {
  const [locale, setLoc] = useState<Locale>("en");

  useEffect(() => {
    setLoc(getLocale());
  }, []);

  function toggleLocale() {
    const next: Locale = locale === "en" ? "bn" : "en";
    setLocale(next);
    setLoc(next);
    // soft refresh of labeled UI without full reload
    window.dispatchEvent(new Event("agent-tred-locale"));
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo size="md" />
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <nav className="hidden gap-8 text-sm text-muted-foreground md:flex">
          <Link to="/pricing" className="transition hover:text-foreground">
            {t("nav.pricing", locale)}
          </Link>
          <Link to="/affiliate" className="transition hover:text-foreground">
            {t("nav.affiliate", locale)}
          </Link>
          <Link to="/faq" className="transition hover:text-foreground">
            {t("nav.faq", locale)}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            className="rounded-lg border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
            title="Language / ভাষা"
          >
            {locale === "en" ? "BN" : "EN"}
          </button>
          <Link
            to="/auth"
            className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            {t("nav.signin", locale)}
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90"
          >
            {t("nav.getStarted", locale)}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card/20">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
        <div>
          © {new Date().getFullYear()} {BRAND.footerName}
        </div>
        <div className="flex gap-5">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
