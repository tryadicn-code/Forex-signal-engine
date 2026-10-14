"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { EditablePaperConfig } from "@/core/config/paper-config";
import type { IntrabarConflictPolicy } from "@/config/paper";

interface Payload {
  version: number;
  updatedAt: number;
  config: EditablePaperConfig;
  usedDefault: boolean;
}

const CONFLICT_POLICIES: IntrabarConflictPolicy[] = [
  "STOP_FIRST",
  "TARGET_FIRST",
  "REJECT_AMBIGUOUS",
];

function isPayload(v: unknown): v is Payload {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Payload>;
  return typeof p.version === "number" && !!p.config && typeof p.config === "object";
}

export function PaperConfigPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<EditablePaperConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<unknown>("/api/paper-config", { cache: "no-store", requireSecret: false })
      .then((payload) => {
        if (cancelled) return;
        if (!isPayload(payload)) {
          setError("Invalid paper config response.");
          return;
        }
        setData(payload);
        setDraft(payload.config);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setNum = (key: keyof EditablePaperConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    const n = Number(e.target.value);
    setDraft({ ...draft, [key]: n } as EditablePaperConfig);
  };

  const dirty =
    data !== null && draft !== null && JSON.stringify(draft) !== JSON.stringify(data.config);

  const apply = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/paper-config", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      setSavedAt(Date.now());
      const refreshed = await apiFetch<unknown>("/api/paper-config", {
        cache: "no-store",
        requireSecret: false,
      });
      if (isPayload(refreshed)) {
        setData(refreshed);
        setDraft(refreshed.config);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (data) setDraft(data.config);
    setError(null);
  };

  const numField = (key: keyof EditablePaperConfig, label: string, min: number, max: number) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-zinc-400">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft ? (draft[key] as number) : 0}
        onChange={setNum(key)}
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
      />
    </label>
  );

  return (
    <section
      aria-labelledby="paper-config-title"
      className="rounded-lg border border-zinc-800 bg-zinc-900/25"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 sm:px-4">
        <h2 id="paper-config-title" className="text-[15px] font-semibold leading-tight text-zinc-100 sm:text-base">
          Paper Config
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          {savedAt !== null && <span className="text-emerald-400">Tersimpan.</span>}
          {data?.usedDefault && (
            <span className="rounded border border-amber-900/50 bg-amber-950/20 px-2 py-0.5 text-amber-300">
              Default
            </span>
          )}
        </div>
      </header>

      <div className="p-3 sm:p-4">
        {error && (
          <div role="alert" className="mb-2 rounded border border-red-900/60 bg-red-950/20 px-2 py-1.5 text-xs text-red-200">
            {error}
          </div>
        )}

        {draft === null && !error && <div className="text-xs text-zinc-500">Loading paper config...</div>}

        {draft !== null && (
          <>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {numField("maxOpenPositions", "Max open positions", 1, 50)}
              {numField("maxOpenPositionsPerSymbol", "Max per symbol", 1, 20)}
              {numField("maxTotalOpenRiskPercent", "Max total risk %", 1, 100)}
              {numField("maxDirectionalCurrencyExposure", "Max directional", 1, 10)}
              {numField("stopLossReentryCooldownMinutes", "SL cooldown (min)", 0, 1440)}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-0.5 text-[11px] text-zinc-400">
                <span>Intrabar conflict</span>
                <select
                  value={draft.intrabarConflictPolicy}
                  onChange={(e) => setDraft({ ...draft, intrabarConflictPolicy: e.target.value as IntrabarConflictPolicy })}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                >
                  {CONFLICT_POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>

              <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                <input type="checkbox" checked={draft.allowDelayed} onChange={(e) => setDraft({ ...draft, allowDelayed: e.target.checked })} className="h-3.5 w-3.5 accent-emerald-500" />
                Allow DELAYED market data
              </label>

              <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                <input type="checkbox" checked={draft.autoScanEnabled} onChange={(e) => setDraft({ ...draft, autoScanEnabled: e.target.checked })} className="h-3.5 w-3.5 accent-emerald-500" />
                Auto-scan enabled
              </label>
            </div>

            {(draft.maxOpenPositions > 20 || draft.maxTotalOpenRiskPercent > 20) && (
              <div className="mt-3 rounded border border-amber-900/50 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-200">
                Warning: nilai ekstrem terdeteksi. Pastikan ini disengaja.
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-[11px] text-zinc-500">
                Perubahan diterapkan pada scan cycle berikutnya.
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={reset} disabled={!dirty || busy} className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 disabled:opacity-40">Reset</button>
                <button type="button" onClick={apply} disabled={!dirty || busy} className="rounded border border-emerald-700 bg-emerald-900/30 px-2.5 py-1 text-[11px] font-medium text-emerald-200 disabled:opacity-40">
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