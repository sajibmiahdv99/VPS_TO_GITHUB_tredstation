import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const variants = {
  violet: "kpi-violet",
  magenta: "kpi-magenta",
  rose: "kpi-rose",
  emerald: "kpi-emerald",
  neutral: "bg-card border border-border",
} as const;

export function KpiCard({
  label,
  value,
  hint,
  icon,
  variant = "neutral",
  className,
  action,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "card-lift relative overflow-hidden rounded-2xl p-5 text-white shadow-lg",
        variants[variant],
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/70">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
          {hint && <p className="mt-1 text-xs text-white/60">{hint}</p>}
          {action && <div className="mt-3">{action}</div>}
        </div>
        {icon && <div className="shrink-0 rounded-xl bg-black/20 p-2 text-white/90">{icon}</div>}
      </div>
    </div>
  );
}
