import { formatBytes } from "../lib/formatters";

export function FileUploadSection({
  files,
  dragActive,
  onFilesChange,
  onDragActiveChange,
}: {
  files: File[];
  dragActive: boolean;
  onFilesChange: (files: File[]) => void;
  onDragActiveChange: (active: boolean) => void;
}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <section id="backtest-step-1">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
        1 · Historical files
      </h2>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          onDragActiveChange(true);
        }}
        onDragLeave={() => onDragActiveChange(false)}
        onDrop={(event) => {
          event.preventDefault();
          onDragActiveChange(false);
          const dropped = Array.from(event.dataTransfer.files ?? []);
          if (dropped.length > 0) onFilesChange(dropped);
        }}
        className={
          "mt-2 block cursor-pointer rounded-md border border-dashed p-4 text-center transition-colors " +
          (dragActive
            ? "border-emerald-500 bg-emerald-950/30"
            : "border-zinc-700 bg-zinc-950/40 hover:border-emerald-800")
        }
      >
        <input
          type="file"
          multiple
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={(event) =>
            onFilesChange(Array.from(event.target.files ?? []))
          }
        />
        <span className="block text-sm font-medium text-zinc-200">
          Select MT5 CSV/TXT files
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed text-zinc-600">
          File name must include symbol + timeframe, e.g. EURUSD_D1.csv, EURUSD_H4.csv, EURUSD_H1.csv, EURUSD_M15.csv.
        </span>
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <span>{files.length} files</span>
        <span>{formatBytes(totalBytes)}</span>
        <span>D1 · H4 · H1 · M15 required per pair</span>
      </div>

      {files.length > 0 && (
        <div className="mt-2 max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950/30 p-2">
          <div className="grid gap-1 font-mono text-[11px] text-zinc-500 sm:grid-cols-2">
            {files.map((file) => (
              <div key={file.name} className="truncate">
                {file.name} · {formatBytes(file.size)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}