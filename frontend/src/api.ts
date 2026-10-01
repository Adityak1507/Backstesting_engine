export type DataSource = "synthetic" | "yahoo" | "csv";

export interface DataSpec {
  source: DataSource;
  days: number;
  drift: number;
  volatility: number;
  seed: number;
  ticker: string;
  start: string;
  end: string;
  csv_text?: string;
  csv_name?: string;
}

export interface Costs {
  initial_cash: number;
  commission_bps: number;
  slippage_bps: number;
}

export interface StrategyParam {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface StrategyDef {
  id: string;
  name: string;
  description: string;
  params: StrategyParam[];
}

export interface StrategySpec {
  name: string;
  params: Record<string, number>;
}

export type Metrics = Record<string, number | null>;

export interface SeriesPoint {
  date: string;
  equity: number;
  benchmark: number;
  drawdown: number;
}

export interface Trade {
  symbol: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  exit_time: string;
  pnl: number;
}

export interface Fill {
  timestamp: string;
  symbol: string;
  quantity: number;
  price: number;
  commission: number;
}

export interface BacktestResponse {
  meta: { symbol: string; bars: number; start: string; end: string; elapsed_ms: number };
  metrics: Metrics;
  series: SeriesPoint[];
  trades: Trade[];
  fills: Fill[];
}

export interface SweepRow {
  fast: number;
  slow: number;
  total_return: number | null;
  sharpe: number | null;
  max_drawdown: number | null;
  num_fills: number;
}

export interface SweepRange {
  fast_min: number;
  fast_max: number;
  slow_min: number;
  slow_max: number;
  step: number;
}

export interface SweepResponse {
  meta: { symbol: string; pairs: number; elapsed_ms: number; numba: boolean };
  fast_values: number[];
  slow_values: number[];
  rows: SweepRow[];
}

function dataPayload(data: DataSpec) {
  // Only send the fields the chosen source needs (CSV text can be large).
  const { source } = data;
  if (source === "synthetic")
    return { source, days: data.days, drift: data.drift, volatility: data.volatility, seed: data.seed };
  if (source === "yahoo")
    return { source, ticker: data.ticker, start: data.start || null, end: data.end || null };
  return { source, csv_text: data.csv_text, csv_name: data.csv_name };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") message = err.detail;
      else if (Array.isArray(err.detail))
        message = err.detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, "")).join("; ");
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function fetchStrategies(): Promise<StrategyDef[]> {
  const res = await fetch("/api/strategies");
  if (!res.ok) throw new Error("Could not reach the API. Is the server running?");
  return res.json();
}

export function runBacktest(data: DataSpec, strategy: StrategySpec, costs: Costs) {
  return post<BacktestResponse>("/api/backtest", { data: dataPayload(data), strategy, costs });
}

export function runSweep(data: DataSpec, costs: Costs, range: SweepRange) {
  return post<SweepResponse>("/api/sweep", { data: dataPayload(data), costs, ...range });
}
