"use client";

import { useEffect, useState } from "react";
import { PaperTradingOverlay } from "@/components/paper/paper-trading-overlay";
import type { PaperDashboardData } from "@/paper/types";

export function GlobalPaperTradingOverlay() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"portfolio" | "journal">("portfolio");
  const [paper, setPaper] = useState<PaperDashboardData | undefined>(undefined);
  const [resetting, setResetting] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);

  useEffect(() => {
    const openPaper = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: "portfolio" | "journal" }>).detail;
      setView(detail?.view ?? "portfolio");
      setOpen(true);

      void fetch("/api/paper", { method: "GET", cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((next) => {
          if (next) setPaper(next as PaperDashboardData);
        })
        .catch(() => {
          // Keep the last good paper snapshot if refresh fails.
        });
    };

    window.addEventListener("fse:open-paper", openPaper);
    return () => window.removeEventListener("fse:open-paper", openPaper);
  }, []);

  const resetPaper = async () => {
    if (resetting) return;
    if (!window.confirm("Reset all paper orders, positions, journal, and paper balance?")) return;

    setResetting(true);
    try {
      const response = await fetch("/api/paper", { method: "DELETE", cache: "no-store" });
      if (!response.ok) return;
      setPaper((await response.json()) as PaperDashboardData);
    } finally {
      setResetting(false);
    }
  };

  const closePosition = async (positionId: string) => {
    if (closingPositionId) return;
    const position = paper?.openPositions.find((item) => item.id === positionId);
    if (!position) return;
    if (
      !window.confirm(
        `Close ${position.symbol} ${position.side} at the latest provider price?`
      )
    ) {
      return;
    }

    setClosingPositionId(positionId);
    try {
      const response = await fetch("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close-position", positionId }),
      });
      if (!response.ok) return;
      setPaper((await response.json()) as PaperDashboardData);
    } finally {
      setClosingPositionId(null);
    }
  };

  return (
    <PaperTradingOverlay
      open={open}
      view={view}
      paper={paper}
      onClose={() => setOpen(false)}
      onReset={resetPaper}
      resetting={resetting}
      onClosePosition={closePosition}
      closingPositionId={closingPositionId}
    />
  );
}
