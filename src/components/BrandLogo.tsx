import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

type Props = {
  className?: string;
  /** icon box size classes, default h-9 w-9 */
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  wordmarkClassName?: string;
  /** subtle ring for super-admin */
  variant?: "default" | "violet" | "admin";
};

const sizeMap = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

/**
 * AGENT TRED brand mark — uses raster logo with SVG fallback.
 */
export function BrandLogo({
  className,
  size = "md",
  showWordmark = false,
  wordmarkClassName,
  variant = "default",
}: Props) {
  const ring =
    variant === "violet"
      ? "ring-2 ring-violet-500/40 shadow-lg shadow-violet-600/25"
      : variant === "admin"
        ? "ring-2 ring-primary/30 shadow-lg shadow-primary/20"
        : "shadow-lg shadow-primary/25";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0b0f1a]",
          sizeMap[size],
          ring,
        )}
      >
        <img
          src={BRAND.logoUrl}
          alt={BRAND.name}
          width={size === "lg" ? 44 : size === "sm" ? 32 : 36}
          height={size === "lg" ? 44 : size === "sm" ? 32 : 36}
          className="h-full w-full object-cover"
          onError={(e) => {
            const el = e.currentTarget;
            if (el.src.endsWith("logo.svg")) return;
            el.src = BRAND.logoSvgUrl;
          }}
        />
      </span>
      {showWordmark && (
        <span className={cn("min-w-0", wordmarkClassName)}>
          <span className="block text-sm font-semibold leading-none tracking-tight">{BRAND.name}</span>
          {BRAND.tagline ? (
            <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
              {BRAND.tagline}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
