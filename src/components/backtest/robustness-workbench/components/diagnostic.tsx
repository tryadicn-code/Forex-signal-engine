export function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[11px] text-zinc-400">{value}</dd>
    </div>
  );
}