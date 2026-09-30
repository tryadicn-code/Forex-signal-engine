"use client";

import { useEffect, useState } from "react";
import type {
  ForwardValidationReport,
  ForwardValidationSnapshot,
} from "@/forward-validation/types";

export function ForwardValidationPanel() {
  const [report, setReport] = useState<ForwardValidationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/forward-validation", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; report: ForwardValidationSnapshot }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Forward validation refresh failed." : payload.error
        );
      }
      setReport(payload.report);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      report.status === "NO_ACTIVE_RELEASE"
        ? "forward-validation.json"
        : report.release.version +
          "-" +
          report.release.activationAt +
          "-forward-validation.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      id="forward-validation"
      className="scroll-mt-16 rounded-md border border-zinc-800 bg-zinc-900/30"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Phase 7 · Forward Validation
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Runtime drift monitor
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Release-scoped Paper evidence vs the immutable historical validation reference.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {report && (
            <button
              type="button"
              onClick={exportReport}
              className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-cyan-800 hover:text-cyan-300"
            >
              Export JSON
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-cyan-800 hover:text-cyan-300 disabled:opacity-40"
          >
            {loading ? "Reading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900/60 bg-red-950/20 px-3 py-2 text-[9px] text-red-300">
          {error}
        </div>
      )}

      {!report ? (
        <div className="px-3 py-5 text-center text-[10px] text-zinc-700">
          Loading forward validation evidence…
        </div>
      ) : report.status === "NO_ACTIVE_RELEASE" ? (
        <div className="px-3 py-5 text-center">
          <div className="font-mono text-[10px] font-semibold text-amber-300">
            NO ACTIVE RELEASE
          </div>
          <p className="mx-auto mt-1 max-w-xl text-[9px] leading-relaxed text-zinc-600">
            {report.message}
          </p>
        </div>
      ) : (
        <ForwardReport report={report} />
      )}
    </section>
  );
}

function ForwardReport({ report }: { report: ForwardValidationReport }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-6">
        <Fact label="State" value={report.status} />
        <Fact label="Release" value={report.release.version} />
        <Fact label="Forward trades" value={String(report.sample.tradeCount)} />
        <Fact
          label="Window trades"
          value={String(report.monitoringWindow.tradeCount)}
        />
        <Fact
          label="Observations"
          value={String(report.operational.observationCount)}
        />
        <Fact
          label="Window obs"
          value={String(report.monitoringWindow.observationCount)}
        />
        <Fact
          label="Span"
          value={report.operational.calendarSpanDays.toFixed(1) + "d"}
        />
        <Fact
          label="Activation"
          value={shortUtc(report.release.activationAt)}
        />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="overflow-hidden rounded border border-zinc-800">
          {report.indicators.map((item) => (
            <div
              key={item.id}
              className="grid gap-1.5 border-t border-zinc-800 bg-zinc-950/35 px-3 py-2 first:border-t-0 sm:grid-cols-[125px_minmax(0,1fr)_140px] sm:items-center"
            >
              <span
                className={
                  "w-fit rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold " +
                  indicatorTone(item.status)
                }
              >
                {item.status}
              </span>
              <div>
                <div className="text-[9px] font-medium text-zinc-400">
                  {item.label}
                </div>
                <p className="mt-0.5 text-[8px] leading-relaxed text-zinc-700">
                  {item.detail}
                </p>
              </div>
              <div className="font-mono text-[8px] text-zinc-600">
                <div>FWD {formatValue(item.forwardValue, item.unit)}</div>
                {(item.referenceLow !== null ||
                  item.referenceHigh !== null) && (
                  <div className="mt-0.5">
                    REF{" "}
                    {item.referenceLow === null
                      ? "≤ "
                      : formatValue(item.referenceLow, item.unit) + " – "}
                    {item.referenceHigh === null
                      ? "—"
                      : formatValue(item.referenceHigh, item.unit)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-2">
          <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Evidence counts
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Fact
                label="Within ref"
                value={String(report.counts.withinReference)}
              />
              <Fact
                label="Outside ref"
                value={String(report.counts.outsideReference)}
              />
              <Fact
                label="Attention"
                value={String(report.counts.attention)}
              />
              <Fact
                label="Insufficient"
                value={String(report.counts.insufficient)}
              />
            </dl>
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Operational sample
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Fact
                label="Provider fail"
                value={
                  report.operational.providerFailureRatePercent.toFixed(2) + "%"
                }
              />
              <Fact
                label="Stale data"
                value={
                  report.operational.staleDataRatePercent.toFixed(2) + "%"
                }
              />
              <Fact
                label="Paper fills"
                value={String(report.operational.paperFilledCount)}
              />
              <Fact
                label="Paper rejects"
                value={String(report.operational.paperRejectedCount)}
              />
            </dl>
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-950/45 px-3 py-2">
            <div className="text-[8px] uppercase tracking-[0.08em] text-zinc-700">
              Manifest fingerprint
            </div>
            <div className="mt-1 break-all font-mono text-[8px] text-zinc-500">
              {report.release.manifestFingerprint}
            </div>
            <p className="mt-2 text-[8px] leading-relaxed text-zinc-700">
              Drift indicators use the recent monitoring window; cumulative forward metrics remain in the exported report. Phase 7 never changes parameters, promotes a version, or triggers rollback automatically.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[9px] text-zinc-300">
        {value}
      </dd>
    </div>
  );
}

function indicatorTone(status: string): string {
  if (status === "WITHIN_REFERENCE") {
    return "border-emerald-900 bg-emerald-950/25 text-emerald-300";
  }
  if (status === "OUTSIDE_REFERENCE" || status === "ATTENTION") {
    return "border-amber-900 bg-amber-950/25 text-amber-300";
  }
  if (status === "INSUFFICIENT_DATA") {
    return "border-sky-900 bg-sky-950/25 text-sky-300";
  }
  return "border-zinc-800 bg-zinc-950 text-zinc-500";
}

function formatValue(
  value: number | null,
  unit: "%" | "R" | "COUNT" | "RATIO"
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "%") return value.toFixed(2) + "%";
  if (unit === "R") return value.toFixed(2) + "R";
  if (unit === "COUNT") return String(Math.round(value));
  return value.toFixed(2);
}

function shortUtc(value: number): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + "Z";
}
