import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <DashboardShell>
      <DashboardClient />
    </DashboardShell>
  );
}
