import type { HistoricalSegmentDimension } from "@/replay/analytics-types";

export const SEGMENTS: HistoricalSegmentDimension[] = [
  "strategy",
  "symbol",
  "direction",
  "bias",
  "setupScore",
  "entrySession",
  "closeReason",
];