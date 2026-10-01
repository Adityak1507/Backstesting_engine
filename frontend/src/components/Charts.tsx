import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Fill, SeriesPoint } from "../api";
import { money, moneyCompact, monthYear, pct, shortDate } from "../format";
import { useChartColors } from "../theme";

const SYNC = "backtest";
const AXIS_FONT = { fontSize: 11, fontFamily: "Inter, system-ui, sans-serif" };

interface TooltipProps {
  active?: boolean;
  payload?: readonly { payload?: SeriesPoint }[];
}

function Triangle({ cx = 0, cy = 0, up, fill, stroke }: { cx?: number; cy?: number; up: boolean; fill: string; stroke: string }) {
  const s = 5.5;
  const d = up
    ? `M${cx},${cy - s} L${cx + s},${cy + s * 0.8} L${cx - s},${cy + s * 0.8} Z`
    : `M${cx},${cy + s} L${cx + s},${cy - s * 0.8} L${cx - s},${cy - s * 0.8} Z`;
  return <path d={d} fill={fill} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />;
}

export function EquityChart({ series, fills }: { series: SeriesPoint[]; fills: Fill[] }) {
  const c = useChartColors();
  const fillsByDate = useMemo(() => {
    const map = new Map<string, Fill[]>();
    for (const f of fills) map.set(f.timestamp, [...(map.get(f.timestamp) ?? []), f]);
    return map;
  }, [fills]);
  const equityByDate = useMemo(() => new Map(series.map((p) => [p.date, p.equity])), [series]);

  const renderTooltip = ({ active, payload }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    if (!p) return null;
    const dayFills = fillsByDate.get(p.date) ?? [];
    return (
      <div className="tooltip">
        <div className="tooltip-title">{shortDate(p.date)}</div>
        <div className="tooltip-row">
          <span>
            <i className="dot" style={{ background: c["series-1"] }} />
            Strategy
          </span>
          <span className="num">{money(p.equity)}</span>
        </div>
        <div className="tooltip-row">
          <span>
            <i className="dot" style={{ background: c["series-ref"] }} />
            Buy &amp; hold
          </span>
          <span className="num">{money(p.benchmark)}</span>
        </div>
        {dayFills.map((f, i) => (
          <div className="tooltip-row" key={i} style={{ marginTop: 4 }}>
            <span>{f.quantity > 0 ? "▲ Bought" : "▽ Sold"}</span>
            <span className="num">
              {Math.abs(f.quantity).toLocaleString()} @ {money(f.price, 2)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={series} syncId={SYNC} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={monthYear}
          minTickGap={48}
          tick={{ ...AXIS_FONT, fill: c["text-3"] }}
          tickLine={false}
          axisLine={{ stroke: c["border-strong"] }}
        />
        <YAxis
          tickFormatter={moneyCompact}
          tick={{ ...AXIS_FONT, fill: c["text-3"] }}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={["auto", "auto"]}
        />
        <Tooltip content={renderTooltip} cursor={{ stroke: c["border-strong"], strokeWidth: 1 }} isAnimationActive={false} />
        <Line
          dataKey="benchmark"
          stroke={c["series-ref"]}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3.5, strokeWidth: 2, stroke: c.surface }}
          isAnimationActive={false}
        />
        <Line
          dataKey="equity"
          stroke={c["series-1"]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
          isAnimationActive={false}
        />
        {fills.map((f, i) => {
          const y = equityByDate.get(f.timestamp);
          if (y == null) return null;
          const up = f.quantity > 0;
          return (
            <ReferenceDot
              key={i}
              x={f.timestamp}
              y={y}
              ifOverflow="extendDomain"
              shape={(props: { cx?: number; cy?: number }) => (
                <Triangle {...props} up={up} fill={up ? c.text : c.surface} stroke={c.text} />
              )}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ series }: { series: SeriesPoint[] }) {
  const c = useChartColors();
  const renderTooltip = ({ active, payload }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    if (!p) return null;
    return (
      <div className="tooltip">
        <div className="tooltip-title">{shortDate(p.date)}</div>
        <div className="tooltip-row">
          <span>Drawdown</span>
          <span className="num">{pct(p.drawdown)}</span>
        </div>
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={series} syncId={SYNC} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={monthYear}
          minTickGap={48}
          tick={{ ...AXIS_FONT, fill: c["text-3"] }}
          tickLine={false}
          axisLine={{ stroke: c["border-strong"] }}
        />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={{ ...AXIS_FONT, fill: c["text-3"] }}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[(min: number) => Math.min(-0.05, Math.floor(min * 20) / 20), 0]}
          tickCount={5}
          allowDecimals
        />
        <Tooltip content={renderTooltip} cursor={{ stroke: c["border-strong"], strokeWidth: 1 }} isAnimationActive={false} />
        <Area
          dataKey="drawdown"
          stroke={c["series-neg"]}
          strokeWidth={1.5}
          fill={c["series-neg"]}
          fillOpacity={0.14}
          activeDot={{ r: 3.5, strokeWidth: 2, stroke: c.surface }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
