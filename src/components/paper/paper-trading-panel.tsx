"use client";

import type { PaperDashboardData } from "@/paper/types";
import { csvFilename, downloadCsv, tradesToCsv } from "./paper-trading-panel/lib/csv";
import { PortfolioSection } from "./paper-trading-panel/sections/portfolio-section";
import { JournalSection } from "./paper-trading-panel/sections/journal-section";

export { csvFilename, downloadCsv, tradesToCsv };

export type PaperPanelView = "both" | "portfolio" | "journal";

export function PaperTradingPanel({
  paper,
  onReset,
  resetting,
  onClosePosition,
  onUpdatePositionRR,
  updatingRRId = null,
  onOpenAnalysis,
  closingPositionId = null,
  onSetInitialBalance,
  settingInitialBalance = false,
  view = "both",
}: {
  paper: PaperDashboardData | undefined;
  onReset: () => Promise<void>;
  resetting: boolean;
  onClosePosition?: (positionId: string) => Promise<void>;
  onUpdatePositionRR?: (positionId: string, newRR: number) => Promise<void>;
  updatingRRId?: string | null;
  onOpenAnalysis?: (symbol: string) => void;
  closingPositionId?: string | null;
  onSetInitialBalance?: (initialBalance: number) => Promise<void>;
  settingInitialBalance?: boolean;
  view?: PaperPanelView;
}) {
  if (!paper) return null;

  return (
    <div className="space-y-4">
      {view !== "journal" && (
        <PortfolioSection
          paper={paper}
          onSetInitialBalance={onSetInitialBalance}
          settingInitialBalance={settingInitialBalance}
          onReset={onReset}
          resetting={resetting}
          onClosePosition={onClosePosition}
          closingPositionId={closingPositionId}
          onUpdatePositionRR={onUpdatePositionRR}
          updatingRRId={updatingRRId}
          onOpenAnalysis={onOpenAnalysis}
        />
      )}

      {view !== "portfolio" && <JournalSection paper={paper} />}
    </div>
  );
}