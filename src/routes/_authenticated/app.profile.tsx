import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getMyProfile } from "@/lib/profile.functions";
import { updateMyProfile } from "@/lib/user.functions";
import { SecurityMfa } from "@/components/SecurityMfa";
import { getMyKycStatus, requestKycVerification, type KycStatus } from "@/lib/kyc.functions";

const opts = queryOptions({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
const kycOpts = queryOptions({ queryKey: ["my-kyc"], queryFn: () => getMyKycStatus() });

export const Route = createFileRoute("/_authenticated/app/profile")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(opts),
      context.queryClient.ensureQueryData(kycOpts),
    ]),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

const KYC_LABEL: Record<KycStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "bg-amber-500/20 text-amber-400" },
  verified: { label: "Verified", className: "bg-emerald-500/20 text-emerald-400" },
  rejected: { label: "Rejected", className: "bg-red-500/20 text-red-400" },
};

function Page() {
  const { data } = useSuspenseQuery(opts);
  const { data: kyc } = useSuspenseQuery(kycOpts);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const kycFn = useServerFn(requestKycVerification);
  const [form, setForm] = useState({ full_name: "", timezone: "", locale: "", avatar_url: "" });

  useEffect(() => {
    if (data) setForm({
      full_name: data.full_name ?? "",
      timezone: data.timezone ?? "",
      locale: data.locale ?? "",
      avatar_url: data.avatar_url ?? "",
    });
  }, [data]);

  const m = useMutation({
    mutationFn: () => updateFn({ data: form }),
    onSuccess: () => { toast.success("Profile updated"); qc.invalidateQueries({ queryKey: ["my-profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startKyc = useMutation({
    mutationFn: () => kycFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-kyc"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const kycBadge = KYC_LABEL[kyc.status];

  return (
    <>
      <PageHeader title="Profile" subtitle="Personal info and account preferences." />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Email</Label><Input readOnly value={data?.email ?? ""} /></div>
          <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Avatar URL</Label><Input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." /></div>
          <div><Label>Timezone</Label><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="UTC" /></div>
          <div><Label>Locale</Label><Input value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} placeholder="en" /></div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </Card>
      <div className="mt-6">
        <SecurityMfa />
      </div>
      <Card className="mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">Identity verification</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Identity verification will be required for certain account tiers once enabled.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={kycBadge.className}>{kycBadge.label}</Badge>
            <Button
              variant="outline"
              disabled={startKyc.isPending || kyc.status === "verified" || kyc.status === "pending"}
              onClick={() => startKyc.mutate()}
            >
              {startKyc.isPending ? "…" : "Start verification"}
            </Button>
          </div>
        </div>
        {kyc.rejected_reason && kyc.status === "rejected" ? (
          <p className="mt-3 text-xs text-red-400">Reason: {kyc.rejected_reason}</p>
        ) : null}
      </Card>
    </>
  );
}

