import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

const search = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  next: z.string().optional(),
  ref: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({ meta: [{ title: `Sign in — ${BRAND.name}` }] }),
  component: AuthPage,
});

function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function AuthPage() {
  const { mode, next, ref } = useSearch({ from: "/auth" });
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(mode === "signup" || Boolean(ref));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // MFA challenge state
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const destination = safeNext(next);

  function goAfterAuth() {
    if (destination) {
      window.location.replace(destination);
      return;
    }
    router.navigate({ to: "/app", replace: true });
  }

  async function checkAalAndMaybePromptMfa(): Promise<boolean> {
    // Returns true if MFA challenge is required (caller should NOT navigate)
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return false;
    if (data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel) {
      const { data: fData, error: fErr } = await supabase.auth.mfa.listFactors();
      if (fErr) {
        setErr(fErr.message);
        return true;
      }
      const totp = (fData.totp ?? []).find((f) => f.status === "verified");
      if (!totp) return false;
      setMfaFactorId(totp.id);
      return true;
    }
    return false;
  }

  useEffect(() => {
    // If arriving here via router-guard redirect with an active aal1 session,
    // immediately show the TOTP challenge without requiring password re-entry.
    checkAalAndMaybePromptMfa().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (isSignup) {
        const emailRedirectTo = destination
          ? `${window.location.origin}${destination}`
          : window.location.origin;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: { full_name: name, ...(ref ? { ref } : {}) },
          },
        });
        if (error) throw error;
        goAfterAuth();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const needsMfa = await checkAalAndMaybePromptMfa();
        if (!needsMfa) goAfterAuth();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setErr(null);
    setBusy(true);
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (ch.error) throw ch.error;
      const v = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: ch.data.id,
        code: mfaCode.trim(),
      });
      if (v.error) throw v.error;
      goAfterAuth();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid code. Please try again.");
      setMfaCode("");
    } finally {
      setBusy(false);
    }
  }

  async function cancelMfa() {
    await supabase.auth.signOut();
    setMfaFactorId(null);
    setMfaCode("");
    setErr(null);
  }

  async function google() {
    setErr(null);
    setBusy(true);
    try {
      // Native Supabase Google OAuth — configure provider in self-hosted GoTrue / Supabase Auth.
      const redirectTo = destination
        ? `${window.location.origin}${destination}`
        : `${window.location.origin}/app`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) setErr(error.message ?? "Google sign-in failed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (mfaFactorId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
          <Link to="/" className="mb-6 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{BRAND.logoInitial}</span>
            <span className="text-lg font-semibold">{BRAND.name}</span>
          </Link>
          <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </p>
          <form onSubmit={verifyMfa} className="mt-6 space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button
              type="submit"
              disabled={busy || mfaCode.length !== 6}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={cancelMfa}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel and sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const fieldCls =
    "w-full rounded-xl border border-border bg-background/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/30";

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/90 p-8 shadow-2xl shadow-primary/10 backdrop-blur">
        <Link to="/" className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[11px] font-bold text-primary-foreground shadow-lg shadow-primary/30">
            {BRAND.logoInitial}
          </span>
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isSignup ? "Start free — upgrade anytime with crypto." : "Sign in to your trading workstation."}
        </p>

        <button
          type="button"
          onClick={google}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-sm font-medium transition hover:border-primary/40 hover:bg-accent"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {isSignup && (
            <input
              type="text"
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldCls}
            />
          )}
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldCls}
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : `New to ${BRAND.name}? `}
          <button type="button" onClick={() => setIsSignup((v) => !v)} className="font-medium text-primary hover:underline">
            {isSignup ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}
