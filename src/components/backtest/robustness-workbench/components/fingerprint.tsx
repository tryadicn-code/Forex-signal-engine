export function Fingerprint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 break-all text-zinc-400">{value}</div>
    </div>
  );
}