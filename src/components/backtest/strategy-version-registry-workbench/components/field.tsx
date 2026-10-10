export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-500">
          {hint}
        </span>
      )}
    </label>
  );
}