import { useState } from "react";

export function PersistedDetails({
  id,
  anchorId,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  anchorId?: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem("fse:backtest:section:" + id);
    if (stored === "open") return true;
    if (stored === "closed") return false;
    return defaultOpen;
  });

  const onToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = event.currentTarget.open;
    setOpen(isOpen);
    window.localStorage.setItem(
      "fse:backtest:section:" + id,
      isOpen ? "open" : "closed"
    );
  };

  return (
    <details
      id={anchorId}
      open={open}
      onToggle={onToggle}
      className="group border-t border-zinc-800 pt-3"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400 hover:text-zinc-200">
        <span>{title}</span>
        <span
          aria-hidden="true"
          className="font-mono text-[11px] text-zinc-600 transition-transform group-open:rotate-90"
        >
          ▸
        </span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}