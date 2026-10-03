# apply-batch1.ps1
# Batch 1 fixes: C1, C2, C3 (skip), C4, N1, N3, N4
# Idempotent-ish: safe to re-run; will warn if patterns already applied.

$ErrorActionPreference = "Stop"

if (-not (Test-Path "src")) {
  throw "Run this script from the repo root (folder containing 'src')."
}

# --- Backup ---
$backup = "src.batch1.backup"
if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
Copy-Item src $backup -Recurse
Write-Host "[OK] Backup -> $backup" -ForegroundColor Green

# --- Helper ---
function Replace-Exact {
  param([string]$Path, [string]$Old, [string]$New, [string]$Label)
  if (-not (Test-Path $Path)) { Write-Warning "[SKIP] $Label : file not found $Path"; return }
  $c = Get-Content $Path -Raw
  if (-not $c.Contains($Old)) { Write-Warning "[SKIP] $Label : pattern not found in $Path"; return }
  Set-Content -Path $Path -Value $c.Replace($Old, $New) -NoNewline
  Write-Host "[OK] $Label" -ForegroundColor Green
}

function Insert-After {
  param([string]$Path, [string]$Anchor, [string]$Insert, [string]$Label)
  if (-not (Test-Path $Path)) { Write-Warning "[SKIP] $Label : file not found $Path"; return }
  $c = Get-Content $Path -Raw
  if ($c.Contains($Insert.Trim())) { Write-Warning "[SKIP] $Label : already inserted"; return }
  if (-not $c.Contains($Anchor)) { Write-Warning "[SKIP] $Label : anchor not found in $Path"; return }
  $c = $c.Replace($Anchor, $Anchor + $Insert)
  Set-Content -Path $Path -Value $c -NoNewline
  Write-Host "[OK] $Label" -ForegroundColor Green
}

# =============================================================
# P2-partial: lastDecisionIndex utility in closed-candle.ts
# =============================================================
$closedCandle = "src\market-data\closed-candle.ts"
if (Test-Path $closedCandle) {
  $utility = @'


/**
 * Index of the newest candle that is safe to reason about.
 *
 * When `closedOnly` is true the data provider guarantees the last array
 * element is already closed and can be used directly. Otherwise we skip the
 * final element (potentially still forming) to avoid lookahead.
 *
 * Returns -1 for an empty array.
 */
export function lastDecisionIndex(length: number, closedOnly: boolean): number {
  if (length === 0) return -1;
  return closedOnly ? length - 1 : Math.max(0, length - 2);
}
'@
  Add-Content -Path $closedCandle -Value $utility
  Write-Host "[OK] P2 utility appended to closed-candle.ts" -ForegroundColor Green
}

# =============================================================
# P1: New file entry-price.ts
# =============================================================
$entryPriceFile = "src\core\strategies\entry-price.ts"
$entryPriceSrc = @'
import type { OHLCV } from "@/types/market";
import type { SetupResultData, TriggerResultData } from "@/types/engine";

/**
 * Resolve the entry price for a CONFIRMED trigger.
 *
 * The entry is the CLOSE of the trigger bar itself, never the latest bar in
 * the array. Using the latest bar misprices R:R whenever a trigger is
 * confirmed several bars late, and leaks lookahead if the final candle is
 * still forming.
 *
 * Fallback order:
 *  1. Close of the trigger bar (if triggerIndex is a valid index).
 *  2. Midpoint of the setup zone (only when the trigger bar cannot be located).
 */
export function resolveEntryPrice(
  candles: readonly OHLCV[],
  setup: SetupResultData,
  trigger: TriggerResultData
): number {
  const idx = trigger.triggerIndex;
  if (idx !== null && idx >= 0 && idx < candles.length) {
    return candles[idx].close;
  }
  return (setup.zoneHigh + setup.zoneLow) / 2;
}
'@
New-Item -ItemType Directory -Force -Path "src\core\strategies" | Out-Null
Set-Content -Path $entryPriceFile -Value $entryPriceSrc -NoNewline
Write-Host "[OK] P1 created entry-price.ts" -ForegroundColor Green

# =============================================================
# P1 + P2: Apply to 4 strategies
# =============================================================

# --- trend-pullback.ts ---
$f = "src\core\strategies\trend-pullback.ts"
Replace-Exact $f `
'import { last } from "@/core/indicators";' `
'import { last } from "@/core/indicators";
import { resolveEntryPrice } from "@/core/strategies/entry-price";' `
"P1 import trend-pullback"

Replace-Exact $f `
'  const trigger = evaluateTrigger(
    triggerTimeframe.snapshot.candles,' `
'  const triggerCandles =
    context.closedOnly === true
      ? triggerTimeframe.snapshot.candles
      : triggerTimeframe.snapshot.candles.slice(0, -1);
  const trigger = evaluateTrigger(
    triggerCandles,' `
"P2a trend-pullback trigger candles"

Replace-Exact $f `
'  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneHigh + setup.data.zoneLow) / 2;' `
'  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);' `
"P1 entry trend-pullback"

# --- reversal/reversal.ts ---
$f = "src\core\strategies\reversal\reversal.ts"
Replace-Exact $f `
'import { last } from "@/core/indicators";' `
'import { last } from "@/core/indicators";
import { resolveEntryPrice } from "@/core/strategies/entry-price";' `
"P1 import reversal"

Replace-Exact $f `
'  const trigger = evaluateReversalTrigger({
    candles: triggerTimeframe.snapshot.candles,' `
'  const triggerCandles =
    context.closedOnly === true
      ? triggerTimeframe.snapshot.candles
      : triggerTimeframe.snapshot.candles.slice(0, -1);
  const trigger = evaluateReversalTrigger({
    candles: triggerCandles,' `
"P2a reversal trigger candles"

Replace-Exact $f `
'  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneLow + setup.data.zoneHigh) / 2;' `
'  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);' `
"P1 entry reversal"

# --- breakout-retest/breakout-retest.ts ---
$f = "src\core\strategies\breakout-retest\breakout-retest.ts"
Replace-Exact $f `
'import { last } from "@/core/indicators";' `
'import { last } from "@/core/indicators";
import { resolveEntryPrice } from "@/core/strategies/entry-price";' `
"P1 import breakout-retest"

Replace-Exact $f `
'  const trigger = evaluateBreakoutRetestTrigger({
    candles: triggerTimeframe.snapshot.candles,' `
'  const triggerCandles =
    context.closedOnly === true
      ? triggerTimeframe.snapshot.candles
      : triggerTimeframe.snapshot.candles.slice(0, -1);
  const trigger = evaluateBreakoutRetestTrigger({
    candles: triggerCandles,' `
"P2a breakout-retest trigger candles"

Replace-Exact $f `
'  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneHigh + setup.data.zoneLow) / 2;' `
'  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);' `
"P1 entry breakout-retest"

# --- range-mean-reversion/range-mean-reversion.ts ---
$f = "src\core\strategies\range-mean-reversion\range-mean-reversion.ts"
Replace-Exact $f `
'import { last } from "@/core/indicators";' `
'import { last } from "@/core/indicators";
import { resolveEntryPrice } from "@/core/strategies/entry-price";' `
"P1 import range-mean-reversion"

Replace-Exact $f `
'  const trigger = evaluateRangeMeanReversionTrigger({
    candles: triggerTimeframe.snapshot.candles,' `
'  const triggerCandles =
    context.closedOnly === true
      ? triggerTimeframe.snapshot.candles
      : triggerTimeframe.snapshot.candles.slice(0, -1);
  const trigger = evaluateRangeMeanReversionTrigger({
    candles: triggerCandles,' `
"P2a range-mean-reversion trigger candles"

Replace-Exact $f `
'  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneLow + setup.data.zoneHigh) / 2;' `
'  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);' `
"P1 entry range-mean-reversion"

# =============================================================
# P3: Freshness consistency in execution-engine.ts
# =============================================================
$f = "src\core\execution\execution-engine.ts"
Replace-Exact $f `
'  const dataFresh =
    hasSnapshot &&
    (context.marketDataFreshness !== undefined
      ? context.marketDataFreshness === "FRESH"
      : dataAgeMs <= config.execution.maxDataAgeMs);' `
'  // Freshness policy per mode (audit finding C4):
  //  - LIVE: DELAYED is treated as untrustworthy; only FRESH passes.
  //  - SIGNAL_ONLY / PAPER: DELAYED is allowed (only STALE blocks).
  const perRole = context.marketDataFreshnessByRole;
  const scannerFreshness = perRole?.trigger ?? context.marketDataFreshness;
  const dataFresh =
    hasSnapshot &&
    (scannerFreshness !== undefined
      ? mode === "LIVE"
        ? scannerFreshness === "FRESH"
        : scannerFreshness !== "STALE"
      : dataAgeMs <= config.execution.maxDataAgeMs);' `
"P3/P6 execution-engine freshness"

# =============================================================
# P4 + P6: Veto changes
# =============================================================
$f = "src\core\execution\veto.ts"

# Add imports
Replace-Exact $f `
'import type {
  Direction,
  MarketSnapshot,
  ExecutionMode,
  RegimeLabel,
} from "@/types/market";' `
'import type {
  Direction,
  MarketSnapshot,
  ExecutionMode,
  RegimeLabel,
  Timeframe,
} from "@/types/market";
import { intervalMs } from "@/market-data/timeframe";' `
"P4 veto imports"

# Add context fields
Replace-Exact $f `
'  /** When the signal was created, as UTC epoch milliseconds. */
  signalTimestamp?: number;' `
'  /** When the signal was created, as UTC epoch milliseconds. */
  signalTimestamp?: number;
  /** Signal TTL in trigger-timeframe bars, when supplied (audit finding N1). */
  signalTtlTriggerBars?: number;
  /** Trigger timeframe, required to convert signalTtl into ms (audit finding N1). */
  triggerTimeframe?: Timeframe;
  /** Per-timeframe-role freshness (audit finding N4). */
  marketDataFreshnessByRole?: {
    macro?: "FRESH" | "DELAYED" | "STALE";
    bias?: "FRESH" | "DELAYED" | "STALE";
    setup?: "FRESH" | "DELAYED" | "STALE";
    trigger?: "FRESH" | "DELAYED" | "STALE";
  };' `
"P4/N4 veto context fields"

# Replace STALE_DATA_VETO body to prefer per-role
Replace-Exact $f `
'    const scannerFreshness = context.execution?.marketDataFreshness;
    const scannerAge = context.execution?.marketDataAgeMs;
    if (scannerFreshness !== undefined) {
      if (scannerFreshness === "STALE") {' `
'    const perRole = context.execution?.marketDataFreshnessByRole;
    const scannerFreshness =
      perRole?.trigger ?? context.execution?.marketDataFreshness;
    const scannerAge = context.execution?.marketDataAgeMs;
    if (scannerFreshness !== undefined) {
      if (scannerFreshness === "STALE") {' `
"P6 STALE_DATA veto per-role"

# Replace SIGNAL_EXPIRED_VETO body (P4)
Replace-Exact $f `
'    const maxAge = context.config.execution.maxSignalAgeMs;
    const signalAt = context.execution?.signalTimestamp;
    const now = marketTime(context);
    if (signalAt === undefined) {
      return { triggered: false, skipped: true, reason: "No signal creation time supplied." };
    }
    const age = now - signalAt;
    if (age > maxAge) {
      return {
        triggered: true,
        reason: `Signal is ${Math.round(age / 1000)}s old, exceeding the ${Math.round(maxAge / 1000)}s maximum.`,
      };
    }
    return { triggered: false };' `
'    const signalAt = context.execution?.signalTimestamp;
    if (signalAt === undefined) {
      return { triggered: false, skipped: true, reason: "No signal creation time supplied." };
    }
    const baseMaxAge = context.config.execution.maxSignalAgeMs;
    const ttlBars = context.execution?.signalTtlTriggerBars;
    const triggerTf = context.execution?.triggerTimeframe;
    const ttlMs =
      ttlBars !== undefined && triggerTf !== undefined
        ? ttlBars * intervalMs(triggerTf)
        : undefined;
    const maxAge = ttlMs !== undefined ? Math.min(baseMaxAge, ttlMs) : baseMaxAge;
    const now = marketTime(context);
    const age = now - signalAt;
    if (age > maxAge) {
      const source = ttlMs !== undefined && ttlMs < baseMaxAge ? "signal TTL" : "maxSignalAgeMs";
      return {
        triggered: true,
        reason: `Signal is ${Math.round(age / 1000)}s old, exceeding ${Math.round(maxAge / 1000)}s (${source}).`,
      };
    }
    return { triggered: false };' `
"P4 SIGNAL_EXPIRED veto body"

# =============================================================
# P5: maxDataAgeMs + maxSignalAgeMs
# =============================================================
$f = "src\core\config\engine-config.ts"
Replace-Exact $f `
'    /** Market data older than this is stale and blocks execution. */
    maxDataAgeMs: 60_000,' `
'    /**
     * Fallback freshness threshold when no per-timeframe classification exists.
     * Sized to roughly one M15 bar so the fallback path is usable outside LIVE.
     */
    maxDataAgeMs: 900_000,' `
"P5 maxDataAgeMs"

Replace-Exact $f `
'    /** A signal older than this is expired and must not execute. */
    maxSignalAgeMs: 3_600_000,' `
'    /**
     * Absolute ceiling on signal age. Effective age is the tighter of this and
     * signalTtl.triggerBars converted to ms via the trigger timeframe.
     */
    maxSignalAgeMs: 5_400_000,' `
"P4 maxSignalAgeMs"

# =============================================================
# P7: Config validator
# =============================================================
$validator = @'


/**
 * Throw if the supplied config violates internal invariants.
 * Call once at app startup after resolveConfig(); never per-request.
 */
export function assertEngineConfigValid(config: EngineConfig): void {
  const { risk, bias, execution } = config;
  if (!(risk.defaultRiskPercent <= risk.maxRiskPercent)) {
    throw new Error(
      `Config invalid: defaultRiskPercent ${risk.defaultRiskPercent} > maxRiskPercent ${risk.maxRiskPercent}.`
    );
  }
  if (!(risk.defaultRiskPercent >= risk.minRiskPercent)) {
    throw new Error(
      `Config invalid: defaultRiskPercent ${risk.defaultRiskPercent} < minRiskPercent ${risk.minRiskPercent}.`
    );
  }
  if (!(risk.tp2RR >= risk.minRR)) {
    throw new Error(
      `Config invalid: tp2RR ${risk.tp2RR} < minRR ${risk.minRR}.`
    );
  }
  const weightSum = Object.values(bias.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(weightSum - 100) > 0.01) {
    throw new Error(`Config invalid: bias.weights sum to ${weightSum}, expected 100.`);
  }
  if (!(execution.maxDataAgeMs > 0) || !(execution.maxSignalAgeMs > 0)) {
    throw new Error("Config invalid: execution age thresholds must be positive.");
  }
}
'@
Add-Content -Path $f -Value $validator
Write-Host "[OK] P7 validator appended to engine-config.ts" -ForegroundColor Green

# =============================================================
Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Cyan
Write-Host "Backup: $backup" -ForegroundColor Yellow
Write-Host "Next: git diff, lalu npm test" -ForegroundColor Yellow