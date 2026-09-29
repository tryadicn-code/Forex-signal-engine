"use client";

import { useEffect } from "react";
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
}: {
  open: boolean;
  view: Exclude<PaperPanelView, "both">;
  paper: PaperDashboardData | undefined;
  onClose: () => void;
  onReset: () => Promise<void>;
  resetting: boolean;
}) {
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

  const title = view === "portfolio" ? "Paper Portfolio" : "Paper Journal";

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
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
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
        </header>

        <div className="overflow-y-auto p-3 sm:p-4">
          <PaperTradingPanel
            paper={paper}
            onReset={onReset}
            resetting={resetting}
            view={view}
          />
        </div>
      </div>
    </div>
  );
}
