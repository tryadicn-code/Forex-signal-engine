"use client";

import type { NotificationDashboard } from "@/notifications/types";

export function NotificationPanel({
  notifications,
}: {
  notifications?: NotificationDashboard;
}) {
  if (!notifications) return null;

  const channelSummary = notifications.channels
    .filter((item) => item.enabled)
    .map((item) =>
      item.channel.toUpperCase() +
      (item.configured ? " READY" : " MISCONFIGURED")
    );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-400/80">
            Phase 11 · Realtime Alerts
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Signal notification center
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Near-execute and lifecycle alerts are read-only consumers of engine output.
          </p>
        </div>
        <span
          className={
            "rounded border px-2 py-1 font-mono text-[11px] font-semibold " +
            (notifications.enabled
              ? "border-sky-800 bg-sky-950/20 text-sky-300"
              : "border-zinc-700 text-zinc-500")
          }
        >
          {notifications.enabled ? "ENABLED" : "OFF"}
        </span>
      </header>

      {notifications.error && (
        <div className="border-b border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-300">
          Notification state warning: {notifications.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-8">
        <Fact
          label="Channels"
          value={
            channelSummary.length > 0
              ? channelSummary.join(" · ")
              : "NONE"
          }
        />
        <Fact
          label="Pending"
          value={String(notifications.pendingDeliveries)}
        />
        <Fact
          label="Failed"
          value={String(notifications.failedDeliveries)}
        />
        <Fact
          label="Sent"
          value={String(notifications.sentDeliveries)}
        />
        <Fact
          label="Bias ≥"
          value={String(notifications.nearExecuteThresholds.biasScore)}
        />
        <Fact
          label="Setup ≥"
          value={String(notifications.nearExecuteThresholds.setupScore)}
        />
        <Fact
          label="Trigger ≥"
          value={String(notifications.nearExecuteThresholds.triggerScore)}
        />
        <Fact
          label="RR ≥"
          value={notifications.nearExecuteThresholds.minRiskReward.toFixed(2)}
        />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Recent alerts
          </h3>
          {notifications.recentEvents.length === 0 ? (
            <p className="mt-2 rounded border border-zinc-800 bg-zinc-950/45 px-3 py-3 text-[11px] text-zinc-600">
              No alert event has been recorded yet.
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {notifications.recentEvents.slice(0, 10).map((event) => (
                <div
                  key={event.id}
                  className="grid gap-1 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 sm:grid-cols-[105px_92px_minmax(0,1fr)] sm:items-center"
                >
                  <span className={"font-mono text-[11px] " + stateTone(event.state)}>
                    {event.state}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {event.symbol} {event.direction}
                  </span>
                  <span className="truncate text-[11px] text-zinc-600" title={event.message}>
                    {event.status} · {event.sentChannels.join(", ") || "not sent"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-2">
          {notifications.channels.map((channel) => (
            <section
              key={channel.channel}
              className="rounded border border-zinc-800 bg-zinc-950/45 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  {channel.channel}
                </h3>
                <span
                  className={
                    "font-mono text-[11px] " +
                    (!channel.enabled
                      ? "text-zinc-600"
                      : channel.configured
                        ? "text-emerald-300"
                        : "text-amber-300")
                  }
                >
                  {!channel.enabled
                    ? "OFF"
                    : channel.configured
                      ? "READY"
                      : "SETUP"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                {channel.message}
              </p>
            </section>
          ))}
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
      <dd className="mt-0.5 truncate font-mono text-[11px] text-zinc-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

function stateTone(state: string): string {
  if (state === "EXECUTE_READY") return "text-red-300";
  if (state === "NEAR_EXECUTE") return "text-amber-300";
  if (state === "INVALIDATED" || state === "BLOCKED") {
    return "text-zinc-400";
  }
  return "text-sky-300";
}
