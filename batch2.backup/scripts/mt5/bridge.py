#!/usr/bin/env python3
"""MetaTrader 5 bridge for Forex Signal Engine.

Market-data endpoints remain read-only and available by default.

Phase 10 adds a separately gated trade surface. Trade endpoints are disabled
unless MT5_TRADE_BRIDGE_ENABLED=true and require a bearer token. The bridge
always runs MT5 order_check before order_send and uses the FSE client tag for
idempotency/reconciliation.
"""

from __future__ import annotations

import json
import math
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
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

TRADE_BRIDGE_ENABLED = os.getenv(
    "MT5_TRADE_BRIDGE_ENABLED", "false"
).strip().lower() in {"1", "true", "yes", "on"}
TRADE_BRIDGE_TOKEN = os.getenv("MT5_TRADE_BRIDGE_TOKEN", "").strip()
TRADE_MAGIC = int(os.getenv("MT5_TRADE_MAGIC", "105610"))
TRADE_HISTORY_DAYS = max(
    1, min(90, int(os.getenv("MT5_TRADE_HISTORY_DAYS", "14")))
)
MAX_TRADE_BODY_BYTES = 16 * 1024

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


def _trade_auth_error(handler: "Handler") -> str | None:
    if not TRADE_BRIDGE_ENABLED:
        return "MT5 trade bridge is disabled."
    if not TRADE_BRIDGE_TOKEN:
        return "MT5 trade bridge token is not configured."

    authorization = handler.headers.get("Authorization", "")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return "Bearer authorization is required."
    provided = authorization[len(prefix):]
    if not secrets.compare_digest(provided, TRADE_BRIDGE_TOKEN):
        return "Bearer authorization is invalid."
    return None


def _trade_status() -> dict[str, Any]:
    terminal = mt5.terminal_info()
    account = mt5.account_info()
    connected = terminal is not None and account is not None
    account_trade_allowed = bool(
        getattr(account, "trade_allowed", False)
    ) if account is not None else False
    expert_allowed = (
        bool(getattr(account, "trade_expert", False))
        if account is not None
        else False
    )
    terminal_trade_allowed = (
        bool(getattr(terminal, "trade_allowed", False))
        if terminal is not None
        else False
    )

    return {
        "providerId": "mt5",
        "connected": connected,
        "tradeAllowed": (
            connected
            and TRADE_BRIDGE_ENABLED
            and account_trade_allowed
            and terminal_trade_allowed
        ),
        "expertTradingAllowed": expert_allowed,
        "terminalTradingAllowed": terminal_trade_allowed,
        "accountCurrency": (
            str(getattr(account, "currency", ""))
            if account is not None
            else None
        ),
        "balance": (
            float(getattr(account, "balance", 0.0))
            if account is not None
            else None
        ),
        "equity": (
            float(getattr(account, "equity", 0.0))
            if account is not None
            else None
        ),
        "message": (
            "MT5 trade bridge is ready."
            if connected and TRADE_BRIDGE_ENABLED
            else (
                "MT5 is connected but trade bridge is disabled."
                if connected
                else "MT5 account/terminal is unavailable."
            )
        ),
    }


def _trade_payload_number(
    payload: dict[str, Any],
    name: str,
    allow_none: bool = False,
) -> float | None:
    value = payload.get(name)
    if value is None and allow_none:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be numeric.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{name} must be finite.")
    return number


def _normalize_volume(info: Any, requested: float) -> float:
    minimum = float(getattr(info, "volume_min", 0.0) or 0.0)
    maximum = float(getattr(info, "volume_max", 0.0) or 0.0)
    step = float(getattr(info, "volume_step", 0.0) or 0.0)
    if requested <= 0 or minimum <= 0 or maximum <= 0 or step <= 0:
        raise ValueError("Invalid requested/broker volume constraints.")
    if requested < minimum - 1e-12 or requested > maximum + 1e-12:
        raise ValueError(
            f"Requested volume {requested} is outside broker range "
            f"{minimum}..{maximum}."
        )

    steps = math.floor((requested - minimum + 1e-12) / step)
    normalized = minimum + steps * step
    normalized = max(minimum, min(maximum, normalized))
    precision = max(0, min(8, len(f"{step:.8f}".rstrip("0").split(".")[-1])))
    return round(normalized, precision)


def _filling_candidates(info: Any) -> list[int]:
    mode = int(getattr(info, "filling_mode", 0) or 0)
    out: list[int] = []

    symbol_fok = int(getattr(mt5, "SYMBOL_FILLING_FOK", 1))
    symbol_ioc = int(getattr(mt5, "SYMBOL_FILLING_IOC", 2))

    if mode & symbol_fok:
        out.append(int(mt5.ORDER_FILLING_FOK))
    if mode & symbol_ioc:
        out.append(int(mt5.ORDER_FILLING_IOC))

    out.extend([
        int(mt5.ORDER_FILLING_RETURN),
        int(mt5.ORDER_FILLING_IOC),
        int(mt5.ORDER_FILLING_FOK),
    ])

    unique: list[int] = []
    for item in out:
        if item not in unique:
            unique.append(item)
    return unique


def _validate_trade_geometry(
    side: str,
    bid: float,
    ask: float,
    stop_loss: float,
    take_profit: float | None,
    info: Any,
) -> None:
    point = float(getattr(info, "point", 0.0) or 0.0)
    stops_level = float(getattr(info, "trade_stops_level", 0.0) or 0.0)
    min_distance = max(0.0, point * stops_level)

    if side == "BUY":
        if stop_loss >= bid:
            raise ValueError("BUY stop loss must be below current bid.")
        if take_profit is not None and take_profit <= ask:
            raise ValueError("BUY take profit must be above current ask.")
        if bid - stop_loss < min_distance:
            raise ValueError("BUY stop loss violates broker stops level.")
        if take_profit is not None and take_profit - ask < min_distance:
            raise ValueError("BUY take profit violates broker stops level.")
    else:
        if stop_loss <= ask:
            raise ValueError("SELL stop loss must be above current ask.")
        if take_profit is not None and take_profit >= bid:
            raise ValueError("SELL take profit must be below current bid.")
        if stop_loss - ask < min_distance:
            raise ValueError("SELL stop loss violates broker stops level.")
        if take_profit is not None and bid - take_profit < min_distance:
            raise ValueError("SELL take profit violates broker stops level.")


def _checked_trade_request(
    payload: dict[str, Any],
) -> tuple[dict[str, Any], Any, dict[str, Any]]:
    status = _trade_status()
    if not status["connected"]:
        raise RuntimeError("MT5 account/terminal is unavailable.")
    if not status["tradeAllowed"]:
        raise RuntimeError("MT5 account/terminal does not allow trading.")

    canonical = str(payload.get("symbol", "")).strip().upper()
    side = str(payload.get("side", "")).strip().upper()
    client_tag = str(payload.get("clientTag", "")).strip()
    if not canonical:
        raise ValueError("symbol is required.")
    if side not in {"BUY", "SELL"}:
        raise ValueError("side must be BUY or SELL.")
    if not client_tag or len(client_tag) > 31:
        raise ValueError("clientTag must be 1..31 characters.")

    resolved = _resolve_symbol(canonical)
    if resolved is None:
        raise LookupError(f"Symbol unavailable in MT5: {canonical}")
    info = _symbol_info_or_raise(resolved)
    tick = mt5.symbol_info_tick(resolved)
    if tick is None:
        raise RuntimeError(f"No current tick for {resolved}.")

    bid = float(getattr(tick, "bid", 0.0))
    ask = float(getattr(tick, "ask", 0.0))
    if bid <= 0 or ask <= 0 or ask < bid:
        raise RuntimeError(f"Invalid current bid/ask for {resolved}.")

    requested_volume = _trade_payload_number(payload, "volume")
    expected_entry = _trade_payload_number(payload, "expectedEntry")
    stop_loss = _trade_payload_number(payload, "stopLoss")
    take_profit = _trade_payload_number(payload, "takeProfit", True)
    deviation_raw = payload.get("maxDeviationPoints", 20)
    if (
        isinstance(deviation_raw, bool)
        or not isinstance(deviation_raw, (int, float))
    ):
        raise ValueError("maxDeviationPoints must be numeric.")
    deviation = max(0, min(1000, int(deviation_raw)))

    assert requested_volume is not None
    assert expected_entry is not None
    assert stop_loss is not None

    point = float(getattr(info, "point", 0.0) or 0.0)
    if point <= 0:
        raise ValueError("Broker symbol point size is invalid.")
    market_price = ask if side == "BUY" else bid
    max_price_drift = deviation * point
    if abs(market_price - expected_entry) > max_price_drift:
        raise ValueError(
            "Current market price drift exceeds frozen-entry deviation limit."
        )

    volume = _normalize_volume(info, requested_volume)
    _validate_trade_geometry(
        side,
        bid,
        ask,
        stop_loss,
        take_profit,
        info,
    )

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": resolved,
        "volume": volume,
        "type": (
            mt5.ORDER_TYPE_BUY
            if side == "BUY"
            else mt5.ORDER_TYPE_SELL
        ),
        "price": ask if side == "BUY" else bid,
        "sl": stop_loss,
        "tp": take_profit or 0.0,
        "deviation": deviation,
        "magic": TRADE_MAGIC,
        "comment": client_tag,
        "type_time": mt5.ORDER_TIME_GTC,
    }

    last_check = None
    for filling in _filling_candidates(info):
        candidate = {**request, "type_filling": filling}
        checked = mt5.order_check(candidate)
        last_check = checked
        if checked is not None and int(getattr(checked, "retcode", -1)) == 0:
            return candidate, checked, {
                "canonical": canonical,
                "resolved": resolved,
                "side": side,
                "bid": bid,
                "ask": ask,
                "normalizedVolume": volume,
                "clientTag": client_tag,
            }

    message = (
        str(getattr(last_check, "comment", ""))
        if last_check is not None
        else _last_error_text()
    )
    code = (
        int(getattr(last_check, "retcode", -1))
        if last_check is not None
        else -1
    )
    raise ValueError(f"MT5 order_check rejected ({code}): {message}")


def _preflight_trade(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        _, checked, context = _checked_trade_request(payload)
        return {
            "ok": True,
            "code": str(int(getattr(checked, "retcode", 0))),
            "message": str(
                getattr(checked, "comment", "MT5 order_check accepted.")
            ),
            "bid": context["bid"],
            "ask": context["ask"],
            "normalizedVolume": context["normalizedVolume"],
        }
    except Exception as error:
        return {
            "ok": False,
            "code": "MT5_CHECK_REJECTED",
            "message": str(error),
            "bid": None,
            "ask": None,
            "normalizedVolume": None,
        }


def _position_to_json(position: Any) -> dict[str, Any]:
    side_value = int(getattr(position, "type", -1))
    return {
        "ticket": str(getattr(position, "ticket", "")),
        "symbol": str(getattr(position, "symbol", "")),
        "side": (
            "BUY"
            if side_value == int(mt5.POSITION_TYPE_BUY)
            else "SELL"
        ),
        "volume": float(getattr(position, "volume", 0.0)),
        "priceOpen": float(getattr(position, "price_open", 0.0)),
        "stopLoss": (
            float(getattr(position, "sl", 0.0))
            if float(getattr(position, "sl", 0.0)) > 0
            else None
        ),
        "takeProfit": (
            float(getattr(position, "tp", 0.0))
            if float(getattr(position, "tp", 0.0)) > 0
            else None
        ),
        "currentPrice": float(getattr(position, "price_current", 0.0)),
        "profit": float(getattr(position, "profit", 0.0)),
        "clientTag": str(getattr(position, "comment", "")) or None,
    }


def _list_trade_positions() -> list[dict[str, Any]]:
    positions = mt5.positions_get()
    if positions is None:
        raise RuntimeError(_last_error_text())
    return [_position_to_json(item) for item in positions]


def _reconcile_trade_tag(client_tag: str) -> dict[str, Any]:
    if not client_tag:
        raise ValueError("tag is required.")

    positions = mt5.positions_get()
    if positions is not None:
        for item in positions:
            if (
                str(getattr(item, "comment", "")) == client_tag
                and int(getattr(item, "magic", -1)) == TRADE_MAGIC
            ):
                return {
                    "found": True,
                    "state": "OPEN_POSITION",
                    "clientTag": client_tag,
                    "orderId": None,
                    "dealId": None,
                    "positionId": str(getattr(item, "ticket", "")),
                    "message": "Matching open MT5 position found.",
                }

    orders = mt5.orders_get()
    if orders is not None:
        for item in orders:
            if (
                str(getattr(item, "comment", "")) == client_tag
                and int(getattr(item, "magic", -1)) == TRADE_MAGIC
            ):
                return {
                    "found": True,
                    "state": "ACTIVE_ORDER",
                    "clientTag": client_tag,
                    "orderId": str(getattr(item, "ticket", "")),
                    "dealId": None,
                    "positionId": (
                        str(getattr(item, "position_id", ""))
                        or None
                    ),
                    "message": "Matching active MT5 order found.",
                }

    date_to = datetime.now(tz=timezone.utc)
    date_from = date_to - timedelta(days=TRADE_HISTORY_DAYS)

    history_orders = mt5.history_orders_get(date_from, date_to)
    if history_orders is not None:
        for item in reversed(history_orders):
            if (
                str(getattr(item, "comment", "")) == client_tag
                and int(getattr(item, "magic", -1)) == TRADE_MAGIC
            ):
                return {
                    "found": True,
                    "state": "HISTORY_ORDER",
                    "clientTag": client_tag,
                    "orderId": str(getattr(item, "ticket", "")),
                    "dealId": None,
                    "positionId": (
                        str(getattr(item, "position_id", ""))
                        or None
                    ),
                    "message": "Matching historical MT5 order found.",
                }

    history_deals = mt5.history_deals_get(date_from, date_to)
    if history_deals is not None:
        for item in reversed(history_deals):
            if (
                str(getattr(item, "comment", "")) == client_tag
                and int(getattr(item, "magic", -1)) == TRADE_MAGIC
            ):
                return {
                    "found": True,
                    "state": "HISTORY_DEAL",
                    "clientTag": client_tag,
                    "orderId": (
                        str(getattr(item, "order", ""))
                        or None
                    ),
                    "dealId": str(getattr(item, "ticket", "")),
                    "positionId": (
                        str(getattr(item, "position_id", ""))
                        or None
                    ),
                    "message": "Matching historical MT5 deal found.",
                }

    return {
        "found": False,
        "state": "NOT_FOUND",
        "clientTag": client_tag,
        "orderId": None,
        "dealId": None,
        "positionId": None,
        "message": "No matching MT5 order, deal, or position found.",
    }


def _send_trade(payload: dict[str, Any]) -> dict[str, Any]:
    if str(payload.get("liveConfirmation", "")) != "FSE-LIVE":
        raise ValueError("Explicit liveConfirmation is required.")

    client_tag = str(payload.get("clientTag", "")).strip()
    existing = _reconcile_trade_tag(client_tag)
    if existing["found"]:
        return {
            "accepted": True,
            "outcome": "PLACED",
            "code": "IDEMPOTENT_EXISTING",
            "message": existing["message"],
            "clientTag": client_tag,
            "orderId": existing["orderId"],
            "dealId": existing["dealId"],
            "positionId": existing["positionId"],
            "filledPrice": None,
        }

    request, _, context = _checked_trade_request(payload)
    result = mt5.order_send(request)
    if result is None:
        raise RuntimeError(_last_error_text())

    retcode = int(getattr(result, "retcode", -1))
    done = int(getattr(mt5, "TRADE_RETCODE_DONE", 10009))
    partial = int(getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010))
    placed = int(getattr(mt5, "TRADE_RETCODE_PLACED", 10008))

    if retcode == done:
        outcome = "FILLED"
        accepted = True
    elif retcode == partial:
        outcome = "PARTIAL"
        accepted = True
    elif retcode == placed:
        outcome = "PLACED"
        accepted = True
    else:
        outcome = "REJECTED"
        accepted = False

    price = float(getattr(result, "price", 0.0) or 0.0)
    return {
        "accepted": accepted,
        "outcome": outcome,
        "code": str(retcode),
        "message": str(getattr(result, "comment", "")),
        "clientTag": context["clientTag"],
        "orderId": (
            str(getattr(result, "order", ""))
            if int(getattr(result, "order", 0) or 0) > 0
            else None
        ),
        "dealId": (
            str(getattr(result, "deal", ""))
            if int(getattr(result, "deal", 0) or 0) > 0
            else None
        ),
        "positionId": None,
        "filledPrice": price if price > 0 else None,
    }


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

    def _read_json_body(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length.") from exc
        if length <= 0 or length > MAX_TRADE_BODY_BYTES:
            raise ValueError("Invalid trade request body size.")
        raw = self.rfile.read(length)
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Trade request body must be a JSON object.")
        return payload

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        try:
            auth_error = _trade_auth_error(self)
            if auth_error is not None:
                status = 503 if "disabled" in auth_error else 401
                self.send_json(status, {"error": auth_error})
                return
            if not _ensure_mt5():
                self.send_json(503, {"error": _last_error_text()})
                return

            payload = self._read_json_body()
            if parsed.path == "/trade/check":
                result = _preflight_trade(payload)
                self.send_json(200, result)
                return
            if parsed.path == "/trade/order":
                result = _send_trade(payload)
                self.send_json(200, result)
                return

            self.send_json(404, {"error": "Unknown trade endpoint."})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except LookupError as error:
            self.send_json(404, {"error": str(error)})
        except Exception as error:
            self.send_json(503, {"error": str(error)})

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

            if parsed.path.startswith("/trade/"):
                auth_error = _trade_auth_error(self)
                if auth_error is not None:
                    status = 503 if "disabled" in auth_error else 401
                    self.send_json(status, {"error": auth_error})
                    return

                if parsed.path == "/trade/status":
                    self.send_json(200, _trade_status())
                    return
                if parsed.path == "/trade/positions":
                    self.send_json(
                        200,
                        {"positions": _list_trade_positions()},
                    )
                    return
                if parsed.path == "/trade/reconcile":
                    tag = query.get("tag", [""])[0].strip()
                    self.send_json(200, _reconcile_trade_tag(tag))
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
    print("Market-data endpoints: /health, /candles, /quote")
    print(
        "Trade endpoints: " +
        ("ENABLED" if TRADE_BRIDGE_ENABLED else "DISABLED")
    )

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
