import { useEffect, useMemo, useRef, useState } from "react";
import type { SweepRange, SweepResponse, SweepRow } from "../api";
import { int, num, pct, signedPct } from "../format";
import { mix, useChartColors } from "../theme";

type MetricKey = "sharpe" | "total_return" | "max_drawdown";

const METRIC_OPTIONS: { key: MetricKey; label: string; format: (v: number | null) => string }[] = [
  { key: "sharpe", label: "Sharpe", format: (v) => num(v) },
  { key: "total_return", label: "Return", format: (v) => signedPct(v, 1) },
  { key: "max_drawdown", label: "Drawdown", format: (v) => pct(v, 1) },
];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Heatmap({
  result,
  metric,
  onPick,
}: {
  result: SweepResponse;
  metric: MetricKey;
  onPick: (row: SweepRow) => void;
}) {
  const c = useChartColors();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ row: SweepRow; x: number; y: number } | null>(null);
  const fmt = METRIC_OPTIONS.find((m) => m.key === metric)!.format;

  const { fast_values: fasts, slow_values: slows, rows } = result;
  const lookup = useMemo(() => new Map(rows.map((r) => [`${r.fast}:${r.slow}`, r])), [rows]);
  const best = useMemo(() => {
    const valid = rows.filter((r) => r[metric] != null);
    // Drawdown is negative: the best is the one closest to zero (the max), same as the others.
    return valid.reduce<SweepRow | null>((a, r) => (a == null || (r[metric] as number) > (a[metric] as number) ? r : a), null);
  }, [rows, metric]);
  const extent = useMemo(() => {
    const vals = rows.map((r) => r[metric]).filter((v): v is number => v != null && Number.isFinite(v));
    return Math.max(1e-9, ...vals.map(Math.abs));
  }, [rows, metric]);

  const color = (v: number | null) => {
    if (v == null || !Number.isFinite(v)) return c.grid;
    const t = Math.min(1, Math.abs(v) / extent);
    return v >= 0 ? mix(c["div-mid"], c["div-pos"], t) : mix(c["div-mid"], c["div-neg"], t);
  };

  const left = 44;
  const bottom = 36;
  const top = 4;
  const plotW = Math.max(0, width - left - 4);
  const cellW = slows.length ? plotW / slows.length : 0;
  const cellH = Math.max(6, Math.min(28, cellW * 0.9, 420 / Math.max(1, fasts.length)));
  const plotH = cellH * fasts.length;
  const height = plotH + top + bottom;
  const gap = cellW > 8 ? 1.5 : 0.5;

  // Label every k-th cell so tick labels stay at least ~28px apart.
  const tickEvery = (cellPx: number) => Math.max(1, Math.ceil(28 / Math.max(cellPx, 1)));
  const xEvery = tickEvery(cellW);
  const yEvery = tickEvery(cellH);

  return (
    <div className="heatmap-wrap" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Heatmap of ${metric} by fast and slow window`}>
          {fasts.map((f, yi) => {
            const y = top + plotH - (yi + 1) * cellH;
            return slows.map((s, xi) => {
              const row = lookup.get(`${f}:${s}`);
              if (!row) return null;
              const x = left + xi * cellW;
              const isBest = best != null && row.fast === best.fast && row.slow === best.slow;
              const isHover = hover?.row === row;
              return (
                <rect
                  key={`${f}:${s}`}
                  x={x + gap / 2}
                  y={y + gap / 2}
                  width={Math.max(0, cellW - gap)}
                  height={Math.max(0, cellH - gap)}
                  rx={Math.min(3, cellW / 6)}
                  fill={color(row[metric])}
                  stroke={isBest || isHover ? c.text : "none"}
                  strokeWidth={isBest || isHover ? 1.5 : 0}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover({ row, x: x + cellW, y })}
                  onClick={() => onPick(row)}
                />
              );
            });
          })}
          {slows.map((s, xi) =>
            xi % xEvery === 0 ? (
              <text
                key={s}
                x={left + xi * cellW + cellW / 2}
                y={top + plotH + 16}
                textAnchor="middle"
                fontSize={11}
                fill={c["text-3"]}
                className="num"
              >
                {s}
              </text>
            ) : null,
          )}
          {fasts.map((f, yi) =>
            yi % yEvery === 0 ? (
              <text
                key={f}
                x={left - 8}
                y={top + plotH - yi * cellH - cellH / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fill={c["text-3"]}
                className="num"
              >
                {f}
              </text>
            ) : null,
          )}
          <text x={left + plotW / 2} y={height - 2} textAnchor="middle" fontSize={11} fill={c["text-2"]}>
            Slow window
          </text>
          <text
            transform={`translate(10 ${top + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill={c["text-2"]}
          >
            Fast window
          </text>
        </svg>
      )}
      {hover && (
        <div
          className="tooltip heatmap-tooltip"
          style={{
            left: Math.min(hover.x + 8, Math.max(0, width - 190)),
            top: Math.max(0, hover.y - 8),
          }}
        >
          <div className="tooltip-title num">
            Fast {hover.row.fast} · Slow {hover.row.slow}
          </div>
          {METRIC_OPTIONS.map((m) => (
            <div className="tooltip-row" key={m.key}>
              <span style={m.key === metric ? { color: "var(--text)", fontWeight: 500 } : undefined}>{m.label}</span>
              <span className="num">{m.format(hover.row[m.key])}</span>
            </div>
          ))}
          <div className="tooltip-row">
            <span>Fills</span>
            <span className="num">{int(hover.row.num_fills)}</span>
          </div>
          <div className="tooltip-title" style={{ marginTop: 6, marginBottom: 0 }}>
            Click to backtest
          </div>
        </div>
      )}
      <div className="scale" style={{ marginTop: 8, justifyContent: "flex-end" }}>
        <span className="num">{fmt(-extent)}</span>
        <span
          className="scale-bar"
          style={{ background: `linear-gradient(90deg, ${c["div-neg"]}, ${c["div-mid"]}, ${c["div-pos"]})` }}
        />
        <span className="num">{fmt(extent)}</span>
      </div>
    </div>
  );
}

function RangeInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input num" type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SweepControls({ range, setRange }: { range: SweepRange; setRange: (r: SweepRange) => void }) {
  const set = (k: keyof SweepRange) => (v: number) => setRange({ ...range, [k]: v });
  const pairs = (() => {
    let n = 0;
    for (let f = range.fast_min; f <= range.fast_max; f += Math.max(1, range.step))
      for (let s = range.slow_min; s <= range.slow_max; s += Math.max(1, range.step)) if (f < s) n++;
    return n;
  })();
  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">Search space</h2>
        <span className="card-sub num">{pairs.toLocaleString()} combinations</span>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
          <RangeInput label="Fast from" value={range.fast_min} onChange={set("fast_min")} />
          <RangeInput label="Fast to" value={range.fast_max} onChange={set("fast_max")} />
          <RangeInput label="Slow from" value={range.slow_min} onChange={set("slow_min")} />
          <RangeInput label="Slow to" value={range.slow_max} onChange={set("slow_max")} />
          <RangeInput label="Step" value={range.step} onChange={set("step")} />
        </div>
      </div>
    </div>
  );
}

export function SweepResults({ result, onPick }: { result: SweepResponse; onPick: (row: SweepRow) => void }) {
  const [metric, setMetric] = useState<MetricKey>("sharpe");
  const top = result.rows.slice(0, 10);
  const best = result.rows[0];
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="kpi">
          <div className="kpi-label">Best pair (Sharpe)</div>
          <div className="kpi-value num">
            {best.fast} / {best.slow}
          </div>
          <div className="kpi-sub">fast / slow window</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sharpe ratio</div>
          <div className="kpi-value num">{num(best.sharpe)}</div>
          <div className="kpi-sub num">{signedPct(best.total_return)} return</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Max drawdown</div>
          <div className="kpi-value num">{pct(best.max_drawdown)}</div>
          <div className="kpi-sub num">{int(best.num_fills)} fills</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Evaluated</div>
          <div className="kpi-value num">{result.meta.pairs.toLocaleString()}</div>
          <div className="kpi-sub num">
            in {result.meta.elapsed_ms.toLocaleString()} ms{result.meta.numba ? " · Numba" : ""}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Parameter surface</h2>
          <div className="segmented" role="group" aria-label="Colour by" style={{ width: 260 }}>
            {METRIC_OPTIONS.map((m) => (
              <button type="button" key={m.key} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <Heatmap result={result} metric={metric} onPick={onPick} />
          <p className="hint" style={{ marginTop: 8 }}>
            Look for broad regions of good results rather than a single bright cell: isolated peaks are usually
            overfit. Validate the chosen pair on a later period.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Top 10 by Sharpe</h2>
          <span className="card-sub">Click a row to backtest it</span>
        </div>
        <div className="card-body" style={{ padding: "8px 0 4px" }}>
          <table>
            <thead>
              <tr>
                <th className="r" style={{ width: 48 }}>#</th>
                <th className="r">Fast</th>
                <th className="r">Slow</th>
                <th className="r">Sharpe</th>
                <th className="r">Return</th>
                <th className="r">Max drawdown</th>
                <th className="r">Fills</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={`${r.fast}:${r.slow}`} className="clickable" onClick={() => onPick(r)}>
                  <td className="r num" style={{ color: "var(--text-3)" }}>{i + 1}</td>
                  <td className="r num">{r.fast}</td>
                  <td className="r num">{r.slow}</td>
                  <td className="r num">{num(r.sharpe)}</td>
                  <td className="r num">{signedPct(r.total_return)}</td>
                  <td className="r num">{pct(r.max_drawdown)}</td>
                  <td className="r num">{int(r.num_fills)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
