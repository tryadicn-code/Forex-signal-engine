"use client";

import { useEffect, useState } from "react";
import {
  PaperTradingPanel,
  type PaperPanelView,
} from "@/components/paper/paper-trading-panel";
import type { PaperDashboardData } from "@/paper/types";

export function PaperTradingOverlay({
  open,
  view,
  paper,
  onClose,
  onReset,
  resetting,
  onClosePosition,
  closingPositionId,
  onSetInitialBalance,
  settingInitialBalance,
}: {
  open: boolean;
  view: Exclude<PaperPanelView, "both">;
  paper: PaperDashboardData | undefined;
  onClose: () => void;
  onReset: () => Promise<void>;
  resetting: boolean;
  onClosePosition?: (positionId: string) => Promise<void>;
  closingPositionId?: string | null;
  onSetInitialBalance?: (initialBalance: number) => Promise<void>;
  settingInitialBalance?: boolean;
}) {
  const [activeView, setActiveView] = useState<Exclude<PaperPanelView, "both">>(
    view
  );

  useEffect(() => {
    if (!open) return;
    const syncView = window.setTimeout(() => setActiveView(view), 0);
    return () => window.clearTimeout(syncView);
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const title = "Paper Trading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-[#0b0e14] shadow-2xl md:max-w-5xl md:rounded-2xl">
        <header className="shrink-0 border-b border-zinc-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-100">{title}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                Simulated execution · no real funds
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Close
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Paper trading views"
            className="grid grid-cols-2 border-t border-zinc-800 bg-zinc-950/35"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "portfolio"}
              onClick={() => setActiveView("portfolio")}
              className={
                "border-r border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors " +
                (activeView === "portfolio"
                  ? "bg-emerald-950/20 text-emerald-300"
                  : "text-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300")
              }
            >
              Portfolio
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "journal"}
              onClick={() => setActiveView("journal")}
              className={
                "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors " +
                (activeView === "journal"
                  ? "bg-emerald-950/20 text-emerald-300"
                  : "text-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300")
              }
            >
              Journal
            </button>
          </div>
        </header>

        <div className="overflow-y-auto p-3 sm:p-4">
          <PaperTradingPanel
            paper={paper}
            onReset={onReset}
            resetting={resetting}
            onClosePosition={onClosePosition}
            closingPositionId={closingPositionId}
            onSetInitialBalance={onSetInitialBalance}
            settingInitialBalance={settingInitialBalance}
            view={activeView}
          />
        </div>
      </div>
    </div>
  );
}
