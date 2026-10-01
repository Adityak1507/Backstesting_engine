import type { BacktestResponse } from "../api";
import { int, METRICS, money, num, pct, shortDate, signedPct } from "../format";
import { useChartColors } from "../theme";
import { DrawdownChart, EquityChart } from "./Charts";

function tone(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v) || v === 0) return "";
  return v > 0 ? "pos" : "neg";
}

function Kpis({ m }: { m: BacktestResponse["metrics"] }) {
  const excess =
    m.total_return != null && m.benchmark_return != null ? m.total_return - m.benchmark_return : null;
  const items = [
    {
      label: "Total return",
      value: signedPct(m.total_return),
      cls: tone(m.total_return),
      sub: excess == null ? null : `${signedPct(excess)} vs buy & hold`,
    },
    { label: "CAGR", value: signedPct(m.cagr), cls: tone(m.cagr), sub: `${pct(m.annual_volatility)} volatility` },
    { label: "Sharpe ratio", value: num(m.sharpe), sub: `Sortino ${num(m.sortino)}` },
    { label: "Max drawdown", value: pct(m.max_drawdown), sub: `${int(m.max_drawdown_duration)} bars underwater` },
    { label: "Trades", value: int(m.num_trades), sub: `${money(m.total_commission)} commission` },
    { label: "Win rate", value: pct(m.win_rate, 1), sub: `Profit factor ${num(m.profit_factor)}` },
  ];
  return (
    <div className="kpis">
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="kpi-label">{k.label}</div>
          <div className={`kpi-value num ${k.cls ?? ""}`}>{k.value}</div>
          {k.sub && <div className="kpi-sub num">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function Legend() {
  const c = useChartColors();
  return (
    <div className="legend" aria-label="Legend">
      <span className="legend-item">
        <i className="legend-swatch" style={{ background: c["series-1"] }} />
        Strategy
      </span>
      <span className="legend-item" style={{ color: c["series-ref"] }}>
        <i className="legend-swatch dashed" />
        <span style={{ color: "var(--text-2)" }}>Buy &amp; hold</span>
      </span>
      <span className="legend-item">
        <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden>
          <path d="M0,-5 L5,4 L-5,4 Z" fill={c.text} />
        </svg>
        Buy
      </span>
      <span className="legend-item">
        <svg width="10" height="10" viewBox="-6 -6 12 12" aria-hidden>
          <path d="M0,5 L5,-4 L-5,-4 Z" fill={c.surface} stroke={c.text} strokeWidth={1.5} />
        </svg>
        Sell
      </span>
    </div>
  );
}

export function BacktestView({ result, title }: { result: BacktestResponse; title: string }) {
  const { meta, metrics, series, trades, fills } = result;
  const recentTrades = [...trades].reverse();
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {title} <span style={{ color: "var(--text-3)", fontWeight: 400 }}>· {meta.symbol}</span>
          </h1>
          <div className="page-meta num">
            {shortDate(meta.start)} – {shortDate(meta.end)} · {meta.bars.toLocaleString()} bars · computed in{" "}
            {meta.elapsed_ms.toLocaleString()} ms
          </div>
        </div>
      </div>

      <Kpis m={metrics} />

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Equity</h2>
          <Legend />
        </div>
        <div className="card-body">
          <EquityChart series={series} fills={fills} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Drawdown</h2>
          <span className="card-sub">Distance below the previous equity peak</span>
        </div>
        <div className="card-body">
          <DrawdownChart series={series} />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Statistics</h2>
          </div>
          <div className="card-body" style={{ padding: "8px 0 4px" }}>
            <table className="kv">
              <tbody>
                {METRICS.filter((x) => x.key in metrics).map((x) => (
                  <tr key={x.key}>
                    <td>{x.label}</td>
                    <td className="r num">{x.format(metrics[x.key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Closed trades</h2>
            <span className="card-sub num">{trades.length.toLocaleString()} total · newest first</span>
          </div>
          <div className="card-body" style={{ padding: "8px 0 4px" }}>
            {trades.length === 0 ? (
              <div className="empty" style={{ border: 0, padding: 32 }}>
                No closed trades. Open positions are valued at the last close.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exit date</th>
                      <th>Side</th>
                      <th className="r">Quantity</th>
                      <th className="r">Entry</th>
                      <th className="r">Exit</th>
                      <th className="r">Return</th>
                      <th className="r">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t, i) => {
                      const ret = (t.exit_price / t.entry_price - 1) * (t.quantity > 0 ? 1 : -1);
                      return (
                        <tr key={i}>
                          <td className="num">{shortDate(t.exit_time)}</td>
                          <td>{t.quantity > 0 ? "Long" : "Short"}</td>
                          <td className="r num">{Math.abs(t.quantity).toLocaleString()}</td>
                          <td className="r num">{money(t.entry_price, 2)}</td>
                          <td className="r num">{money(t.exit_price, 2)}</td>
                          <td className={`r num ${tone(ret)}`}>{signedPct(ret)}</td>
                          <td className={`r num ${tone(t.pnl)}`}>
                            {t.pnl > 0 ? "+" : ""}
                            {money(t.pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
