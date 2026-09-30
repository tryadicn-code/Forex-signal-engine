"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductionHealthSnapshot } from "@/production/health-types";

export function ProductionHealthPanel() {
  const [health, setHealth] = useState<ProductionHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/system/health", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | ProductionHealthSnapshot
        | { error?: string };
      if (
        !("protocol" in payload) ||
        payload.protocol !== "phase-11-health-v1"
      ) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Production health payload is invalid."
        );
      }
      setHealth(payload);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const warnings =
    health?.checks.filter((item) => item.status !== "PASS") ?? [];
  const persistenceIssues =
    health?.persistence.filter(
      (item) => item.state !== "VERIFIED" && item.state !== "MISSING"
    ) ?? [];

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-violet-400/80">
            Phase 11 · Production Health
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Alerts, execution safety & infrastructure
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Alerts, broker safety, shared state and deployment readiness.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-violet-800 hover:text-violet-300 disabled:opacity-40"
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="border-b border-red-900/60 bg-red-950/20 px-3 py-2 text-[9px] text-red-300">
          {error}
        </div>
      )}

      {!health ? (
        <div className="px-3 py-5 text-center text-[10px] text-zinc-700">
          Reading production health…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-8">
            <Fact label="Readiness" value={health.readiness} tone={health.readiness} />
            <Fact label="Execution" value={health.executionMode} />
            <Fact label="Broker" value={health.broker.providerId.toUpperCase()} />
            <Fact label="Infra" value={health.infrastructure.mode} />
            <Fact label="Provider" value={health.providerId.toUpperCase()} />
            <Fact label="Provider state" value={health.provider.state} />
            <Fact
              label="Strategy"
              value={health.releaseRuntime.version ?? health.releaseRuntime.status}
            />
            <Fact
              label="Uptime"
              value={formatUptime(health.uptimeSeconds)}
            />
          </div>

          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="space-y-1.5">
              {health.checks.map((check) => (
                <div
                  key={check.id}
                  className="grid gap-1 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 sm:grid-cols-[80px_minmax(0,1fr)] sm:items-center"
                >
                  <span
                    className={
                      "w-fit rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold " +
                      checkTone(check.status)
                    }
                  >
                    {check.status}
                  </span>
                  <span className="text-[9px] leading-relaxed text-zinc-500">
                    {check.message}
                  </span>
                </div>
              ))}
            </div>

            <aside className="space-y-2">
              <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
                <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Safety
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <Fact
                    label="Maintenance"
                    value={health.safety.maintenanceMode ? "ON" : "OFF"}
                  />
                  <Fact
                    label="Active required"
                    value={health.safety.requireActiveRelease ? "YES" : "NO"}
                  />
                  <Fact
                    label="Live data required"
                    value={health.safety.requireLiveMarketData ? "YES" : "NO"}
                  />
                  <Fact
                    label="Startup recovery"
                    value={health.startupRecovery.blocking ? "BLOCKED" : "OK"}
                  />
                  <Fact
                    label="Shared required"
                    value={
                      health.safety.requireSharedTransactionalStore
                        ? "YES"
                        : "NO"
                    }
                  />
                  <Fact
                    label="TX latency"
                    value={
                      health.infrastructure.transactional
                        ? health.infrastructure.transactional.latencyMs + "ms"
                        : "LOCAL"
                    }
                  />
                  <Fact
                    label="Env stop"
                    value={
                      health.safety.liveEmergencyStop
                        ? "ENGAGED"
                        : "OPEN"
                    }
                  />
                  <Fact
                    label="Kill switch"
                    value={
                      health.broker.controls.killSwitchEngaged
                        ? "ENGAGED"
                        : "OPEN"
                    }
                  />
                  <Fact
                    label="Live arm"
                    value={
                      health.broker.controls.liveArm
                        ? health.broker.controls.liveArm.remainingOrders + " LEFT"
                        : "NONE"
                    }
                  />
                  <Fact
                    label="Reconcile"
                    value={String(health.broker.unresolvedCount)}
                  />
                  <Fact
                    label="Alerts"
                    value={health.notifications.enabled ? "ON" : "OFF"}
                  />
                  <Fact
                    label="Alert fail"
                    value={String(health.notifications.failedDeliveries)}
                  />
                </dl>
              </section>

              <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
                <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Persistence
                </h3>
                <div className="mt-2 text-[9px] text-zinc-600">
                  {health.persistence.length} inspected · {persistenceIssues.length} attention
                </div>
                {persistenceIssues.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {persistenceIssues.slice(0, 4).map((item) => (
                      <div
                        key={item.path}
                        className="truncate font-mono text-[8px] text-amber-300/80"
                        title={item.path + " · " + item.message}
                      >
                        {item.state} · {basename(item.path)}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {warnings.length === 0 && (
                <p className="rounded border border-emerald-900/50 bg-emerald-950/15 px-3 py-2 text-[9px] leading-relaxed text-emerald-300/80">
                  No readiness warnings are currently reported.
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: ProductionHealthSnapshot["readiness"];
}) {
  const valueClass =
    tone === "READY"
      ? "text-emerald-300"
      : tone === "DEGRADED"
        ? "text-amber-300"
        : tone === "BLOCKED"
          ? "text-red-300"
          : "text-zinc-300";

  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className={"mt-0.5 truncate font-mono text-[9px] " + valueClass}>
        {value}
      </dd>
    </div>
  );
}

function checkTone(status: "PASS" | "WARN" | "FAIL"): string {
  if (status === "PASS") {
    return "border-emerald-900 bg-emerald-950/25 text-emerald-300";
  }
  if (status === "WARN") {
    return "border-amber-900 bg-amber-950/25 text-amber-300";
  }
  return "border-red-900 bg-red-950/25 text-red-300";
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  return Math.floor(seconds / 3600) + "h";
}

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").at(-1) ?? value;
}
