# Backtesting Engine

A small, event-driven backtesting engine in Python. Write a trading strategy,
run it over historical OHLCV bars, and get an equity curve, a trade log and
performance metrics.

## Features

- **Event-driven loop**: bars are processed one at a time, like a live system.
- **No look-ahead**: strategies only see data up to the current bar, and orders
  placed on bar *t* fill on bar *t+1*.
- **Order types**: market, limit and stop orders, plus helpers such as
  `order_target_percent` and `close_position`.
- **Realistic costs**: percentage commission, minimum commission and slippage.
- **Cash and position limits**: buys are capped to available cash; shorting is
  opt-in.
- **Multiple symbols**: pass a dict of DataFrames and they are aligned on a
  common calendar.
- **Metrics**: total return, CAGR, volatility, Sharpe, Sortino, max drawdown
  and its duration, Calmar, win rate, average win and loss, profit factor, and
  commission paid, with a buy-and-hold benchmark for comparison.

## Install

```bash
pip install -e ".[dev]"
pip install matplotlib   # optional, for charts
```

## Quick start

```python
from backtester import Backtest, SmaCrossover, generate_gbm, load_csv

data = generate_gbm(n_days=1260, seed=42)   # or load_csv("AAPL.csv")

result = Backtest(
    data,
    SmaCrossover(fast=20, slow=50),
    initial_cash=100_000,
    commission=0.001,   # 10 bps
    slippage=0.0005,    # 5 bps
).run()

print(result.summary())
result.trades        # DataFrame of closed trades
result.equity        # equity curve (pd.Series)
result.plot("equity.png")
```

Or run the example:

```bash
python examples/run_sma_crossover.py            # synthetic data
python examples/run_sma_crossover.py data.csv   # CSV with date,open,high,low,close,volume
```

## Writing a strategy

Subclass `Strategy` and implement `on_bar`. Everything goes through `ctx`:

```python
from backtester import Strategy

class Breakout(Strategy):
    def __init__(self, lookback=20):
        self.lookback = lookback

    def on_bar(self, ctx):
        bars = ctx.history(length=self.lookback + 1)
        if len(bars) <= self.lookback:
            return
        prior_high = bars["high"].iloc[:-1].max()
        if ctx.position() == 0 and ctx.price() > prior_high:
            ctx.order_target_percent(0.95)
        elif ctx.position() > 0 and ctx.price() < bars["low"].iloc[:-1].min():
            ctx.close_position()
```

| `ctx` member | Description |
|---|---|
| `history(symbol, length)` | OHLCV bars up to and including the current one |
| `price(symbol)` | Latest close |
| `position(symbol)`, `cash`, `equity` | Account state |
| `buy(qty)`, `sell(qty)`, `order(qty, limit_price=, stop_price=)` | Submit orders |
| `order_target_percent(pct)`, `order_target_quantity(qty)`, `close_position()` | Position sizing helpers |
| `cancel_orders(symbol)` | Cancel pending orders |
| `symbols`, `timestamp` | Universe and current bar time |

With a single symbol the `symbol` argument can be omitted.

## How a bar is processed

1. Pending orders fill at this bar's open, or at their limit or stop price if
   the bar's range reaches it. Sells are processed before buys.
2. The portfolio is marked to market at the close.
3. `strategy.on_bar(ctx)` runs and may submit new orders.

## Project layout

```
backtester/
  data.py        CSV loading, validation, synthetic GBM data
  broker.py      orders, cost model, order matching
  portfolio.py   cash, positions, average cost, realised trades
  strategy.py    Strategy base class and Context API
  strategies.py  BuyAndHold, SmaCrossover, RsiMeanReversion
  metrics.py     performance statistics
  engine.py      Backtest event loop and BacktestResult
examples/        runnable example
tests/           pytest suite
```

## Tests

```bash
pytest
```

## Limitations

- Bar-level simulation only: there is no intrabar ordering of fills, and if a
  limit or stop is hit the fill is assumed to be complete.
- No margin, borrow costs or dividends, and short positions are not
  margin-checked.
- Orders are good-till-cancelled; there are no time-in-force options.
