export interface ForwardValidationConfig {
  minimumTradeSample: number;
  dataFailureRateAttentionPercent: number;
  staleDataRateAttentionPercent: number;
  maxObservations: number;
}

export const DEFAULT_FORWARD_VALIDATION_CONFIG: ForwardValidationConfig = {
  minimumTradeSample: 30,
  dataFailureRateAttentionPercent: 5,
  staleDataRateAttentionPercent: 5,
  maxObservations: 50_000,
};
