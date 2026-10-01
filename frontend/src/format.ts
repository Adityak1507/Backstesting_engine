type Num = number | null | undefined;

const DASH = "—";

export const pct = (v: Num, digits = 2) =>
  v == null || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(digits)}%`;

export const signedPct = (v: Num, digits = 2) =>
  v == null || !Number.isFinite(v) ? DASH : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

export const num = (v: Num, digits = 2) =>
  v == null || !Number.isFinite(v)
    ? DASH
    : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const int = (v: Num) => (v == null || !Number.isFinite(v) ? DASH : Math.round(v).toLocaleString("en-US"));

export const money = (v: Num, digits = 0) =>
  v == null || !Number.isFinite(v)
    ? DASH
    : v.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

/** Compact currency for axis ticks: $95k, $1.2M. */
export const moneyCompact = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

export const monthYear = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};

/** Labels and formatters for every metric the API returns, in display order. */
export const METRICS: { key: string; label: string; format: (v: Num) => string }[] = [
  { key: "start_equity", label: "Starting equity", format: (v) => money(v) },
  { key: "end_equity", label: "Ending equity", format: (v) => money(v) },
  { key: "total_return", label: "Total return", format: (v) => signedPct(v) },
  { key: "benchmark_return", label: "Buy & hold return", format: (v) => signedPct(v) },
  { key: "cagr", label: "CAGR", format: (v) => signedPct(v) },
  { key: "annual_volatility", label: "Annual volatility", format: (v) => pct(v) },
  { key: "sharpe", label: "Sharpe ratio", format: (v) => num(v) },
  { key: "sortino", label: "Sortino ratio", format: (v) => num(v) },
  { key: "calmar", label: "Calmar ratio", format: (v) => num(v) },
  { key: "max_drawdown", label: "Max drawdown", format: (v) => pct(v) },
  { key: "max_drawdown_duration", label: "Longest drawdown", format: (v) => (v == null ? DASH : `${int(v)} bars`) },
  { key: "num_trades", label: "Closed trades", format: (v) => int(v) },
  { key: "win_rate", label: "Win rate", format: (v) => pct(v, 1) },
  { key: "avg_win", label: "Average win", format: (v) => money(v) },
  { key: "avg_loss", label: "Average loss", format: (v) => money(v) },
  { key: "profit_factor", label: "Profit factor", format: (v) => num(v) },
  { key: "total_commission", label: "Commission paid", format: (v) => money(v) },
];
