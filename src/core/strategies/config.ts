import type { DeepPartial } from "@/core/config/engine-config";
import {
  DEFAULT_BREAKOUT_RETEST_CONFIG,
  type BreakoutRetestConfig,
} from "@/core/strategies/breakout-retest/config";
import {
  DEFAULT_RANGE_MEAN_REVERSION_CONFIG,
  type RangeMeanReversionConfig,
} from "@/core/strategies/range-mean-reversion/config";
import {
  DEFAULT_REVERSAL_CONFIG,
  type ReversalConfig,
} from "@/core/strategies/reversal/config";

export interface StrategyConfigBundle {
  breakoutRetest: BreakoutRetestConfig;
  rangeMeanReversion: RangeMeanReversionConfig;
  reversal: ReversalConfig;
}

export const DEFAULT_STRATEGY_CONFIG: Readonly<StrategyConfigBundle> = {
  breakoutRetest: { ...DEFAULT_BREAKOUT_RETEST_CONFIG },
  rangeMeanReversion: { ...DEFAULT_RANGE_MEAN_REVERSION_CONFIG },
  reversal: { ...DEFAULT_REVERSAL_CONFIG },
};

export function resolveStrategyConfig(
  overrides?: DeepPartial<StrategyConfigBundle>
): StrategyConfigBundle {
  const base: StrategyConfigBundle = structuredClone(DEFAULT_STRATEGY_CONFIG);
  if (!overrides) return base;

  return {
    breakoutRetest: {
      ...base.breakoutRetest,
      ...(overrides.breakoutRetest ?? {}),
    },
    rangeMeanReversion: {
      ...base.rangeMeanReversion,
      ...(overrides.rangeMeanReversion ?? {}),
    },
    reversal: {
      ...base.reversal,
      ...(overrides.reversal ?? {}),
    },
  };
}
