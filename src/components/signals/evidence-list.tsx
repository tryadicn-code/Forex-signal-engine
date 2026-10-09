/**
 * Engine evidence list.
 *
 * Renders the structured evidence the engines already returned. The UI never
 * generates an explanation and never re-weights anything: weights shown are the
 * engine's own values.
 *
 * Evidence is grouped by code family so long liquidity lists (Equal highs /
 * Equal lows) do not bury the higher-signal bias and structure evidence. Each
 * group shows its first three items by default, with a per-group "Show all"
 * toggle for the rest.
 */

"use client";

import { useState } from "react";
import type { Evidence } from "@/types/engine";
import { formatScore } from "@/lib/format";

const GROUP_LIMIT = 3;

interface EvidenceGroup {
  key: string;
  label: string;
  items: Evidence[];
}

function classify(code: string): { key: string; label: string } {
  if (code.startsWith("BIAS_") || code === "WEIGHTED_SUM") {
    return { key: "bias", label: "Bias components" };
  }
  if (
    code === "STRUCTURE_HH" ||
    code === "STRUCTURE_HL" ||
    code === "STRUCTURE_LH" ||
    code === "STRUCTURE_LL"
  ) {
    return { key: "structure-points", label: "Structure points" };
  }
  if (
    code === "BOS" ||
    code === "CHOCH" ||
    code === "BREAK_EVENTS" ||
    code === "SWING_COUNT"
  ) {
    return { key: "structure-events", label: "Structural events" };
  }
  if (code === "EQUAL_HIGH" || code === "EQUAL_LOW") {
    return { key: "liquidity", label: "Liquidity levels" };
  }
  return { key: "other", label: "Other evidence" };
}

function groupEvidence(evidence: Evidence[]): EvidenceGroup[] {
  const order: string[] = [];
  const map = new Map<string, EvidenceGroup>();
  for (const item of evidence) {
    const { key, label } = classify(item.code);
    let group = map.get(key);
    if (!group) {
      group = { key, label, items: [] };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(item);
  }
  return order.map((key) => map.get(key)!);
}

export function EvidenceList({
  evidence,
  emptyLabel = "No evidence recorded",
}: {
  evidence: Evidence[];
  emptyLabel?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (evidence.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  const groups = groupEvidence(evidence);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isExpanded = expanded.has(group.key);
        const visible = isExpanded ? group.items : group.items.slice(0, GROUP_LIMIT);
        const hasMore = group.items.length > GROUP_LIMIT;
        return (
          <div key={group.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                {group.label}
              </h4>
              <span className="font-mono text-[11px] text-zinc-600">
                {group.items.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {visible.map((item, index) => (
                <li
                  key={`${item.code}-${index}`}
                  className="flex gap-2 rounded border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-2"
                >
                  <span aria-hidden="true" className="mt-0.5 text-[11px] text-emerald-400">
                    +
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium text-zinc-200">{item.label}</span>
                      {item.weight !== undefined && (
                        <span
                          className="font-mono text-[11px] text-zinc-500"
                          title="Engine-assigned weight (0-100)"
                        >
                          w {formatScore(item.weight)}
                        </span>
                      )}
                      <code className="ml-auto hidden font-mono text-[11px] text-zinc-600 sm:inline">
                        {item.code}
                      </code>
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                        {item.description}
                      </p>
                    )}
                    {item.value !== undefined && (
                      <p className="mt-0.5 hidden font-mono text-[11px] text-zinc-400 sm:block">
                        {String(item.value)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="w-full rounded border border-zinc-800/70 bg-zinc-900/20 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                {isExpanded ? "Show less" : `Show all (${group.items.length})`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}