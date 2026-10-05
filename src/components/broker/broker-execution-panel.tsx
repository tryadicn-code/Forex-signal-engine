"use client";

import type { BrokerExecutionDashboard } from "@/broker/types";

export function BrokerExecutionPanel({
  broker,
}: {
  broker?: BrokerExecutionDashboard;
}) {
  if (!broker) return null;

  const arm = broker.controls.liveArm;
  const recent = broker.recentRecords.slice(0, 8);

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-red-400/80">
            Broker Safety
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            {broker.mode} · {broker.providerId.toUpperCase()}
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Read-only execution status. Live approval controls stay server-side.
          </p>
        </div>
        <span
          className={
            "rounded border px-2 py-1 font-mono text-[11px] font-semibold " +
            (broker.mode === "LIVE"
              ? broker.liveReady
                ? "border-red-800 bg-red-950/25 text-red-300"
                : "border-amber-800 bg-amber-950/20 text-amber-300"
              : broker.mode === "SHADOW"
                ? "border-violet-800 bg-violet-950/20 text-violet-300"
                : "border-zinc-700 text-zinc-500")
          }
        >
          {broker.mode === "LIVE"
            ? broker.liveReady
              ? "LIVE READY"
              : "LIVE BLOCKED"
            : broker.mode}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-8">
        <Fact label="Broker" value={broker.brokerStatus.connected ? "CONNECTED" : "OFFLINE"} />
        <Fact label="Trade allowed" value={broker.brokerStatus.tradeAllowed ? "YES" : "NO"} />
        <Fact label="Kill switch" value={broker.controls.killSwitchEngaged ? "ENGAGED" : "OPEN"} />
        <Fact label="Arm" value={arm ? "ACTIVE" : "NONE"} />
        <Fact label="Arm quota" value={arm ? String(arm.remainingOrders) : "0"} />
        <Fact label="Open pos." value={String(broker.openPositions.length)} />
        <Fact label="Unresolved" value={String(broker.unresolvedCount)} />
        <Fact
          label="Equity"
          value={
            broker.brokerStatus.equity == null
              ? "—"
              : formatMoney(
                  broker.brokerStatus.equity,
                  broker.brokerStatus.accountCurrency
                )
          }
        />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Recent execution records
          </h3>
          {recent.length === 0 ? (
            <p className="mt-2 rounded border border-zinc-800 bg-zinc-950/45 px-3 py-3 text-[9px] text-zinc-600">
              No execution record has been created.
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {recent.map((record) => (
                <div
                  key={record.id}
                  className="grid gap-1 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 sm:grid-cols-[92px_72px_minmax(0,1fr)] sm:items-center"
                >
                  <span className={"font-mono text-[11px] " + statusTone(record.status)}>
                    {record.status}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {record.symbol} {record.side}
                  </span>
                  <span className="truncate text-[9px] text-zinc-600" title={record.message}>
                    {record.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-2">
          <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Live blockers
            </h3>
            {broker.liveBlockers.length === 0 ? (
              <p className="mt-2 text-[9px] leading-relaxed text-red-300">
                No live safety blocker is currently reported.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-[9px] leading-relaxed text-amber-300/80">
                {broker.liveBlockers.slice(0, 8).map((blocker) => (
                  <li key={blocker}>• {blocker}</li>
                ))}
              </ul>
            )}
          </section>

          {arm && (
            <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
              <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Active approval
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <Fact label="Approved by" value={arm.approvedBy} />
                <Fact label="Orders left" value={String(arm.remainingOrders)} />
                <Fact label="Arm ID" value={arm.armId} />
                <Fact label="Expires" value={formatTime(arm.expiresAt)} />
              </dl>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[9px] text-zinc-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

function statusTone(status: string): string {
  if (status.includes("ACCEPTED") || status === "RECONCILED") {
    return "text-emerald-300";
  }
  if (status.includes("REJECTED")) return "text-amber-300";
  if (status === "RECONCILIATION_REQUIRED") return "text-red-300";
  return "text-zinc-400";
}

function formatMoney(value: number, currency: string | null): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  }) + (currency ? " " + currency : "");
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
