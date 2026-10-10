export function DiagnosticCard({
  title,
  subtitle,
  primary,
  rows,
  note,
}: {
  title: string;
  subtitle: string;
  primary: string;
  rows: Array<[string, string]>;
  note: string;
}) {
  return (
    <article className="rounded border border-zinc-800 bg-zinc-950/60">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[11px] font-semibold text-zinc-400">{title}</h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
        <div className="mt-2 font-mono text-lg font-semibold tabular-nums text-zinc-200">
          {primary}
        </div>
      </header>
      <dl className="divide-y divide-zinc-800">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 px-3 py-1.5"
          >
            <dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
              {label}
            </dt>
            <dd className="font-mono text-[11px] text-zinc-400">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-zinc-800 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        {note}
      </p>
    </article>
  );
}