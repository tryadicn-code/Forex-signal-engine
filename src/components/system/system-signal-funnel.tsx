"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { SignalFunnelPanel } from "@/components/analytics/signal-funnel-panel";
import type { SignalFunnelDashboard } from "@/analytics/signal-funnel";

export function SystemSignalFunnel({
  analytics,
  persistenceError,
}: {
  analytics: SignalFunnelDashboard | null | undefined;
  persistenceError?: string | null;
}) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onReset = async () => {
    if (resetting) return;
    const confirmed = window.confirm(
      "Reset signal funnel? Semua observasi yang tersimpan akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
    );
    if (!confirmed) return;

    setResetting(true);
    setLocalError(null);
    try {
      await apiFetch("/api/analytics/signal-funnel", { method: "DELETE" });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
        setLocalError(
          "Approval secret is required to reset the signal funnel. Set it from the dialog, then try again."
        );
      } else {
        setLocalError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div id="signal-funnel" className="scroll-mt-20">
      <SignalFunnelPanel
        analytics={analytics}
        persistenceError={localError ?? persistenceError ?? null}
        onReset={onReset}
        resetting={resetting}
      />
    </div>
  );
}