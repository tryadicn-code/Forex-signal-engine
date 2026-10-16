"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface StrategyConfigPayload {
  available: string[];
  enabledStrategies: string[];
  usedDefault: boolean;
  updatedAt: number;
}

function isPayload(value: unknown): value is StrategyConfigPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StrategyConfigPayload>;
  return (
    Array.isArray(v.available) &&
    v.available.every((s) => typeof s === "string") &&
    Array.isArray(v.enabledStrategies) &&
    v.enabledStrategies.every((s) => typeof s === "string") &&
    typeof v.usedDefault === "boolean" &&
    typeof v.updatedAt === "number"
  );
}

const LEGACY_STRATEGIES: readonly string[] = [
  "TREND_PULLBACK",
  "BREAKOUT_RETEST",
  "RANGE_MEAN_REVERSION",
  "REVERSAL",
];

function detectConflict(selected: string[]): string | null {
  const hasPriceAction = selected.includes("PRICE_ACTION");
  const legacySelected = selected.filter((s) => LEGACY_STRATEGIES.includes(s));
  if (hasPriceAction && legacySelected.length > 0) {
    return (
      "PRICE_ACTION cannot be combined with legacy strategies (" +
      legacySelected.join(", ") +
      "). Choose one paradigm."
    );
  }
  return null;
}

export function StrategySelector() {
  const [data, setData] = useState<StrategyConfigPayload | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<unknown>("/api/strategy-config", {
      cache: "no-store",
      requireSecret: false,
    })
      .then((payload) => {
        if (cancelled) return;
        if (!isPayload(payload)) {
          setError("Invalid strategy config response.");
          return;
        }
        setData(payload);
        setDraft(payload.enabledStrategies);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const toggle = (id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const dirty =
    data !== null &&
    (draft.length !== data.enabledStrategies.length ||
      draft.some((id) => !data.enabledStrategies.includes(id)));
  const conflict = detectConflict(draft);

  const apply = async () => {
    if (busy || !data) return;
    if (draft.length === 0) {
      setError("Minimal 1 strategy harus aktif.");
      return;
    }
    if (conflict !== null) {
      setError(conflict);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/strategy-config", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledStrategies: draft }),
      });
      setSavedAt(Date.now());
      setReloadKey((k) => k + 1);
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.message);
      else setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (data) setDraft(data.enabledStrategies);
    setError(null);
  };

  return (
    <section
      aria-labelledby="strategy-selector-title"
      className="rounded-lg border border-zinc-800 bg-zinc-900/25"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 sm:px-4">
        <h2
          id="strategy-selector-title"
          className="text-[15px] font-semibold leading-tight text-zinc-100 sm:text-base"
        >
          Trading Strategy
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          {savedAt !== null && (
            <span className="text-emerald-400">
              Tersimpan. Aktif pada scan berikutnya.
            </span>
          )}
          {data?.usedDefault && (
            <span className="rounded border border-amber-900/50 bg-amber-950/20 px-2 py-0.5 text-amber-300">
              Default
            </span>
          )}
        </div>
      </header>

      <div className="p-3 sm:p-4">
        {error && (
          <div
            role="alert"
            className="mb-2 rounded border border-red-900/60 bg-red-950/20 px-2 py-1.5 text-xs text-red-200"
          >
            {error}
          </div>
        )}

        {conflict && (
          <div
            role="alert"
            className="mb-2 rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-200"
          >
            <strong className="text-amber-300">{"\u26A0 "}Conflict:</strong>{" "}
            {conflict}
          </div>
        )}

        {data === null && !error && (
          <div className="text-xs text-zinc-500">Loading strategy config...</div>
        )}

        {data !== null && (
          <>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {data.available.map((id) => (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700">
                    <input
                      type="checkbox"
                      checked={draft.includes(id)}
                      onChange={() => toggle(id)}
                      className="h-3.5 w-3.5 accent-emerald-500"
                    />
                    <span className="font-mono">{id}</span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-[11px] text-zinc-500">
                Perubahan diterapkan pada auto-scan cycle berikutnya.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  disabled={!dirty || busy}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 disabled:opacity-40"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={!dirty || busy || draft.length === 0 || conflict !== null}
                  className="rounded border border-emerald-700 bg-emerald-900/30 px-2.5 py-1 text-[11px] font-medium text-emerald-200 disabled:opacity-40"
                >
                  {busy ? "Menyimpan..." : "Apply"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
