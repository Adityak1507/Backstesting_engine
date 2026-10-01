import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStrategies,
  runBacktest,
  runSweep,
  type BacktestResponse,
  type Costs,
  type DataSpec,
  type StrategyDef,
  type StrategySpec,
  type SweepRange,
  type SweepResponse,
  type SweepRow,
} from "./api";
import { BacktestView } from "./components/BacktestView";
import { AlertIcon, LogoIcon, MoonIcon, SunIcon } from "./components/icons";
import { Sidebar } from "./components/Sidebar";
import { SweepControls, SweepResults } from "./components/SweepView";
import { useTheme } from "./theme";

type Tab = "backtest" | "optimize";

const today = new Date().toISOString().slice(0, 10);

const INITIAL_DATA: DataSpec = {
  source: "synthetic",
  days: 1260,
  drift: 0.08,
  volatility: 0.2,
  seed: 42,
  ticker: "SPY",
  start: "2015-01-01",
  end: today,
};

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      <AlertIcon />
      <div>{message}</div>
    </div>
  );
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState<Tab>("backtest");

  const [strategies, setStrategies] = useState<StrategyDef[]>([]);
  const [data, setData] = useState<DataSpec>(INITIAL_DATA);
  const [strategy, setStrategy] = useState<StrategySpec>({ name: "sma_crossover", params: { fast: 20, slow: 50 } });
  const [costs, setCosts] = useState<Costs>({ initial_cash: 100_000, commission_bps: 10, slippage_bps: 5 });
  const [range, setRange] = useState<SweepRange>({ fast_min: 5, fast_max: 60, slow_min: 20, slow_max: 250, step: 5 });

  const [bt, setBt] = useState<BacktestResponse | null>(null);
  const [btTitle, setBtTitle] = useState("");
  const [btError, setBtError] = useState<string | null>(null);
  const [sweep, setSweep] = useState<SweepResponse | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const doBacktest = useCallback(
    async (spec: StrategySpec = strategy) => {
      setRunning(true);
      setBtError(null);
      try {
        const res = await runBacktest(data, spec, costs);
        setBt(res);
        setBtTitle(strategies.find((s) => s.id === spec.name)?.name ?? "Backtest");
      } catch (e) {
        setBtError((e as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [data, strategy, costs, strategies],
  );

  const doSweep = useCallback(async () => {
    setRunning(true);
    setSweepError(null);
    try {
      setSweep(await runSweep(data, costs, range));
    } catch (e) {
      setSweepError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [data, costs, range]);

  const run = tab === "backtest" ? () => doBacktest() : doSweep;

  // Load strategies, then run an initial backtest so the page is never empty.
  const booted = useRef(false);
  useEffect(() => {
    fetchStrategies()
      .then(setStrategies)
      .catch((e: Error) => setBtError(e.message));
  }, []);
  useEffect(() => {
    if (strategies.length && !booted.current) {
      booted.current = true;
      doBacktest();
    }
  }, [strategies, doBacktest]);

  // Cmd/Ctrl + Enter runs the current tab.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        runRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickSweepRow = (row: SweepRow) => {
    const spec = { name: "sma_crossover", params: { fast: row.fast, slow: row.slow } };
    setStrategy(spec);
    setTab("backtest");
    doBacktest(spec);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <LogoIcon />
          </span>
          Backtester
        </div>
        <nav className="tabs" role="tablist">
          {(["backtest", "optimize"] as Tab[]).map((t) => (
            <button key={t} className="tab" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "backtest" ? "Backtest" : "Optimize"}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <span className="meta">Event-driven engine · next-bar execution</span>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title="Toggle theme"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div className="body">
        <Sidebar
          data={data}
          setData={setData}
          strategies={strategies}
          strategy={strategy}
          setStrategy={setStrategy}
          costs={costs}
          setCosts={setCosts}
          showStrategy={tab === "backtest"}
          runLabel={tab === "backtest" ? "Run backtest" : "Run optimization"}
          running={running}
          onRun={run}
        />

        <main className="main">
          <div className={`main-inner${running ? " loading" : ""}`}>
            {tab === "backtest" ? (
              <>
                {btError && <ErrorBox message={btError} />}
                {bt ? (
                  <BacktestView result={bt} title={btTitle} />
                ) : (
                  !btError && <div className="empty">Running backtest…</div>
                )}
              </>
            ) : (
              <>
                <div className="page-head">
                  <div>
                    <h1 className="page-title">SMA crossover optimization</h1>
                    <div className="page-meta">
                      Grid search over moving-average windows using the compiled fast path. Data and costs come from
                      the sidebar.
                    </div>
                  </div>
                </div>
                <SweepControls range={range} setRange={setRange} />
                {sweepError && <ErrorBox message={sweepError} />}
                {sweep ? (
                  <SweepResults result={sweep} onPick={pickSweepRow} />
                ) : (
                  !sweepError && (
                    <div className="empty">
                      Set a search space and press <strong>Run optimization</strong>.
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
