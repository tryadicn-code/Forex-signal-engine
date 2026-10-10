import type { PaperTrade } from "@/paper/types";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function isoWita(epoch: number): string {
  const wita = new Date(epoch + 8 * 60 * 60 * 1000);
  const yyyy = wita.getUTCFullYear();
  const mm = String(wita.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wita.getUTCDate()).padStart(2, "0");
  const hh = String(wita.getUTCHours()).padStart(2, "0");
  const mi = String(wita.getUTCMinutes()).padStart(2, "0");
  const ss = String(wita.getUTCSeconds()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + mi + ":" + ss + "+08:00";
}

export function tradesToCsv(trades: PaperTrade[]): string {
  const headers = [
    "id", "symbol", "side", "closeReason",
    "entryPrice", "exitPrice", "stopLoss", "takeProfit",
    "positionSize", "riskAmount", "riskPercent", "plannedRR",
    "realizedPnL", "realizedPnLPercent", "realizedR",
    "maxFavorableR", "maxAdverseR",
    "openedAt", "closedAt", "holdingDurationMs",
    "engineBias", "engineSetupScore", "engineExecutionDecision", "engineFreshness",
  ];
  const sorted = [...trades].sort((a, b) => b.closedAt - a.closedAt);
  const rows = sorted.map((t) =>
    [
      t.id,
      t.symbol,
      t.side,
      t.closeReason,
      t.entryPrice,
      t.exitPrice,
      t.stopLoss,
      t.takeProfit === null ? "" : t.takeProfit,
      t.positionSize,
      t.riskAmount,
      t.riskPercent,
      t.plannedRR === null ? "" : t.plannedRR,
      t.realizedPnL,
      t.realizedPnLPercent,
      t.realizedR,
      t.maxFavorableR === undefined ? "" : t.maxFavorableR,
      t.maxAdverseR === undefined ? "" : t.maxAdverseR,
      isoWita(t.openedAt),
      isoWita(t.closedAt),
      t.holdingDurationMs,
      t.engine.bias ?? "",
      t.engine.setupScore === null ? "" : t.engine.setupScore,
      t.engine.executionDecision ?? "",
      t.engine.freshness ?? "",
    ]
      .map((cell) => csvEscape(String(cell)))
      .join(",")
  );
  return [headers.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function csvFilename(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return "paper-trades-" + yyyy + mm + dd + "-" + hh + mi + ss + ".csv";
}