import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Copy, Trash2 } from "lucide-react";

type Enrollment = {
  factorId: string;
  qr: string;
  secret: string;
  challengeId?: string;
};

export function SecurityMfa() {
  const qc = useQueryClient();
  const factors = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const totpFactors = factors.data?.totp ?? [];
  const allFactors = factors.data?.all ?? [];

  async function startEnroll() {
    setBusy(true);
    try {
      // Clean up any stale unverified TOTP factor first
      const stale = allFactors.find((f) => f.factor_type === "totp" && f.status !== "verified");
      if (stale) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnrollment({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    if (!enrollment) return;
    setBusy(true);
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (ch.error) throw ch.error;
      const v = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: ch.data.id,
        code: code.trim(),
      });
      if (v.error) throw v.error;
      toast.success("Two-factor authentication enabled");
      setEnrollment(null);
      setCode("");
      qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (!enrollment) return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    } finally {
      setEnrollment(null);
      setCode("");
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    }
  }

  async function removeFactor(factorId: string) {
    if (!confirm("Remove this authenticator? You'll no longer be prompted for a code at sign-in.")) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Authenticator removed");
      qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  const verifiedTotp = totpFactors.filter((f) => f.status === "verified");

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <h3 className="text-base font-semibold">Two-factor authentication</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Add a time-based one-time password (TOTP) from an authenticator app like 1Password, Authy, or Google Authenticator. Strongly recommended since your exchange API keys are stored here.
      </p>

      {verifiedTotp.length > 0 && (
        <div className="mt-5 space-y-2">
          {verifiedTotp.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">{f.friendly_name || "Authenticator app"}</div>
                <div className="text-xs text-muted-foreground">
                  TOTP · verified · added {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => removeFactor(f.id)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {!enrollment && verifiedTotp.length === 0 && (
        <div className="mt-5">
          <Button onClick={startEnroll} disabled={busy}>
            {busy ? "Preparing…" : "Enable two-factor authentication"}
          </Button>
        </div>
      )}

      {enrollment && (
        <div className="mt-5 space-y-4 rounded-md border border-border p-4">
          <div>
            <Label className="text-xs">1. Scan this QR code with your authenticator app</Label>
            <div className="mt-2 inline-block rounded-md bg-white p-3">
              <img src={enrollment.qr} alt="TOTP QR code" width={192} height={192} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Or enter this secret manually</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{enrollment.secret}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(enrollment.secret);
                  toast.success("Secret copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">2. Enter the 6-digit code from your app</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="mt-1 tracking-widest"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={verifyEnroll} disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify & enable"}
            </Button>
            <Button variant="ghost" onClick={cancelEnroll} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
