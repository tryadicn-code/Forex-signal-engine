import { systemConfig } from "@/config/system";
import { cn } from "@/lib/utils";

/**
 * Placeholder system-status panel.
 *
 * Deliberately minimal: professional dashboard UI arrives in Phase 3. This only
 * proves that config -> UI wiring works and the app boots.
 */
const rows = [
  { label: "System Status", value: systemConfig.status },
  { label: "Core Engine", value: systemConfig.coreEngine },
  { label: "Market Scanner", value: systemConfig.marketScanner },
  { label: "Execution Mode", value: systemConfig.executionMode },
] as const;

export function SystemStatusPanel() {
  return (
    <section
      aria-label="System status"
      className="w-full max-w-md rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h1 className="text-center text-xl font-bold tracking-tight sm:text-2xl">
        FOREX SIGNAL ENGINE
      </h1>
      <dl className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 py-3 text-sm"
          >
            <dt className="text-zinc-600 dark:text-zinc-400">{row.label}:</dt>
            <dd
              className={cn(
                "font-mono font-medium",
                row.value === "SIGNAL ONLY" && "text-amber-600 dark:text-amber-400"
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
