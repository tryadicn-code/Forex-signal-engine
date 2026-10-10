import { inputClass } from "../lib/constants";
import { Field } from "./field";

export function SourceFormSection({
  datasetId,
  source,
  utcOffsetMinutes,
  spreadPips,
  onDatasetId,
  onSource,
  onUtcOffsetMinutes,
  onSpreadPips,
}: {
  datasetId: string;
  source: string;
  utcOffsetMinutes: string;
  spreadPips: string;
  onDatasetId: (value: string) => void;
  onSource: (value: string) => void;
  onUtcOffsetMinutes: (value: string) => void;
  onSpreadPips: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Dataset id">
        <input
          value={datasetId}
          onChange={(event) => onDatasetId(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Source label">
        <input
          value={source}
          onChange={(event) => onSource(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field
        label="Source UTC offset · minutes"
        hint="120 = UTC+2, 180 = UTC+3. MT5 export often uses broker-server time."
      >
        <input
          type="number"
          min={-840}
          max={840}
          step={30}
          value={utcOffsetMinutes}
          onChange={(event) => onUtcOffsetMinutes(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field
        label="Assumed spread · pips"
        hint="Deterministic static assumption; no random spread."
      >
        <input
          type="number"
          min={0}
          step={0.1}
          value={spreadPips}
          onChange={(event) => onSpreadPips(event.target.value)}
          className={inputClass}
        />
      </Field>
    </div>
  );
}