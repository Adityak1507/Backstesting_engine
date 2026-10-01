import { useRef } from "react";
import type { Costs, DataSource, DataSpec, StrategyDef, StrategySpec } from "../api";
import { UploadIcon } from "./icons";

interface Props {
  data: DataSpec;
  setData: (d: DataSpec) => void;
  strategies: StrategyDef[];
  strategy: StrategySpec;
  setStrategy: (s: StrategySpec) => void;
  costs: Costs;
  setCosts: (c: Costs) => void;
  showStrategy: boolean;
  runLabel: string;
  running: boolean;
  onRun: () => void;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          className={`input num${suffix ? " has-suffix" : ""}`}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  );
}

const SOURCES: { id: DataSource; label: string }[] = [
  { id: "synthetic", label: "Synthetic" },
  { id: "yahoo", label: "Yahoo" },
  { id: "csv", label: "CSV" },
];

export function Sidebar(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const def = p.strategies.find((s) => s.id === p.strategy.name);
  const set = <K extends keyof DataSpec>(k: K, v: DataSpec[K]) => p.setData({ ...p.data, [k]: v });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    p.setData({ ...p.data, csv_text: await file.text(), csv_name: file.name });
  };

  return (
    <aside className="sidebar">
      <form
        className="sidebar-scroll"
        onSubmit={(e) => {
          e.preventDefault();
          p.onRun();
        }}
        id="config"
        noValidate
      >
        <section>
          <h2 className="section-title">Market data</h2>
          <div className="fields">
            <div className="segmented" role="group" aria-label="Data source">
              {SOURCES.map((s) => (
                <button type="button" key={s.id} aria-pressed={p.data.source === s.id} onClick={() => set("source", s.id)}>
                  {s.label}
                </button>
              ))}
            </div>

            {p.data.source === "synthetic" && (
              <>
                <p className="hint">Random-walk prices (geometric Brownian motion).</p>
                <div className="row-2">
                  <NumberField label="Trading days" value={p.data.days} min={60} max={10000} step={1} onChange={(v) => set("days", v)} />
                  <NumberField label="Seed" value={p.data.seed} onChange={(v) => set("seed", v)} />
                </div>
                <div className="row-2">
                  <NumberField
                    label="Drift"
                    value={Math.round(p.data.drift * 1000) / 10}
                    step={0.5}
                    suffix="%"
                    onChange={(v) => set("drift", v / 100)}
                  />
                  <NumberField
                    label="Volatility"
                    value={Math.round(p.data.volatility * 1000) / 10}
                    step={1}
                    min={1}
                    suffix="%"
                    onChange={(v) => set("volatility", v / 100)}
                  />
                </div>
              </>
            )}

            {p.data.source === "yahoo" && (
              <>
                <label className="field">
                  <span>Ticker</span>
                  <input
                    className="input"
                    value={p.data.ticker}
                    placeholder="SPY"
                    spellCheck={false}
                    autoCapitalize="characters"
                    onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                  />
                </label>
                <div className="row-2">
                  <label className="field">
                    <span>Start</span>
                    <input className="input" type="date" value={p.data.start} onChange={(e) => set("start", e.target.value)} />
                  </label>
                  <label className="field">
                    <span>End</span>
                    <input className="input" type="date" value={p.data.end} onChange={(e) => set("end", e.target.value)} />
                  </label>
                </div>
                <p className="hint">Daily bars, adjusted for splits and dividends.</p>
              </>
            )}

            {p.data.source === "csv" && (
              <>
                <div
                  className="dropzone"
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onFile(e.dataTransfer.files[0]);
                  }}
                >
                  <UploadIcon />
                  <div style={{ marginTop: 6 }}>
                    {p.data.csv_name ? <strong>{p.data.csv_name}</strong> : <>Drop a CSV or <strong>browse</strong></>}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                <p className="hint">Columns: date, open, high, low, close, volume.</p>
              </>
            )}
          </div>
        </section>

        {p.showStrategy && (
          <section>
            <h2 className="section-title">Strategy</h2>
            <div className="fields">
              <label className="field">
                <span>Model</span>
                <select
                  className="select"
                  value={p.strategy.name}
                  onChange={(e) => {
                    const next = p.strategies.find((s) => s.id === e.target.value);
                    const params = Object.fromEntries((next?.params ?? []).map((x) => [x.key, x.default]));
                    p.setStrategy({ name: e.target.value, params });
                  }}
                >
                  {p.strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {def && <p className="hint">{def.description}</p>}
              {def && def.params.length > 0 && (
                <div className="row-2">
                  {def.params.map((param) => (
                    <NumberField
                      key={param.key}
                      label={param.label}
                      value={p.strategy.params[param.key] ?? param.default}
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      onChange={(v) => p.setStrategy({ ...p.strategy, params: { ...p.strategy.params, [param.key]: v } })}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="section-title">Capital &amp; costs</h2>
          <div className="fields">
            <NumberField
              label="Initial capital"
              value={p.costs.initial_cash}
              min={1}
              step={1000}
              suffix="USD"
              onChange={(v) => p.setCosts({ ...p.costs, initial_cash: v })}
            />
            <div className="row-2">
              <NumberField
                label="Commission"
                value={p.costs.commission_bps}
                min={0}
                step={0.5}
                suffix="bps"
                onChange={(v) => p.setCosts({ ...p.costs, commission_bps: v })}
              />
              <NumberField
                label="Slippage"
                value={p.costs.slippage_bps}
                min={0}
                step={0.5}
                suffix="bps"
                onChange={(v) => p.setCosts({ ...p.costs, slippage_bps: v })}
              />
            </div>
          </div>
        </section>
      </form>

      <div className="sidebar-footer">
        <button className="btn btn-primary btn-block" type="submit" form="config" disabled={p.running}>
          {p.running ? <span className="spinner" /> : null}
          {p.running ? "Running…" : p.runLabel}
          {!p.running && <span className="kbd">⌘↵</span>}
        </button>
      </div>
    </aside>
  );
}
