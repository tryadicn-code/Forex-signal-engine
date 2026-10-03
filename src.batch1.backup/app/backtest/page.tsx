import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BacktestWorkspace } from "@/components/backtest/backtest-workspace";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  return (
    <DashboardShell statusLabel="HISTORICAL · BACKTEST">
      <BacktestWorkspace />
    </DashboardShell>
  );
}
