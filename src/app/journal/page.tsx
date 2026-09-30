import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { JournalWorkspace } from "@/components/paper/journal-workspace";
import { readDashboard } from "@/server/scanner-access";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const data = await readDashboard();

  return (
    <DashboardShell
      providerId={data.providerId}
      liveMarketData={data.liveMarketData}
      releaseLabel={
        data.releaseRuntime?.status === "ACTIVE"
          ? "STRAT · " + data.releaseRuntime.version
          : data.releaseRuntime?.status === "BLOCKED"
            ? "STRAT · BLOCKED"
            : "STRAT · UNVERSIONED"
      }
      releaseBlocked={data.releaseRuntime?.status === "BLOCKED"}
    >
      <JournalWorkspace initialPaper={data.paper} />
    </DashboardShell>
  );
}
