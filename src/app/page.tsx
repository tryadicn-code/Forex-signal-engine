import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { readDashboard } from "@/server/scanner-access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await readDashboard();

  return (
    <DashboardShell>
      <DashboardWorkspace initialData={data} />
    </DashboardShell>
  );
}
