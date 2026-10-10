export function ReviewCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 text-[11px] text-zinc-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-sky-500"
      />
      <span>{label}</span>
    </label>
  );
}