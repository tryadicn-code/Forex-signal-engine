"use client";

import { BrokerExecutionPanel } from "@/components/broker/broker-execution-panel";
import { ForwardValidationPanel } from "@/components/forward-validation/forward-validation-panel";
import { ProductionHealthPanel } from "@/components/production/production-health-panel";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { TransitionHistory } from "@/components/signals/transition-history";
import { SystemSignalFunnel } from "@/components/system/system-signal-funnel";
import type { BrokerExecutionDashboard } from "@/broker/types";
import type { DashboardData } from "@/types/dashboard";

const SECTION_LINKS = [
  { id: "system-strategy", label: "Strategy" },
  { id: "system-funnel", label: "Funnel" },
  { id: "system-operations", label: "Operations" },
  { id: "system-validation", label: "Validation" },
];

function scrollToSection(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function SystemWorkspace({
  data,
  broker,
}: {
  data: DashboardData;
  broker: BrokerExecutionDashboard;
}) {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-4 lg:p-5">
      <header className="mb-1">
        <p className="text-xs font-medium text-sky-300">System</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
          Health, safety & diagnostics
        </h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500 sm:text-sm">
          Operational infrastructure is separated from the trading workspace so system detail stays available without competing with market decisions.
        </p>
      </header>

      <nav
        aria-label="System sections"
        className="sticky top-14 z-20 -mx-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {SECTION_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToSection(link.id)}
              className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
            >
              {link.label}
            </button>
          ))}
        </div>
      </nav>

      <section id="system-strategy" className="scroll-mt-28 space-y-4">
        {data.releaseRuntime && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/25 p-4">
            <h2 className="text-sm font-semibold text-zinc-100">
              Strategy runtime
            </h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              <Fact label="Status" value={data.releaseRuntime.status} />
              <Fact
                label="Version"
                value={data.releaseRuntime.version ?? "UNVERSIONED"}
              />
              <Fact
                label="Pinned"
                value={data.releaseRuntime.pinned ? "YES" : "NO"}
              />
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              {data.releaseRuntime.message}
            </p>
          </div>
        )}

        <ProductionHealthPanel />
      </section>

      <section id="system-funnel" className="scroll-mt-28 space-y-4">
        <SystemSignalFunnel
          analytics={data.signalFunnel}
          persistenceError={data.signalFunnelError}
        />

        <details className="rounded-lg border border-zinc-800 bg-zinc-900/25">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-200">
            <span className="flex items-center justify-between">
              Recent signal transitions
              <span aria-hidden="true" className="text-zinc-600">
                {"\u203A"}
              </span>
            </span>
          </summary>
          <div className="border-t border-zinc-800 p-4">
            <TransitionHistory
              transitions={data.recentTransitions}
              emptyLabel="No state transitions have been recorded yet."
            />
          </div>
        </details>
      </section>

      <section id="system-operations" className="scroll-mt-28 space-y-4">
        <BrokerExecutionPanel broker={broker} />
        <NotificationPanel notifications={data.notifications} />
      </section>

      <section id="system-validation" className="scroll-mt-28 space-y-4">
        <ForwardValidationPanel />
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0e14] px-3 py-2.5">
      <dt className="text-[11px] text-zinc-600">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-zinc-200">{value}</dd>
    </div>
  );
}