"use client";

import { useEffect, useMemo, useState } from "react";

interface ScannerUniversePayload {
  selected: string[];
  supported: string[];
  updatedAt: number | null;
}

function isScannerUniversePayload(
  value: unknown
): value is ScannerUniversePayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ScannerUniversePayload>;
  return (
    Array.isArray(candidate.selected) &&
    candidate.selected.every((item) => typeof item === "string") &&
    Array.isArray(candidate.supported) &&
    candidate.supported.every((item) => typeof item === "string") &&
    (candidate.updatedAt === null ||
      typeof candidate.updatedAt === "number" ||
      candidate.updatedAt === undefined)
  );
}

export function ScannerUniverseControl({
  onUniverseChanged,
}: {
  onUniverseChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ScannerUniversePayload | null>(null);
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(() => {
    if (
      !data ||
      !Array.isArray(data.supported) ||
      !Array.isArray(data.selected)
    ) {
      return [];
    }

    return data.supported.filter((item) => !data.selected.includes(item));
  }, [data]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);

    void fetch("/api/scanner/symbols", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load scanner pairs.");
        const payload = (await response.json()) as unknown;
        if (!isScannerUniversePayload(payload)) {
          throw new Error("Scanner pair response was invalid.");
        }
        return payload;
      })
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const mutate = async (action: "add" | "remove", target: string) => {
    if (busy) return;
    setBusy(target);
    setError(null);
    try {
      const response = await fetch("/api/scanner/symbols", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, symbol: target }),
      });
      const next = (await response.json()) as
        | ScannerUniversePayload
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in next && next.error ? next.error : "Pair update failed."
        );
      }
      if (!isScannerUniversePayload(next)) {
        throw new Error("Scanner pair update returned an invalid response.");
      }
      setData(next);
      setSymbol("");
      await onUniverseChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const normalized = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const canAdd =
    normalized.length === 6 &&
    Boolean(data?.supported.includes(normalized)) &&
    !data?.selected.includes(normalized);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        aria-label="Manage scanner pairs"
      >
        Pairs {data ? data.selected.length : "—"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Manage scanner pairs"
          className="fixed inset-0 z-[60] flex items-end bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-[#0b0e14] p-4 shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Scanner pairs
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  Add a supported FX pair to the live scanner universe.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-[10px] text-zinc-400"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                value={normalized}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="EURCHF"
                list="supported-scanner-pairs"
                aria-label="Add scanner pair"
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm uppercase text-zinc-100 outline-none focus:border-emerald-700"
              />
              <datalist id="supported-scanner-pairs">
                {available.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <button
                type="button"
                disabled={!canAdd || Boolean(busy)}
                onClick={() => void mutate("add", normalized)}
                className="rounded-md border border-emerald-800/70 bg-emerald-950/20 px-3 py-2 text-xs font-medium text-emerald-300 disabled:opacity-40"
              >
                {busy === normalized ? "Adding..." : "Add"}
              </button>
            </div>

            {data && normalized.length > 0 && !data.supported.includes(normalized) && (
              <p className="mt-2 text-[10px] text-amber-300">
                Pair belum tersedia di katalog aman scanner.
              </p>
            )}

            {error && (
              <p role="alert" className="mt-3 rounded-md border border-red-900/60 bg-red-950/20 px-3 py-2 text-[11px] text-red-200">
                {error}
              </p>
            )}

            <div className="mt-4 border-t border-zinc-800 pt-3">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Active universe
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data?.selected.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 pl-2 py-1 font-mono text-[10px] text-zinc-300"
                  >
                    {item}
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void mutate("remove", item)}
                      aria-label={"Remove " + item}
                      className="px-1.5 text-zinc-600 hover:text-red-300 disabled:opacity-40"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
                Pair dengan posisi paper terbuka tidak dapat dihapus sampai posisi ditutup.
                Pair tambahan memakai strategi dan threshold yang sama; validasi performanya
                sebelum digunakan untuk eksekusi live.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
