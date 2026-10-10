export function BacktestErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-800/60 bg-red-950/20 px-3 py-2 text-xs text-red-200"
    >
      <span className="font-mono font-semibold">BACKTEST BLOCKED</span>
      <span className="ml-2 text-red-200/75">{error}</span>
    </div>
  );
}