import { useEffect, useRef } from "react";

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
  // Hydration-safe: the <details> element is uncontrolled. The server and
  // the client both render it without an `open` attribute, so React never
  // flags a mismatch. After mount we apply the persisted (or default) state
  // directly through the DOM ref, which avoids a setState-in-effect render.
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const node = detailsRef.current;
    if (!node) return;
    const stored = window.localStorage.getItem("fse:backtest:section:" + id);
    if (stored === "open") node.open = true;
    else if (stored === "closed") node.open = false;
    else node.open = defaultOpen;
  }, [id, defaultOpen]);

  const onToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    window.localStorage.setItem(
      "fse:backtest:section:" + id,
      event.currentTarget.open ? "open" : "closed"
    );
  };

  return (
    <details
      ref={detailsRef}
      id={anchorId}
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