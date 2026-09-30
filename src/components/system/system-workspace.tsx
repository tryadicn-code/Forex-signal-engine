import { BrokerExecutionPanel } from "@/components/broker/broker-execution-panel";
import { ForwardValidationPanel } from "@/components/forward-validation/forward-validation-panel";
import { ProductionHealthPanel } from "@/components/production/production-health-panel";
import { TransitionHistory } from "@/components/signals/transition-history";
import type { DashboardData } from "@/types/dashboard";

export function SystemWorkspace({ data }: { data: DashboardData }) {
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

      {data.releaseRuntime && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/25 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Strategy runtime</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            <Fact label="Status" value={data.releaseRuntime.status} />
            <Fact label="Version" value={data.releaseRuntime.version ?? "UNVERSIONED"} />
            <Fact label="Pinned" value={data.releaseRuntime.pinned ? "YES" : "NO"} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {data.releaseRuntime.message}
          </p>
        </section>
      )}

      <ProductionHealthPanel />
      <BrokerExecutionPanel broker={data.broker} />
      <ForwardValidationPanel />

      <details className="rounded-lg border border-zinc-800 bg-zinc-900/25">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-200">
          <span className="flex items-center justify-between">
            Recent signal transitions
            <span aria-hidden="true" className="text-zinc-600">›</span>
          </span>
        </summary>
        <div className="border-t border-zinc-800 p-4">
          <TransitionHistory
            transitions={data.recentTransitions}
            emptyLabel="No state transitions have been recorded yet."
          />
        </div>
      </details>
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
