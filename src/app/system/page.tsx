import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SystemWorkspace } from "@/components/system/system-workspace";
import { readDashboard } from "@/server/scanner-access";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const data = await readDashboard();

  return (
    <DashboardShell
      providerId={data.providerId}
      liveMarketData={data.liveMarketData}
      providerState={data.health?.providerStatus?.state ?? null}
      releaseLabel={
        data.releaseRuntime?.status === "ACTIVE"
          ? "STRAT · " + data.releaseRuntime.version
          : data.releaseRuntime?.status === "BLOCKED"
            ? "STRAT · BLOCKED"
            : "STRAT · UNVERSIONED"
      }
      releaseBlocked={data.releaseRuntime?.status === "BLOCKED"}
    >
      <SystemWorkspace data={data} />
    </DashboardShell>
  );
}
