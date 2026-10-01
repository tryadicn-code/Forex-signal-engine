"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperTradingOverlay } from "@/components/paper/paper-trading-overlay";
import type { PaperDashboardData } from "@/paper/types";

type PaperOverlayView = "portfolio" | "journal";
type PaperOverlayWindow = Window & {
  __fseOpenPaper?: (view: PaperOverlayView) => void;
};

export function GlobalPaperTradingOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"portfolio" | "journal">("portfolio");
  const [paper, setPaper] = useState<PaperDashboardData | undefined>(undefined);
  const [resetting, setResetting] = useState(false);
  const [settingInitialBalance, setSettingInitialBalance] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);

  useEffect(() => {
    const openPaperView = (nextView: PaperOverlayView = "portfolio") => {
      setView(nextView);
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

    const openPaperEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: PaperOverlayView }>).detail;
      openPaperView(detail?.view ?? "portfolio");
    };

    const browserWindow = window as PaperOverlayWindow;
    browserWindow.__fseOpenPaper = openPaperView;
    window.addEventListener("fse:open-paper", openPaperEvent);

    return () => {
      if (browserWindow.__fseOpenPaper === openPaperView) {
        delete browserWindow.__fseOpenPaper;
      }
      window.removeEventListener("fse:open-paper", openPaperEvent);
    };
  }, []);

  const resetPaper = async () => {
    if (resetting) return;
    if (!window.confirm("Reset all paper orders, positions, journal, and restore the current initial balance?")) return;

    setResetting(true);
    try {
      const response = await fetch("/api/paper", { method: "DELETE", cache: "no-store" });
      if (!response.ok) return;
      setPaper((await response.json()) as PaperDashboardData);
    } finally {
      setResetting(false);
    }
  };

  const setInitialBalance = async (initialBalance: number) => {
    if (settingInitialBalance) return;
    const currency = paper?.account.currency ?? "USD";
    if (
      !window.confirm(
        `Set initial paper balance to ${currency} ${initialBalance.toLocaleString()}? This will clear all paper positions, orders, journal, and performance history.`
      )
    ) {
      return;
    }

    setSettingInitialBalance(true);
    try {
      const response = await fetch("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-initial-balance",
          initialBalance,
        }),
      });
      if (!response.ok) return;
      setPaper((await response.json()) as PaperDashboardData);
    } finally {
      setSettingInitialBalance(false);
    }
  };

  const openAnalysis = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setOpen(false);

    if (window.location.pathname === "/") {
      window.dispatchEvent(
        new CustomEvent("fse:open-signal-detail", {
          detail: { symbol: normalized },
        })
      );
      return;
    }

    window.sessionStorage.setItem("fse:open-signal-symbol", normalized);
    router.push("/#scanner");
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
      onOpenAnalysis={openAnalysis}
      closingPositionId={closingPositionId}
      onSetInitialBalance={setInitialBalance}
      settingInitialBalance={settingInitialBalance}
    />
  );
}
