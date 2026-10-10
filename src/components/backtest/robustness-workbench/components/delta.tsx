export function Delta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[11px] font-semibold text-zinc-400">
        {value}
      </div>
    </div>
  );
}