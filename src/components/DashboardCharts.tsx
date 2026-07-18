import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/PageHeader";

type Point = { t: string; balance: number; pnl: number };
type Dist = { symbol: string; pnl: number; trades: number };

const PROFIT = "#34d399";
const LOSS = "#f87171";
const VIOLET = "#8b7cf7";
const MUTED = "#6b7280";

export function DashboardCharts({
  balanceSeries,
  pnlDistribution,
  wins,
  losses,
  winRate,
}: {
  balanceSeries: Point[];
  pnlDistribution: Dist[];
  wins: number;
  losses: number;
  winRate: number;
}) {
  const winData = [
    { name: "Wins", value: wins || 0, color: PROFIT },
    { name: "Losses", value: losses || 0, color: LOSS },
  ];
  const seriesForChart = balanceSeries.map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  const tipStyle = {
    background: "oklch(0.14 0.025 285)",
    border: "1px solid oklch(1 0 0 / 10%)",
    borderRadius: 12,
    fontSize: 12,
    color: "#e5e7eb",
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Orders / profit</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            Balance series
          </span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <AreaChart data={seriesForChart} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROFIT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PROFIT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: MUTED }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                contentStyle={tipStyle}
                formatter={(v: number) => [`$${Number(v).toLocaleString()}`, "Balance"]}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke={PROFIT}
                strokeWidth={2.5}
                fill="url(#balFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Win rate</h3>
          <span className="text-sm font-semibold text-profit">{winRate.toFixed(1)}%</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={winData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={3}
                stroke="transparent"
              >
                {winData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-center justify-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: PROFIT }} /> Wins{" "}
            {wins}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: LOSS }} /> Losses{" "}
            {losses}
          </span>
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">PnL by symbol</h3>
          <span className="text-xs text-muted-foreground">Net per market</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <BarChart data={pnlDistribution} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <XAxis dataKey="symbol" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                cursor={{ fill: "oklch(0.3 0.05 290 / 0.2)" }}
                contentStyle={tipStyle}
                formatter={(v: number) => [`$${Number(v).toLocaleString()}`, "PnL"]}
              />
              <Bar dataKey="pnl" radius={[8, 8, 0, 0]}>
                {pnlDistribution.map((d) => (
                  <Cell key={d.symbol} fill={d.pnl >= 0 ? PROFIT : LOSS} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
