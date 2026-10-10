/**
 * Fase A prototype: Signal Detail hero card + progress bar + Bias section.
 *
 * Rendered directly above the existing SignalNarrative in
 * signal-detail-panel.tsx. The existing SignalNarrative remains untouched,
 * so its sections (planned cells, regime box, gates bar, active-stage
 * narrative, data-quality banner) still render below until Fase B/C/D.
 *
 * Copy: explanatory sentences are Bahasa Indonesia. Trading terms
 * (BIAS, SETUP, TRIGGER, RISK, EXECUTE) and engine states stay English.
 * Engine codes are never shown here; those live in Raw data.
 *
 * Source of truth: docs/UIUX-M-SIGNAL-DETAIL-NARRATIVE.md (Fase A).
 */

"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  stageGlyph,
  workstationStages,
  workstationStatus,
  type WorkstationStatus,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

function heroReason(status: WorkstationStatus): string {
  switch (status.headline) {
    case "Watching":
      return "Menunggu kondisi setup yang valid.";
    case "Setup forming":
      return "Setup mulai terbentuk, menunggu harga masuk zona.";
    case "Waiting for trigger":
      return "Harga di zona, menunggu konfirmasi trigger candle.";
    case "Trigger confirmed":
      return "Trigger terkonfirmasi, menunggu evaluasi risk.";
    case "Waiting for execution gate":
      return "Trigger dan risk terkonfirmasi, menunggu gate eksekusi.";
    case "Waiting for lifecycle":
      return "Engine siap eksekusi, menunggu lifecycle signal.";
    case "Ready":
      return "Semua gate lolos, sinyal siap dieksekusi.";
    case "Blocked":
      return "Ada gate eksekusi yang memblokir sinyal ini.";
    case "Setup invalidated":
      return "Setup tidak lagi valid.";
    case "Partial analysis":
      return "Beberapa timeframe tidak tersedia, eksekusi belum dievaluasi.";
    case "Data issue":
      return "Pair ini tidak bisa dianalisis karena masalah data.";
    case "Scanning":
      return "Belum ada setup yang terkonfirmasi.";
    default:
      return status.detail;
  }
}

function heroToneClass(status: WorkstationStatus): string {
  switch (status.tone) {
    case "ready":
      return "text-emerald-300";
    case "waiting":
      return "text-amber-300";
    case "blocked":
      return "text-red-300";
    case "invalid":
      return "text-zinc-500";
    default:
      return "text-zinc-300";
  }
}

const ABBREVIATIONS: Array<[string, string]> = [
  ["CHOCH", "change of character"],
  ["BOS", "break of structure"],
  ["LH", "lower high"],
  ["LL", "lower low"],
  ["HH", "higher high"],
  ["HL", "higher low"],
];

function qualitativeStrength(strength: number): string {
  if (strength < 25) return "weak";
  if (strength < 50) return "moderate";
  if (strength < 75) return "strong";
  return "very strong";
}

function expandBiasText(text: string): string {
  let out = text;
  for (const [abbr, full] of ABBREVIATIONS) {
    const re = new RegExp("\\b" + abbr + "\\b", "g");
    out = out.replace(re, full);
  }
  out = out.replace(/ at strength 0(?=[,.\s]|$)/g, "");
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

export function SignalHeroNarrative({ result }: { result: SymbolScanResult }) {
  const status = workstationStatus(result);
  const stages = workstationStages(result);
  const reasons = biasReasons(result);
  const biasLabel = result.bias ? result.bias.replace(/_/g, " ") : null;
  const biasScore = result.biasScore;

  return (
    <>
      <section
        aria-label="Signal status"
        className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-3"
      >
        <div
          className={cn(
            "font-mono text-sm font-semibold uppercase tracking-[0.12em]",
            heroToneClass(status)
          )}
        >
          {status.headline.toUpperCase()}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          {heroReason(status)}
        </p>
      </section>

      <section
        aria-label="Signal pipeline progress"
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
      </section>

      {biasLabel && biasScore !== null && (
        <section
          aria-labelledby="hero-narrative-bias-title"
          className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3
              id="hero-narrative-bias-title"
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