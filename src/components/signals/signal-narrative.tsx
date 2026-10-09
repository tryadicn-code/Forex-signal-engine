/**
 * Signal Detail narrative panel.
 *
 * Hero card: 5-stage progress bar plus the narrative of the currently
 * active stage (the first stage that is not done). The former Setup /
 * Trigger / Risk cards are folded into this single narrative so the
 * same information is shown once, immediately under the progress bar.
 *
 * Bias section is unchanged in structure. BOS / CHOCH / LH / LL / HH /
 * HL are expanded to full words and numeric strength gets a qualitative
 * label ("strength 75 (very strong)"). Expansion applies only to the
 * Bias section; Raw data keeps engine text verbatim for audit.
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
  type WorkstationStage,
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

function qualitativeStrength(strength: number): string {
  if (strength < 25) return "weak";
  if (strength < 50) return "moderate";
  if (strength < 75) return "strong";
  return "very strong";
}

const ABBREVIATIONS: Array<[string, string]> = [
  ["CHOCH", "change of character"],
  ["BOS", "break of structure"],
  ["LH", "lower high"],
  ["LL", "lower low"],
  ["HH", "higher high"],
  ["HL", "higher low"],
];

function expandBiasText(text: string): string {
  let out = text;
  for (const [abbr, full] of ABBREVIATIONS) {
    const re = new RegExp("\\b" + abbr + "\\b", "g");
    out = out.replace(re, full);
  }
  out = out.replace(/strength (\d+)/g, (_, raw) => {
    const num = parseInt(raw, 10);
    return "strength " + num + " (" + qualitativeStrength(num) + ")";
  });
  return out;
}

function biasReasons(result: SymbolScanResult): string[] {
  return result.evidence
    .filter((item) => item.code.startsWith("BIAS_"))
    .map((item) => expandBiasText(item.description))
    .filter((text) => text.length > 0);
}

function signedScore(score: number): string {
  const rounded = Math.round(score);
  return rounded > 0 ? "+" + rounded : String(rounded);
}

function formatSetupState(state: string): string {
  switch (state) {
    case "WATCH":
      return "FORMING";
    case "SETUP":
      return "APPROACHING";
    case "ARMED":
      return "ARMED";
    case "INVALIDATED":
      return "INVALIDATED";
    default:
      return state;
  }
}

type StageTone = "done" | "current" | "blocked" | "muted";

interface ActiveStageNarrative {
  title: string;
  stateDisplay: string;
  stateTone: StageTone;
  meta: string | null;
  body: string;
}

function toneClass(tone: StageTone): string {
  if (tone === "done") return "text-emerald-300";
  if (tone === "current") return "text-amber-300";
  if (tone === "blocked") return "text-red-300";
  return "text-zinc-500";
}

function setupBody(result: SymbolScanResult, state: string): string {
  const planned = result.plannedLevels ?? null;
  if (!planned) {
    return "Setup engine is watching for price to approach a demand or supply zone.";
  }
  const zoneName =
    planned.direction === "SHORT" ? "supply zone" : "demand zone";
  const zoneStr =
    formatPrice(result.symbol, planned.zoneLow) +
    " \u2013 " +
    formatPrice(result.symbol, planned.zoneHigh);
  const price = result.latestPrice;
  const pipSize = pipSizeFor(result.symbol);
  const inside =
    price !== null && price >= planned.zoneLow && price <= planned.zoneHigh;

  if (state === "ARMED") {
    return (
      "Price inside " + zoneName + " " + zoneStr + ". Awaiting trigger candle."
    );
  }
  if (state === "SETUP" && inside) {
    return (
      "Price inside " +
      zoneName +
      " " +
      zoneStr +
      ". Awaiting confirmation to arm (structural break, momentum, or volume)."
    );
  }
  let text = "Waiting for price to reach " + zoneName + " " + zoneStr + ".";
  if (price !== null && pipSize !== null && pipSize > 0) {
    const edge =
      price < planned.zoneLow ? planned.zoneLow : planned.zoneHigh;
    const distance = Math.round(Math.abs(edge - price) / pipSize);
    const rel = price < planned.zoneLow ? "below" : "above";
    text +=
      " Current price " +
      formatPrice(result.symbol, price) +
      " (" +
      distance +
      " pips " +
      rel +
      ").";
  }
  return text;
}

function biasStageNarrative(result: SymbolScanResult): ActiveStageNarrative {
  void result;
  return {
    title: "BIAS",
    stateDisplay: "ANALYZING",
    stateTone: "current",
    meta: null,
    body:
      "Bias engine is evaluating structure, trend, regime, and momentum.",
  };
}

function setupStageNarrative(
  result: SymbolScanResult
): ActiveStageNarrative | null {
  const state = result.setupState;
  if (state === null || state === "NONE") return null;
  let tone: StageTone = "current";
  if (state === "ARMED") tone = "done";
  else if (state === "INVALIDATED") tone = "blocked";
  const meta =
    result.setupScore !== null && Number.isFinite(result.setupScore)
      ? Math.round(result.setupScore) + " (min 60)"
      : null;
  return {
    title: "SETUP",
    stateDisplay: formatSetupState(state),
    stateTone: tone,
    meta,
    body: setupBody(result, state),
  };
}

function triggerStageNarrative(
  result: SymbolScanResult
): ActiveStageNarrative | null {
  const state = result.triggerState;
  if (state === null) return null;
  let tone: StageTone = "current";
  if (state === "CONFIRMED") tone = "done";
  else if (state === "INVALIDATED") tone = "blocked";
  const meta =
    result.triggerScore !== null && Number.isFinite(result.triggerScore)
      ? Math.round(result.triggerScore) + " (min 80)"
      : null;
  let body: string;
  if (state === "CONFIRMED") {
    body = "Trigger confirmed. Risk evaluation is next.";
  } else if (state === "INVALIDATED") {
    body = "Trigger invalidated. The setup no longer qualifies.";
  } else {
    body =
      "Awaiting a confirmation candle in the setup zone (structural break, momentum, or volume expansion).";
  }
  return {
    title: "TRIGGER",
    stateDisplay: state,
    stateTone: tone,
    meta,
    body,
  };
}

function riskStageNarrative(
  result: SymbolScanResult
): ActiveStageNarrative | null {
  const risk = result.riskDetail;
  if (!risk) {
    return {
      title: "RISK",
      stateDisplay: "PENDING",
      stateTone: "muted",
      meta: null,
      body: "Risk will be evaluated after the trigger confirms.",
    };
  }
  if (risk.approved) {
    const levels = levelsSummary(result);
    return {
      title: "RISK",
      stateDisplay: "APPROVED",
      stateTone: "done",
      meta: null,
      body: levels ? "Approved. " + levels : "Approved.",
    };
  }
  return {
    title: "RISK",
    stateDisplay: "REJECTED",
    stateTone: "blocked",
    meta: null,
    body: risk.rejectionReason
      ? "Rejected: " + risk.rejectionReason + "."
      : "Rejected by risk guard.",
  };
}

function executeStageNarrative(
  result: SymbolScanResult
): ActiveStageNarrative {
  const levels = levelsSummary(result);
  return {
    title: "EXECUTE",
    stateDisplay: "READY",
    stateTone: "done",
    meta: null,
    body: levels ? "All gates passed. " + levels : "All gates passed.",
  };
}

function blockedReason(result: SymbolScanResult): string | null {
  if (result.executionDetail?.triggeredVetoes.length) {
    return result.executionDetail.triggeredVetoes[0] ?? null;
  }
  if (result.riskDetail?.rejectionReason) {
    return result.riskDetail.rejectionReason;
  }
  return null;
}

function activeStageNarrative(
  result: SymbolScanResult,
  stages: WorkstationStage[]
): ActiveStageNarrative | null {
  const idx = stages.findIndex((s) => s.state !== "done");
  const targetIdx = idx === -1 ? stages.length - 1 : idx;
  const target = stages[targetIdx];

  let base: ActiveStageNarrative | null;
  switch (target.label) {
    case "Bias":
      base = biasStageNarrative(result);
      break;
    case "Setup":
      base = setupStageNarrative(result) ?? biasStageNarrative(result);
      break;
    case "Trigger":
      base =
        triggerStageNarrative(result) ??
        setupStageNarrative(result) ??
        biasStageNarrative(result);
      break;
    case "Risk":
      base =
        riskStageNarrative(result) ??
        triggerStageNarrative(result) ??
        biasStageNarrative(result);
      break;
    case "Execute":
      base = executeStageNarrative(result);
      break;
    default:
      base = null;
  }
  if (!base) return null;
  const isBlocked =
    result.executionDecision === "BLOCKED" || result.signalState === "BLOCKED";
  if (isBlocked) {
    const veto = blockedReason(result);
    if (veto && base.body.indexOf(veto) === -1) {
      base = {
        ...base,
        stateTone: "blocked",
        stateDisplay: "BLOCKED",
        body: "Blocked: " + veto + ". " + base.body,
      };
    }
  }
  return base;
}

export function SignalNarrative({ result }: { result: SymbolScanResult }) {
  const stages = workstationStages(result);
  const active = activeStageNarrative(result, stages);
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
        {active && (
          <div className="mt-3 border-t border-zinc-800/70 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {active.title} {"\u2014"}{" "}
                <span className={toneClass(active.stateTone)}>
                  {active.stateDisplay}
                </span>
              </span>
              {active.meta && (
                <span className="font-mono text-xs tabular-nums text-zinc-300">
                  {active.meta}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              {active.body}
            </p>
          </div>
        )}
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