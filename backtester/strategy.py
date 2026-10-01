"""Strategy base class and the context object strategies trade through."""

from __future__ import annotations

from typing import TYPE_CHECKING, Dict, Optional

import pandas as pd

from .broker import Order

if TYPE_CHECKING:
    from .engine import Backtest


class Context:
    """The strategy's view of the world at the current bar.

    Only data up to and including the current bar is reachable, so a strategy
    cannot peek into the future.
    """

    def __init__(self, engine: "Backtest"):
        self._engine = engine
        self.timestamp: Optional[pd.Timestamp] = None
        self._i = -1

    # --- market data ------------------------------------------------------
    @property
    def symbols(self):
        return list(self._engine.data)

    def history(self, symbol: Optional[str] = None, length: Optional[int] = None) -> pd.DataFrame:
        """OHLCV bars up to and including the current bar."""
        df = self._engine.data[self._sym(symbol)].iloc[: self._i + 1]
        return df if length is None else df.iloc[-length:]

    def price(self, symbol: Optional[str] = None) -> float:
        """Latest close for the symbol."""
        return float(self._engine.data[self._sym(symbol)]["close"].iloc[self._i])

    def has_bar(self, symbol: Optional[str] = None) -> bool:
        """Whether the symbol actually traded on the current bar (vs. forward-filled)."""
        return bool(self._engine._has_bar[self._sym(symbol)].iloc[self._i])

    # --- account ----------------------------------------------------------
    @property
    def cash(self) -> float:
        return self._engine.portfolio.cash

    @property
    def equity(self) -> float:
        return self._engine.portfolio.equity(self._prices())

    def position(self, symbol: Optional[str] = None) -> float:
        return self._engine.portfolio.positions.get(self._sym(symbol), 0.0)

    # --- orders -----------------------------------------------------------
    def order(
        self,
        quantity: float,
        symbol: Optional[str] = None,
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
    ) -> None:
        """Submit an order; it executes on the next bar."""
        self._engine.broker.submit(
            Order(self._sym(symbol), float(quantity), self.timestamp, limit_price, stop_price)
        )

    def buy(self, quantity: float, symbol: Optional[str] = None, **kwargs) -> None:
        self.order(abs(quantity), symbol, **kwargs)

    def sell(self, quantity: float, symbol: Optional[str] = None, **kwargs) -> None:
        self.order(-abs(quantity), symbol, **kwargs)

    def order_target_quantity(self, target: float, symbol: Optional[str] = None) -> None:
        delta = target - self.position(symbol) - self._pending_qty(symbol)
        if delta:
            self.order(delta, symbol)

    def order_target_percent(self, percent: float, symbol: Optional[str] = None) -> None:
        """Size a position to `percent` of current equity (whole shares, at the latest close)."""
        price = self.price(symbol)
        target = int(self.equity * percent / price) if price > 0 else 0
        self.order_target_quantity(float(target), symbol)

    def close_position(self, symbol: Optional[str] = None) -> None:
        self.order_target_quantity(0.0, symbol)

    def cancel_orders(self, symbol: Optional[str] = None) -> None:
        self._engine.broker.cancel_all(self._sym(symbol) if symbol else None)

    # --- helpers ----------------------------------------------------------
    def _sym(self, symbol: Optional[str]) -> str:
        if symbol is not None:
            return symbol
        if len(self._engine.data) != 1:
            raise ValueError("symbol is required when backtesting more than one symbol")
        return next(iter(self._engine.data))

    def _pending_qty(self, symbol: Optional[str]) -> float:
        sym = self._sym(symbol)
        return sum(
            o.quantity
            for o in self._engine.broker.pending
            if o.symbol == sym and o.limit_price is None and o.stop_price is None
        )

    def _prices(self) -> Dict[str, float]:
        return {s: float(df["close"].iloc[self._i]) for s, df in self._engine.data.items()}


class Strategy:
    """Subclass this and implement `on_bar`.

    Example::

        class BuyAndHold(Strategy):
            def on_bar(self, ctx):
                if ctx.position() == 0:
                    ctx.order_target_percent(1.0)
    """

    def init(self, ctx: Context) -> None:
        """Called once before the first bar."""

    def on_bar(self, ctx: Context) -> None:
        """Called after every bar closes. Orders placed here fill on the next bar."""
        raise NotImplementedError
