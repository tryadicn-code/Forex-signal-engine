"use client";

import { useState } from "react";
import { PaperTradingPanel } from "@/components/paper/paper-trading-panel";
import type { PaperDashboardData } from "@/paper/types";
import { apiFetch, ApiError } from "@/lib/api-client";

export function JournalWorkspace({
  initialPaper,
}: {
  initialPaper?: PaperDashboardData;
}) {
  const [paper, setPaper] = useState(initialPaper);
  const [resetting, setResetting] = useState(false);
  const [settingInitialBalance, setSettingInitialBalance] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetPaper = async () => {
    if (resetting) return;
    if (!window.confirm("Reset all paper orders, positions, journal, and restore the current initial balance?")) return;

    setResetting(true);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "DELETE",
        cache: "no-store",
      });
      setPaper(next);
    } catch (resetError) {
      if (resetError instanceof ApiError && resetError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to reset the paper account. Set it from the dialog, then try again."
        );
      } else {
        setError(
          resetError instanceof Error ? resetError.message : String(resetError)
        );
      }
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
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-initial-balance",
          initialBalance,
        }),
      });
      setPaper(next);
    } catch (balanceError) {
      if (
        balanceError instanceof ApiError &&
        balanceError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to change the paper balance. Set it from the dialog, then try again."
        );
      } else {
        setError(
          balanceError instanceof Error
            ? balanceError.message
            : String(balanceError)
        );
      }
    } finally {
      setSettingInitialBalance(false);
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
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close-position", positionId }),
      });
      setPaper(next);
    } catch (closeError) {
      if (closeError instanceof ApiError && closeError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to close a paper position. Set it from the dialog, then try again."
        );
      } else {
        setError(
          closeError instanceof Error ? closeError.message : String(closeError)
        );
      }
    } finally {
      setClosingPositionId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-4 lg:p-5">
      <header>
        <p className="text-xs font-medium text-sky-300">Journal</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
          Paper portfolio & trading journal
        </h1>
        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
          Review paper positions, orders, trades, and the execution audit trail.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2.5 text-xs text-red-200">
          {error}
        </div>
      )}

      <PaperTradingPanel
        paper={paper}
        onReset={resetPaper}
        resetting={resetting}
        onClosePosition={closePosition}
        closingPositionId={closingPositionId}
        onSetInitialBalance={setInitialBalance}
        settingInitialBalance={settingInitialBalance}
      />
    </div>
  );
}
