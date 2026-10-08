/**
 * Signal Detail narrative panel.
 *
 * Fase A prototype of the narrative redesign (see
 * docs/UIUX-M-SIGNAL-DETAIL-NARRATIVE.md). Renders the hero status card
 * and the Bias section from data already present on SymbolScanResult.
 * Fase B adds Setup / Trigger / Risk. Fase C moves the technical sections
 * below into a collapsed "Raw data" group.
 *
 * All copy is English. Engine codes and descriptions are shown as-is; the
 * UI never computes or re-weights anything.
 */

"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";

function deriveHeroState(result: SymbolScanResult): string {
  if (result.signalState === "INVALIDATED") return "INVALIDATED";
  if (result.signalState === "CLOSED") return "CLOSED";
  if (result.signalState === "EXECUTE") return "EXECUTED";
  if (result.executionDecision === "BLOCKED") return "BLOCKED";
  if (result.signalState === "RISK_APPROVED") return "READY";
  if (result.signalState === "TRIGGERED") return "READY";
  if (result.signalState === "ARMED") return "ARMED";
  if (result.signalState === "SETUP") return "WATCHING";
  if (result.signalState === "WATCH") return "WATCHING";
  if (result.signalState === "DISCOVERED") return "MONITORING";
  return "MONITORING";
}

function deriveHeroReason(result: SymbolScanResult): string {
  if (result.signalState === "CLOSED") return "Signal lifecycle ended.";
  if (result.signalState === "INVALIDATED") return "Signal invalidated by the engine.";
  if (result.signalState === "EXECUTE") return "Signal executed.";
  if (result.executionDecision === "BLOCKED") {
    const veto = result.executionDetail?.triggeredVetoes?.[0];
    return veto
      ? "Execution blocked: " + veto + "."
      : "Execution blocked by engine gate.";
  }
  if (result.signalState === "RISK_APPROVED") return "Risk approved, awaiting execution.";
  if (result.signalState === "TRIGGERED") return "Trigger confirmed, awaiting risk check.";
  if (result.signalState === "ARMED") return "Price in setup zone, awaiting trigger.";
  if (result.signalState === "SETUP") return "Setup formed, awaiting price entry.";
  if (result.signalState === "WATCH") return "Watching for a valid setup.";
  return "Monitoring for a valid setup.";
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
  const heroState = deriveHeroState(result);
  const heroReason = deriveHeroReason(result);
  const reasons = biasReasons(result);
  const biasLabel = result.bias ? result.bias.replace(/_/g, " ") : null;
  const biasScore = result.biasScore;

  return (
    <>
      <section
        aria-label="Signal status"
        className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-3"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Status
        </div>
        <div className="mt-1 text-base font-semibold tracking-wide text-zinc-100">
          {heroState}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{heroReason}</p>
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