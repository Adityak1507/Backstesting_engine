"""Cash, positions and profit-and-loss bookkeeping."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import pandas as pd

from .broker import Fill


@dataclass
class Trade:
    """A closed (or partially closed) position, used for win-rate statistics."""

    symbol: str
    entry_price: float
    exit_price: float
    quantity: float  # positive = closed long, negative = closed short
    exit_time: pd.Timestamp
    pnl: float  # after the commission of the closing fill

    @property
    def return_pct(self) -> float:
        return (self.exit_price / self.entry_price - 1) * (1 if self.quantity > 0 else -1)


class Portfolio:
    def __init__(self, initial_cash: float):
        self.initial_cash = float(initial_cash)
        self.cash = float(initial_cash)
        self.positions: Dict[str, float] = {}
        self.avg_cost: Dict[str, float] = {}
        self.fills: List[Fill] = []
        self.trades: List[Trade] = []
        self.total_commission = 0.0

    def apply_fill(self, fill: Fill) -> None:
        sym, qty, price = fill.symbol, fill.quantity, fill.price
        held = self.positions.get(sym, 0.0)
        cost = self.avg_cost.get(sym, 0.0)

        self.cash -= qty * price + fill.commission
        self.total_commission += fill.commission
        self.fills.append(fill)

        if held == 0 or (held > 0) == (qty > 0):
            # Opening or adding to a position: update the average cost.
            new_qty = held + qty
            self.avg_cost[sym] = (held * cost + qty * price) / new_qty
            self.positions[sym] = new_qty
            return

        # Reducing, closing or flipping a position.
        closed = -qty if abs(qty) <= abs(held) else held
        pnl = closed * (price - cost) - fill.commission
        self.trades.append(Trade(sym, cost, price, closed, fill.timestamp, pnl))

        new_qty = held + qty
        if new_qty == 0:
            self.positions.pop(sym, None)
            self.avg_cost.pop(sym, None)
        else:
            self.positions[sym] = new_qty
            if (new_qty > 0) != (held > 0):
                self.avg_cost[sym] = price  # flipped: the remainder opened at this price

    def market_value(self, prices: Dict[str, float]) -> float:
        return sum(qty * prices[sym] for sym, qty in self.positions.items())

    def equity(self, prices: Dict[str, float]) -> float:
        return self.cash + self.market_value(prices)
