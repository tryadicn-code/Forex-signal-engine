import type { PaperTrade } from "@/paper/types";
import type { RDistributionBucket } from "./types";

export function curvePoints(
  trades: PaperTrade[],
  baseline: number,
  metric: (trade: PaperTrade) => number
): { t: number; value: number }[] {
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  const points: { t: number; value: number }[] = [{ t: 0, value: baseline }];
  let cumulative = baseline;
  for (const trade of sorted) {
    cumulative += metric(trade);
    points.push({ t: points.length, value: cumulative });
  }
  return points;
}

export function rDistribution(trades: PaperTrade[]): RDistributionBucket[] {
  const buckets: RDistributionBucket[] = [
    { label: "≤-3", min: -Infinity, max: -3, count: 0, kind: "loss" },
    { label: "-2", min: -3, max: -2, count: 0, kind: "loss" },
    { label: "-1", min: -2, max: -1, count: 0, kind: "loss" },
    { label: "0", min: -1, max: 1, count: 0, kind: "flat" },
    { label: "+1", min: 1, max: 2, count: 0, kind: "win" },
    { label: "+2", min: 2, max: 3, count: 0, kind: "win" },
    { label: "≥+3", min: 3, max: Infinity, count: 0, kind: "win" },
  ];
  for (const trade of trades) {
    const r = trade.realizedR;
    const bucket = buckets.find((b) => r >= b.min && r < b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}