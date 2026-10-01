"""Streamlit dashboard for the backtesting engine.

Run with:
    streamlit run app.py
"""

import datetime as dt

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from backtester import (
    Backtest,
    BuyAndHold,
    RsiMeanReversion,
    SmaCrossover,
    generate_gbm,
    load_csv,
    load_yahoo,
)
from backtester.fast import HAS_NUMBA, sma_grid_search

st.set_page_config(page_title="Backtester", layout="wide")
st.title("Backtesting dashboard")


@st.cache_data(show_spinner="Downloading from Yahoo Finance…")
def yahoo(symbol: str, start: dt.date, end: dt.date) -> pd.DataFrame:
    return load_yahoo(symbol, start=str(start), end=str(end))


@st.cache_data
def synthetic(n_days: int, mu: float, sigma: float, seed: int) -> pd.DataFrame:
    return generate_gbm(n_days=n_days, mu=mu, sigma=sigma, seed=seed)


# --- sidebar: data ---------------------------------------------------------
with st.sidebar:
    st.header("Data")
    source = st.radio("Source", ["Synthetic", "Yahoo Finance", "Upload CSV"])
    data, label = None, "ASSET"
    try:
        if source == "Synthetic":
            n_days = st.slider("Trading days", 252, 5040, 1260, step=252)
            mu = st.slider("Annual drift", -0.2, 0.3, 0.08, step=0.01)
            sigma = st.slider("Annual volatility", 0.05, 0.8, 0.2, step=0.01)
            seed = st.number_input("Random seed", value=42, step=1)
            data = synthetic(n_days, mu, sigma, int(seed))
        elif source == "Yahoo Finance":
            label = st.text_input("Ticker", "SPY").strip().upper()
            start = st.date_input("Start", dt.date(2015, 1, 1))
            end = st.date_input("End", dt.date.today())
            if label:
                data = yahoo(label, start, end)
        else:
            upload = st.file_uploader("OHLCV CSV with a date column", type="csv")
            if upload is not None:
                data = load_csv(upload)
                label = upload.name.rsplit(".", 1)[0]
    except Exception as exc:  # show data errors in the UI instead of crashing
        st.error(f"Could not load data: {exc}")

    st.header("Strategy")
    strategy_name = st.selectbox("Strategy", ["SMA crossover", "RSI mean reversion", "Buy & hold"])
    if strategy_name == "SMA crossover":
        fast = st.number_input("Fast window", 2, 200, 20)
        slow = st.number_input("Slow window", 3, 400, 50)
    elif strategy_name == "RSI mean reversion":
        period = st.number_input("RSI period", 2, 100, 14)
        oversold = st.slider("Buy below RSI", 5, 50, 30)
        exit_level = st.slider("Sell above RSI", 40, 95, 55)

    st.header("Costs & capital")
    initial_cash = st.number_input("Initial cash", 1_000, 100_000_000, 100_000, step=10_000)
    commission_bps = st.number_input("Commission (bps)", 0.0, 100.0, 10.0)
    slippage_bps = st.number_input("Slippage (bps)", 0.0, 100.0, 5.0)

if data is None:
    st.info("Choose a data source in the sidebar to begin.")
    st.stop()

commission, slippage = commission_bps / 10_000, slippage_bps / 10_000

if strategy_name == "SMA crossover":
    if fast >= slow:
        st.error("Fast window must be shorter than slow window.")
        st.stop()
    strategy = SmaCrossover(int(fast), int(slow))
elif strategy_name == "RSI mean reversion":
    strategy = RsiMeanReversion(int(period), oversold, exit_level)
else:
    strategy = BuyAndHold()

tab_run, tab_sweep, tab_data = st.tabs(["Backtest", "Parameter sweep", "Data"])

# --- backtest --------------------------------------------------------------
with tab_run:
    result = Backtest(
        {label: data}, strategy, initial_cash=initial_cash, commission=commission, slippage=slippage
    ).run()
    m = result.metrics

    def pct(v):
        return "n/a" if pd.isna(v) else f"{v:.2%}"

    def num(v):
        return "n/a" if pd.isna(v) else f"{v:.2f}"

    cols = st.columns(6)
    cols[0].metric("Total return", pct(m["total_return"]),
                   delta=f"{m['total_return'] - m['benchmark_return']:+.2%} vs B&H")
    cols[1].metric("CAGR", pct(m["cagr"]))
    cols[2].metric("Sharpe", num(m["sharpe"]))
    cols[3].metric("Max drawdown", pct(m["max_drawdown"]))
    cols[4].metric("Trades", m["num_trades"])
    cols[5].metric("Win rate", pct(m["win_rate"]))

    st.plotly_chart(result.plot_interactive(title=f"{strategy_name} on {label}"), width="stretch")

    left, right = st.columns([1, 2])
    with left:
        st.subheader("All metrics")
        st.code(result.summary(), language=None)
    with right:
        st.subheader("Closed trades")
        if result.trades.empty:
            st.write("No closed trades.")
        else:
            st.dataframe(result.trades, width="stretch", hide_index=True)

# --- parameter sweep ---------------------------------------------------------
with tab_sweep:
    st.write(
        "Grid-search SMA crossover windows with the Numba-accelerated fast path"
        + ("." if HAS_NUMBA else " (Numba not installed: running in plain Python, slower).")
    )
    st.caption(
        "The best in-sample parameters are usually overfit. Check them on a later "
        "period the sweep did not see before trusting them."
    )
    c1, c2, c3 = st.columns(3)
    fast_range = c1.slider("Fast window range", 2, 100, (5, 50))
    slow_range = c2.slider("Slow window range", 10, 300, (20, 200))
    step = c3.number_input("Step", 1, 50, 5)
    metric = st.selectbox("Colour by", ["sharpe", "total_return", "max_drawdown"])

    if st.button("Run sweep", type="primary"):
        fasts = range(fast_range[0], fast_range[1] + 1, int(step))
        slows = range(slow_range[0], slow_range[1] + 1, int(step))
        with st.spinner("Sweeping…"):
            grid = sma_grid_search(
                data, fasts, slows, initial_cash=initial_cash,
                commission=commission, slippage=slippage,
            )
        if grid.empty:
            st.warning("No valid pairs: every fast window is ≥ every slow window.")
        else:
            st.success(f"Evaluated {len(grid):,} parameter pairs.")
            heat = grid.pivot(index="fast", columns="slow", values=metric)
            fig = px.imshow(
                heat, origin="lower", aspect="auto", color_continuous_scale="RdYlGn",
                labels=dict(x="Slow window", y="Fast window", color=metric),
            )
            st.plotly_chart(fig, width="stretch")
            st.dataframe(grid.head(20), width="stretch", hide_index=True)

# --- data ------------------------------------------------------------------
with tab_data:
    st.write(f"{len(data):,} bars from {data.index[0].date()} to {data.index[-1].date()}")
    st.plotly_chart(px.line(data, y="close", title=f"{label} close"), width="stretch")
    st.dataframe(data, width="stretch")
