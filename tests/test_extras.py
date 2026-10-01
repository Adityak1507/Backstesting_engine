import sys
import types
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from backtester import Backtest, SmaCrossover, generate_gbm, load_yahoo
from backtester.fast import run_signals, sma_grid_search, sma_signal, summary_stats

ROOT = Path(__file__).resolve().parent.parent


# --- fast path -------------------------------------------------------------
@pytest.mark.parametrize("costs", [{}, {"commission": 0.001, "slippage": 0.0005, "commission_min": 1.0}])
def test_fast_path_matches_event_engine(costs):
    data = generate_gbm(n_days=1000, seed=11)
    event = Backtest(data, SmaCrossover(10, 40), initial_cash=50_000, **costs).run()

    sig = sma_signal(data["close"].to_numpy(), 10, 40)
    fast = run_signals(data, sig, initial_cash=50_000, **costs)

    np.testing.assert_allclose(fast.to_numpy(), event.equity.to_numpy(), rtol=1e-9)


def test_summary_stats_match_full_metrics():
    data = generate_gbm(n_days=500, seed=3)
    result = Backtest(data, SmaCrossover(5, 20), commission=0.001).run()
    total, sharpe, max_dd = summary_stats(result.equity.to_numpy(), 252)
    assert total == pytest.approx(result.metrics["total_return"])
    assert sharpe == pytest.approx(result.metrics["sharpe"])
    assert max_dd == pytest.approx(result.metrics["max_drawdown"])


def test_grid_search_covers_valid_pairs_sorted_by_sharpe():
    data = generate_gbm(n_days=600, seed=5)
    grid = sma_grid_search(data, [5, 10, 30], [10, 30, 60], commission=0.001)
    pairs = set(zip(grid["fast"], grid["slow"]))
    assert pairs == {(5, 10), (5, 30), (5, 60), (10, 30), (10, 60), (30, 60)}
    sharpes = grid["sharpe"].dropna().to_numpy()
    assert np.all(sharpes[:-1] >= sharpes[1:])


def test_run_signals_accepts_boolean_signal():
    data = generate_gbm(n_days=50, seed=1)
    always_long = np.ones(len(data), dtype=bool)
    equity = run_signals(data, always_long)
    assert equity.iloc[0] == 100_000
    assert equity.iloc[-1] != 100_000


def test_run_signals_rejects_misaligned_signal():
    data = generate_gbm(n_days=50, seed=1)
    with pytest.raises(ValueError, match="length"):
        run_signals(data, np.ones(10))


# --- yahoo loader ----------------------------------------------------------
def _fake_yfinance(monkeypatch, frame):
    calls = {}

    def download(symbol, **kwargs):
        calls.update(symbol=symbol, **kwargs)
        return frame

    monkeypatch.setitem(sys.modules, "yfinance", types.SimpleNamespace(download=download))
    return calls


def test_load_yahoo_flattens_multiindex_columns(monkeypatch):
    idx = pd.DatetimeIndex(["2024-01-03", "2024-01-02"], tz="America/New_York")
    fields = ["Close", "High", "Low", "Open", "Volume"]
    frame = pd.DataFrame(
        [[11, 12, 9, 10, 100], [10, 11, 8, 9, 200]],
        index=idx,
        columns=pd.MultiIndex.from_product([fields, ["AAPL"]], names=["Price", "Ticker"]),
    )
    calls = _fake_yfinance(monkeypatch, frame)

    df = load_yahoo("AAPL", start="2024-01-01", end="2024-01-05")

    assert calls["symbol"] == "AAPL" and calls["auto_adjust"] is True
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert df.index.tz is None and df.index.is_monotonic_increasing
    assert df["close"].tolist() == [10, 11]


def test_load_yahoo_raises_on_empty(monkeypatch):
    _fake_yfinance(monkeypatch, pd.DataFrame())
    with pytest.raises(ValueError, match="no data"):
        load_yahoo("NOPE")


# --- plotly ----------------------------------------------------------------
def test_plot_interactive_writes_html(tmp_path):
    pytest.importorskip("plotly")
    result = Backtest(generate_gbm(300, seed=2), SmaCrossover(5, 20)).run()
    out = tmp_path / "chart.html"
    fig = result.plot_interactive(str(out))
    names = {t.name for t in fig.data}
    assert {"Strategy", "Buy & hold", "Buy", "Sell"} <= names
    html = out.read_text()
    assert "<html>" in html and "plotly" in html


# --- streamlit -------------------------------------------------------------
def test_streamlit_app_runs():
    testing = pytest.importorskip("streamlit.testing.v1")
    at = testing.AppTest.from_file(str(ROOT / "app.py"), default_timeout=60).run()
    assert not at.exception
    assert any(m.label == "Sharpe" for m in at.metric)

    at.button[0].click().run()  # parameter sweep
    assert not at.exception
    assert any("parameter pairs" in s.value for s in at.success)
