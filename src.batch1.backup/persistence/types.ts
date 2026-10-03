export type DurableIntegrityState =
  | "VERIFIED"
  | "LEGACY_UNVERIFIED"
  | "RECOVERED"
  | "MISSING"
  | "CORRUPT";

export interface DurableFileHealth {
  path: string;
  state: DurableIntegrityState;
  checkedAt: number;
  lastWriteAt: number | null;
  recoveredAt: number | null;
  message: string;
}

export interface DurableReadResult<T> {
  value: T | null;
  health: DurableFileHealth;
}
