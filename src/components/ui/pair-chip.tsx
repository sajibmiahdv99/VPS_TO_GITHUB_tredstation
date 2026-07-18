import { cn } from "@/lib/utils";

export function PairChip({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("pair-chip", active && "pair-chip-active", className)}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/30 text-[9px] font-bold text-primary">
        {label.slice(0, 1)}
      </span>
      {label}
    </button>
  );
}

export function PairChipRow({
  items,
  value,
  onChange,
  allLabel = "All",
}: {
  items: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <PairChip label={allLabel} active={value == null} onClick={() => onChange(null)} />
      {items.map((item) => (
        <PairChip key={item} label={item} active={value === item} onClick={() => onChange(item)} />
      ))}
    </div>
  );
}
