import type { Direction } from "@/types/market";
import type { StructureResultData } from "@/types/engine";

export interface StructuralTargetInput {
  entry: number;
  direction: Direction;
  pipSize: number;
  setupStructure: StructureResultData;
  biasStructure?: StructureResultData;
  bufferPips: number;
}

/**
 * Build profit-side structural obstacle levels from already-confirmed swing
 * structure. Levels are buffered toward the entry so TP never sits exactly on
 * the swing itself.
 *
 * The returned list is ordered from nearest to farthest and contains no
 * look-ahead information because StructureResultData only exposes swings that
 * were confirmed by the current market boundary.
 */
export function deriveStructuralTargetLevels(
  input: StructuralTargetInput
): number[] {
  if (
    input.direction !== "LONG" &&
    input.direction !== "SHORT"
  ) {
    return [];
  }
  if (
    !Number.isFinite(input.entry) ||
    input.entry <= 0 ||
    !Number.isFinite(input.pipSize) ||
    input.pipSize <= 0
  ) {
    return [];
  }

  const buffer =
    Number.isFinite(input.bufferPips) && input.bufferPips > 0
      ? input.bufferPips * input.pipSize
      : 0;

  const structures = [
    input.setupStructure,
    ...(input.biasStructure ? [input.biasStructure] : []),
  ];

  const raw =
    input.direction === "LONG"
      ? structures.flatMap((structure) =>
          structure.swingHighs.map((swing) => swing.price)
        )
      : structures.flatMap((structure) =>
          structure.swingLows.map((swing) => swing.price)
        );

  const adjusted = raw
    .map((level) =>
      input.direction === "LONG" ? level - buffer : level + buffer
    )
    .filter((level) =>
      input.direction === "LONG"
        ? level > input.entry
        : level < input.entry
    )
    .sort((a, b) =>
      Math.abs(a - input.entry) - Math.abs(b - input.entry)
    );

  const deduped: number[] = [];
  for (const level of adjusted) {
    const duplicate = deduped.some(
      (existing) => Math.abs(existing - level) < input.pipSize * 0.5
    );
    if (!duplicate) deduped.push(level);
  }

  return deduped;
}
