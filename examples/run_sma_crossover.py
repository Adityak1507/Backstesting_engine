"""Backtest an SMA crossover strategy.

Usage:
    python examples/run_sma_crossover.py                 # synthetic data
    python examples/run_sma_crossover.py prices.csv      # your own OHLCV CSV
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backtester import Backtest, SmaCrossover, generate_gbm, load_csv  # noqa: E402


def main() -> None:
    data = load_csv(sys.argv[1]) if len(sys.argv) > 1 else generate_gbm(n_days=1260, seed=42)

    result = Backtest(
        data,
        SmaCrossover(fast=20, slow=50),
        initial_cash=100_000,
        commission=0.001,  # 10 bps per trade
        slippage=0.0005,  # 5 bps
    ).run()

    print(result.summary())
    if not result.trades.empty:
        print("\nLast 5 trades:")
        print(result.trades.tail().to_string(index=False))

    try:
        result.plot("sma_crossover.png")
        print("\nSaved chart to sma_crossover.png")
    except ImportError:
        print("\nInstall matplotlib to save an equity chart.")


if __name__ == "__main__":
    main()
