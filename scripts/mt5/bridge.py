#!/usr/bin/env python3
"""Read-only MetaTrader 5 -> Forex Signal Engine bridge.

Runs locally on Windows next to an installed/logged-in MetaTrader 5 terminal.
It exposes only market-data endpoints. There is deliberately no order endpoint.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    import MetaTrader5 as mt5
except ImportError:
    print(
        "MetaTrader5 Python package is not installed. "
        "Run: py -m pip install MetaTrader5",
        file=sys.stderr,
    )
    raise

HOST = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))
TERMINAL_PATH = os.getenv("MT5_TERMINAL_PATH", "").strip()
SYMBOL_PREFIX = os.getenv("MT5_SYMBOL_PREFIX", "").strip()
SYMBOL_SUFFIX = os.getenv("MT5_SYMBOL_SUFFIX", "").strip()

TIMEFRAMES = {
    "M1": (mt5.TIMEFRAME_M1, 60),
    "M5": (mt5.TIMEFRAME_M5, 5 * 60),
    "M15": (mt5.TIMEFRAME_M15, 15 * 60),
    "M30": (mt5.TIMEFRAME_M30, 30 * 60),
    "H1": (mt5.TIMEFRAME_H1, 60 * 60),
    "H4": (mt5.TIMEFRAME_H4, 4 * 60 * 60),
    "D1": (mt5.TIMEFRAME_D1, 24 * 60 * 60),
    "W1": (mt5.TIMEFRAME_W1, 7 * 24 * 60 * 60),
    "MN": (mt5.TIMEFRAME_MN1, 30 * 24 * 60 * 60),
}

MAX_BARS = 5000
CURRENT_TICK_MAX_AGE_MS = 5 * 60 * 1000


def _jsonable(value: Any) -> Any:
    if hasattr(value, "item"):
        return value.item()
    return value


def _last_error_text() -> str:
    code, message = mt5.last_error()
    return f"MT5 error {code}: {message}"


def _ensure_mt5() -> bool:
    terminal = mt5.terminal_info()
    if terminal is not None:
        return True
    if TERMINAL_PATH:
        return bool(mt5.initialize(TERMINAL_PATH))
    return bool(mt5.initialize())


def _resolve_symbol(canonical: str) -> str | None:
    canonical = canonical.strip().upper()
    if not canonical:
        return None

    configured = f"{SYMBOL_PREFIX}{canonical}{SYMBOL_SUFFIX}"
    for candidate in (configured, canonical):
        info = mt5.symbol_info(candidate)
        if info is not None:
            mt5.symbol_select(candidate, True)
            return candidate

    symbols = mt5.symbols_get()
    if symbols is None:
        return None

    matches = [
        item.name
        for item in symbols
        if item.name.upper().startswith(canonical)
    ]
    if not matches:
        return None

    resolved = sorted(matches, key=lambda name: (len(name), name))[0]
    mt5.symbol_select(resolved, True)
    return resolved


def _number(query: dict[str, list[str]], name: str, default: int | None = None) -> int:
    raw = query.get(name, [None])[0]
    if raw is None:
        if default is None:
            raise ValueError(f"Missing query parameter: {name}")
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid integer query parameter: {name}") from exc


def _symbol_info_or_raise(symbol: str):
    info = mt5.symbol_info(symbol)
    if info is None:
        raise LookupError(f"Symbol unavailable in MT5: {symbol}")
    return info


def _closed_rates(
    resolved_symbol: str,
    timeframe: str,
    limit: int,
    as_of_ms: int,
) -> list[dict[str, Any]]:
    tf = TIMEFRAMES.get(timeframe)
    if tf is None:
        raise ValueError(f"Unsupported timeframe: {timeframe}")

    mt5_timeframe, interval_seconds = tf
    count = min(MAX_BARS, max(limit + 12, limit))
    date_to = datetime.fromtimestamp(as_of_ms / 1000, tz=timezone.utc)
    rates = mt5.copy_rates_from(
        resolved_symbol,
        mt5_timeframe,
        date_to,
        count,
    )
    if rates is None:
        raise RuntimeError(_last_error_text())

    closed: list[dict[str, Any]] = []
    as_of_seconds = as_of_ms / 1000
    for rate in rates:
        timestamp_seconds = int(_jsonable(rate["time"]))
        if timestamp_seconds + interval_seconds > as_of_seconds:
            continue

        closed.append(
            {
                "timestamp": timestamp_seconds * 1000,
                "open": float(_jsonable(rate["open"])),
                "high": float(_jsonable(rate["high"])),
                "low": float(_jsonable(rate["low"])),
                "close": float(_jsonable(rate["close"])),
                "volume": float(_jsonable(rate["tick_volume"])),
            }
        )

    closed.sort(key=lambda candle: candle["timestamp"])
    return closed[-limit:]


def _current_tick_quote(
    canonical: str,
    resolved_symbol: str,
    as_of_ms: int,
) -> dict[str, Any] | None:
    tick = mt5.symbol_info_tick(resolved_symbol)
    if tick is None:
        return None

    timestamp = int(
        getattr(tick, "time_msc", 0)
        or int(getattr(tick, "time", 0)) * 1000
    )
    bid = float(getattr(tick, "bid", 0.0))
    ask = float(getattr(tick, "ask", 0.0))

    if (
        timestamp <= 0
        or bid <= 0
        or ask <= 0
        or ask < bid
        or timestamp > as_of_ms
        or as_of_ms - timestamp > CURRENT_TICK_MAX_AGE_MS
    ):
        return None

    return {
        "symbol": canonical,
        "resolvedSymbol": resolved_symbol,
        "bid": bid,
        "ask": ask,
        "price": (bid + ask) / 2,
        "timestamp": timestamp,
    }


def _historical_tick_quote(
    canonical: str,
    resolved_symbol: str,
    as_of_ms: int,
) -> dict[str, Any] | None:
    # The scanner anchors asOf before network work begins. By the time quote
    # retrieval happens, symbol_info_tick() may already be a few milliseconds
    # newer than that anchor. Use the last historical bid/ask tick <= asOf so
    # spread stays real without violating no-lookahead.
    date_to = datetime.fromtimestamp(as_of_ms / 1000, tz=timezone.utc)
    date_from = datetime.fromtimestamp((as_of_ms - 5 * 60 * 1000) / 1000, tz=timezone.utc)
    ticks = mt5.copy_ticks_range(
        resolved_symbol,
        date_from,
        date_to,
        mt5.COPY_TICKS_INFO,
    )
    if ticks is None or len(ticks) == 0:
        return None

    for tick in reversed(ticks):
        timestamp = int(_jsonable(tick["time_msc"]))
        bid = float(_jsonable(tick["bid"]))
        ask = float(_jsonable(tick["ask"]))
        if (
            timestamp > 0
            and timestamp <= as_of_ms
            and bid > 0
            and ask > 0
            and ask >= bid
        ):
            return {
                "symbol": canonical,
                "resolvedSymbol": resolved_symbol,
                "bid": bid,
                "ask": ask,
                "price": (bid + ask) / 2,
                "timestamp": timestamp,
            }

    return None


def _historical_bar_quote(
    canonical: str,
    resolved_symbol: str,
    as_of_ms: int,
) -> dict[str, Any]:
    # Last-resort fallback for brokers with no historical tick buffer. The M1
    # bar spread may be coarser than a real tick, but it still preserves asOf.
    info = _symbol_info_or_raise(resolved_symbol)
    point = float(getattr(info, "point", 0.0) or 0.0)
    if point <= 0:
        raise RuntimeError(f"MT5 symbol has invalid point size: {resolved_symbol}")

    rates = mt5.copy_rates_from(
        resolved_symbol,
        mt5.TIMEFRAME_M1,
        datetime.fromtimestamp(as_of_ms / 1000, tz=timezone.utc),
        12,
    )
    if rates is None:
        raise RuntimeError(_last_error_text())

    usable = []
    as_of_seconds = as_of_ms / 1000
    for rate in rates:
        timestamp_seconds = int(_jsonable(rate["time"]))
        if timestamp_seconds + 60 <= as_of_seconds:
            usable.append(rate)

    if not usable:
        raise RuntimeError(f"No completed M1 quote available for {canonical}")

    rate = usable[-1]
    price = float(_jsonable(rate["close"]))
    spread_points = float(_jsonable(rate["spread"]))
    spread = max(0.0, spread_points * point)

    return {
        "symbol": canonical,
        "resolvedSymbol": resolved_symbol,
        "bid": price - spread / 2,
        "ask": price + spread / 2,
        "price": price,
        "timestamp": int(_jsonable(rate["time"])) * 1000,
    }


def get_quote(canonical: str, as_of_ms: int) -> dict[str, Any]:
    resolved = _resolve_symbol(canonical)
    if resolved is None:
        raise LookupError(f"Symbol unavailable in MT5: {canonical}")

    current = _current_tick_quote(canonical, resolved, as_of_ms)
    if current is not None:
        return current

    historical_tick = _historical_tick_quote(canonical, resolved, as_of_ms)
    if historical_tick is not None:
        return historical_tick

    return _historical_bar_quote(canonical, resolved, as_of_ms)


class Handler(BaseHTTPRequestHandler):
    server_version = "FSE-MT5-Bridge/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[mt5-bridge] {self.address_string()} - {fmt % args}")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        try:
            if not _ensure_mt5():
                self.send_json(503, {"error": _last_error_text()})
                return

            if parsed.path == "/health":
                terminal = mt5.terminal_info()
                version = mt5.version()
                self.send_json(
                    200,
                    {
                        "connected": terminal is not None,
                        "version": list(version) if version else None,
                    },
                )
                return

            if parsed.path == "/candles":
                canonical = query.get("symbol", [""])[0].strip().upper()
                timeframe = query.get("timeframe", [""])[0].strip().upper()
                limit = max(1, min(MAX_BARS, _number(query, "limit", 220)))
                as_of_ms = _number(
                    query,
                    "asOf",
                    int(datetime.now(tz=timezone.utc).timestamp() * 1000),
                )

                resolved = _resolve_symbol(canonical)
                if resolved is None:
                    self.send_json(
                        404,
                        {"error": f"Symbol unavailable in MT5: {canonical}"},
                    )
                    return

                candles = _closed_rates(
                    resolved,
                    timeframe,
                    limit,
                    as_of_ms,
                )
                self.send_json(
                    200,
                    {
                        "symbol": canonical,
                        "resolvedSymbol": resolved,
                        "timeframe": timeframe,
                        "asOf": as_of_ms,
                        "candles": candles,
                    },
                )
                return

            if parsed.path == "/quote":
                canonical = query.get("symbol", [""])[0].strip().upper()
                as_of_ms = _number(
                    query,
                    "asOf",
                    int(datetime.now(tz=timezone.utc).timestamp() * 1000),
                )
                self.send_json(200, get_quote(canonical, as_of_ms))
                return

            self.send_json(404, {"error": "Unknown endpoint."})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except LookupError as error:
            self.send_json(404, {"error": str(error)})
        except Exception as error:
            self.send_json(503, {"error": str(error)})


def main() -> None:
    print("Forex Signal Engine MT5 bridge")
    print(f"Listening on http://{HOST}:{PORT}")
    print("Read-only endpoints: /health, /candles, /quote")

    if _ensure_mt5():
        print("MetaTrader 5 connection: CONNECTED")
    else:
        print(f"MetaTrader 5 connection: DISCONNECTED ({_last_error_text()})")

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        mt5.shutdown()
        print("MT5 bridge stopped.")


if __name__ == "__main__":
    main()
