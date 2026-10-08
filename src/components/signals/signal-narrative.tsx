/**
 * Signal Detail narrative panel.
 *
 * Fase A revision: hero card renders the pipeline progress bar plus a
 * rich, plain-language narrative derived from the engine's own output
 * (plannedLevels, riskDetail, executionDetail, workstationStatus). The
 * former standalone state word is dropped; the current stage is shown
 * by the progress bar itself.
 *
 * All copy is English. Engine codes and descriptions are shown as-is;
 * the UI never computes or re-weights anything.
 */

"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import { SYMBOL_METADATA } from "@/config/scanner";
import { formatPrice } from "@/lib/format";
import {
  stageGlyph,
  workstationStages,
  workstationStatus,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

function pipSizeFor(symbol: string): number | null {
  return SYMBOL_METADATA[symbol]?.pipSize ?? null;
}

function levelsSummary(result: SymbolScanResult): string {
  const risk = result.riskDetail;
  const planned = result.plannedLevels ?? null;
  const entry = risk?.entryPrice ?? planned?.entry ?? null;
  const stop = risk?.stopLoss ?? planned?.stop ?? null;
  const tp = risk?.takeProfit1 ?? planned?.takeProfit ?? null;
  const rr = result.riskReward ?? risk?.plannedRR ?? planned?.rr ?? null;
  if (entry === null || stop === null || tp === null) return "";
  let text =
    "Entry " +
    formatPrice(result.symbol, entry) +
    " \u00B7 SL " +
    formatPrice(result.symbol, stop) +
    " \u00B7 TP1 " +
    formatPrice(result.symbol, tp);
  if (rr !== null && Number.isFinite(rr)) {
    text += " \u00B7 RR 1:" + rr.toFixed(2);
  }
  return text + ".";
}

function genericWatchingNarrative(result: SymbolScanResult): string {
  const parts: string[] = [];
  parts.push("Watching for a valid setup.");
  if (result.biasDirection && result.biasScore !== null) {
    const strength = Math.round(Math.abs(result.biasScore));
    parts.push(
      "Bias " + result.biasDirection + " at strength " + strength + "."
    );
  }
  parts.push(
    "No setup zone formed yet \u2014 the Setup engine will create one once price approaches a demand or supply level."
  );
  return parts.join(" ");
}

function watchingNarrative(
  result: SymbolScanResult,
  pipSize: number | null
): string {
  const planned = result.plannedLevels ?? null;
  if (!planned) return genericWatchingNarrative(result);
  const zoneName = planned.direction === "SHORT" ? "supply zone" : "demand zone";
  const zoneStr =
    formatPrice(result.symbol, planned.zoneLow) +
    " \u2013 " +
    formatPrice(result.symbol, planned.zoneHigh);
  let text = "Waiting for price to reach the " + zoneName + " " + zoneStr + ".";
  const price = result.latestPrice;
  if (price !== null && pipSize !== null && pipSize > 0) {
    const near =
      planned.direction === "SHORT" ? planned.zoneLow : planned.zoneHigh;
    const distance = Math.round(Math.abs(near - price) / pipSize);
    const rel =
      price < near ? "below" : price > near ? "above" : "at";
    text +=
      " Current price " +
      formatPrice(result.symbol, price) +
      " (" +
      distance +
      " pips " +
      rel +
      ").";
  }
  if (result.setupScore !== null && Number.isFinite(result.setupScore)) {
    text += " Setup score " + Math.round(result.setupScore) + "/60.";
  }
  return text;
}

function armedNarrative(
  result: SymbolScanResult,
  pipSize: number | null
): string {
  void pipSize;
  const planned = result.plannedLevels ?? null;
  if (!planned) return genericWatchingNarrative(result);
  const zoneName = planned.direction === "SHORT" ? "supply zone" : "demand zone";
  const zoneStr =
    formatPrice(result.symbol, planned.zoneLow) +
    " \u2013 " +
    formatPrice(result.symbol, planned.zoneHigh);
  const levels = levelsSummary(result);
  return (
    "Price inside " +
    zoneName +
    " " +
    zoneStr +
    ". Awaiting trigger candle." +
    (levels ? " " + levels : "")
  );
}

function heroNarrative(
  result: SymbolScanResult,
  pipSize: number | null
): string {
  const status = result.status;
  if (status !== "ANALYSED" && status !== "ANALYSED_PARTIAL") {
    return workstationStatus(result).detail;
  }
  if (
    result.executionDecision === "INVALIDATED" ||
    result.signalState === "INVALIDATED" ||
    result.setupState === "INVALIDATED" ||
    result.triggerState === "INVALIDATED"
  ) {
    return workstationStatus(result).detail;
  }
  if (result.signalState === "CLOSED") {
    return "Signal lifecycle ended.";
  }
  if (
    result.executionDecision === "BLOCKED" ||
    result.signalState === "BLOCKED"
  ) {
    const veto = result.executionDetail?.triggeredVetoes?.[0];
    if (veto) return "Execution blocked: " + veto + ".";
    if (result.riskDetail?.rejectionReason) {
      return "Execution blocked: " + result.riskDetail.rejectionReason + ".";
    }
    return "Execution blocked by engine gate.";
  }
  if (
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE"
  ) {
    const levels = levelsSummary(result);
    return levels ? "All gates passed. " + levels : "All gates passed.";
  }
  if (
    result.signalState === "RISK_APPROVED" ||
    result.signalState === "TRIGGERED" ||
    result.triggerState === "CONFIRMED"
  ) {
    const levels = levelsSummary(result);
    return levels
      ? "Trigger confirmed. Awaiting execution. " + levels
      : "Trigger confirmed. Awaiting risk and execution confirmation.";
  }
  if (result.signalState === "ARMED" || result.setupState === "ARMED") {
    return armedNarrative(result, pipSize);
  }
  if (
    result.setupState === "SETUP" ||
    result.signalState === "SETUP" ||
    result.setupState === "WATCH" ||
    result.signalState === "WATCH"
  ) {
    return watchingNarrative(result, pipSize);
  }
  return workstationStatus(result).detail;
}

function biasReasons(result: SymbolScanResult): string[] {
  return result.evidence
    .filter((item) => item.code.startsWith("BIAS_"))
    .map((item) => item.description)
    .filter((text) => text.length > 0);
}

function signedScore(score: number): string {
  const rounded = Math.round(score);
  return rounded > 0 ? "+" + rounded : String(rounded);
}

export function SignalNarrative({ result }: { result: SymbolScanResult }) {
  const stages = workstationStages(result);
  const narrative = heroNarrative(result, pipSizeFor(result.symbol));
  const reasons = biasReasons(result);
  const biasLabel = result.bias ? result.bias.replace(/_/g, " ") : null;
  const biasScore = result.biasScore;

  return (
    <>
      <section
        aria-label="Signal pipeline and status"
        className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-3"
      >
        <div className="grid grid-cols-5 gap-1">
          {stages.map((stage) => (
            <div key={stage.label} className="min-w-0">
              <div
                className={cn(
                  "h-1 rounded-full",
                  stage.state === "done" && "bg-emerald-500/70",
                  stage.state === "current" && "bg-amber-500/70",
                  stage.state === "blocked" && "bg-red-500/70",
                  stage.state === "pending" && "bg-zinc-800"
                )}
              />
              <div
                className={cn(
                  "mt-1.5 truncate text-[11px]",
                  stage.state === "done" && "text-emerald-300",
                  stage.state === "current" && "text-amber-300",
                  stage.state === "blocked" && "text-red-300",
                  stage.state === "pending" && "text-zinc-600"
                )}
              >
                {stageGlyph(stage)} {stage.label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">{narrative}</p>
      </section>

      {biasLabel && biasScore !== null && (
        <section
          aria-labelledby="narrative-bias-title"
          className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3
              id="narrative-bias-title"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400"
            >
              Bias {"\u2014"} {biasLabel}
            </h3>
            <span className="font-mono text-xs tabular-nums text-zinc-300">
              {signedScore(biasScore)}
            </span>
          </div>
          {reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-zinc-400">
              {reasons.map((reason, index) => (
                <li key={index} className="flex gap-2">
                  <span aria-hidden="true" className="text-zinc-600">
                    {"\u2022"}
                  </span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}