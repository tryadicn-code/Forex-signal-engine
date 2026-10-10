import { inputClass } from "../lib/constants";
import { PRESETS, type BacktestPreset } from "../lib/presets";
import { Field } from "./field";

export function ReplayFormSection({
  startDate,
  endDate,
  initialBalance,
  riskPercent,
  maxOpenPositions,
  maxTotalRisk,
  policy,
  onStartDate,
  onEndDate,
  onInitialBalance,
  onRiskPercent,
  onMaxOpenPositions,
  onMaxTotalRisk,
  onPolicy,
  onApplyPreset,
}: {
  startDate: string;
  endDate: string;
  initialBalance: string;
  riskPercent: string;
  maxOpenPositions: string;
  maxTotalRisk: string;
  policy: string;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  onInitialBalance: (value: string) => void;
  onRiskPercent: (value: string) => void;
  onMaxOpenPositions: (value: string) => void;
  onMaxTotalRisk: (value: string) => void;
  onPolicy: (value: string) => void;
  onApplyPreset: (key: BacktestPreset) => void;
}) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          Preset
        </span>
        {(["demo", "conservative", "aggressive"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onApplyPreset(key)}
            className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            {PRESETS[key].label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Start date" hint="Blank = common coverage start">
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDate(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="End date" hint="Blank = common coverage end">
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDate(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Initial balance">
          <input
            type="number"
            min={1}
            value={initialBalance}
            onChange={(event) => onInitialBalance(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Risk / trade · %">
          <input
            type="number"
            min={0.01}
            step={0.1}
            value={riskPercent}
            onChange={(event) => onRiskPercent(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Max open positions">
          <input
            type="number"
            min={1}
            step={1}
            value={maxOpenPositions}
            onChange={(event) => onMaxOpenPositions(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Max total risk · %">
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={maxTotalRisk}
            onChange={(event) => onMaxTotalRisk(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Same-bar SL/TP"
          hint="STOP_FIRST is the conservative default."
        >
          <select
            value={policy}
            onChange={(event) => onPolicy(event.target.value)}
            className={inputClass}
          >
            <option value="STOP_FIRST">STOP_FIRST</option>
            <option value="TARGET_FIRST">TARGET_FIRST</option>
            <option value="REJECT_AMBIGUOUS">REJECT_AMBIGUOUS</option>
          </select>
        </Field>
      </div>
    </>
  );
}