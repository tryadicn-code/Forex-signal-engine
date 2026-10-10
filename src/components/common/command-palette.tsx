"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/components/common/use-focus-trap";

interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords: string[];
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const commands: Command[] = useMemo(
    () => [
      {
        id: "nav-home",
        label: "Go to Home",
        hint: "/",
        keywords: ["home", "dashboard", "overview"],
        run: () => router.push("/"),
      },
      {
        id: "nav-portfolio",
        label: "Go to Portfolio",
        hint: "/portfolio",
        keywords: ["portfolio", "porto", "paper"],
        run: () => router.push("/portfolio"),
      },
      {
        id: "nav-journal",
        label: "Go to Journal",
        hint: "/journal",
        keywords: ["journal", "trades", "history"],
        run: () => router.push("/journal"),
      },
      {
        id: "nav-backtest",
        label: "Go to Backtest",
        hint: "/backtest",
        keywords: ["backtest", "historical", "replay"],
        run: () => router.push("/backtest"),
      },
      {
        id: "nav-system",
        label: "Go to System",
        hint: "/system",
        keywords: ["system", "settings", "health"],
        run: () => router.push("/system"),
      },
      {
        id: "nav-scanner",
        label: "Go to Scanner",
        hint: "/#scanner",
        keywords: ["scanner", "signals", "live"],
        run: () => router.push("/#scanner"),
      },
      {
        id: "action-focus-ready-signal",
        label: "Focus Ready Signal",
        hint: "action",
        keywords: ["focus", "signal", "ready", "scanner"],
        run: () => {
          if (window.location.pathname !== "/") {
            window.sessionStorage.setItem("fse:focus-ready-signal", "1");
            router.push("/#scanner");
            return;
          }
          window.dispatchEvent(new Event("fse:focus-ready-signal"));
        },
      },
      {
        id: "action-open-signal",
        label: "Open Signal Detail\u2026",
        hint: "action",
        keywords: ["signal", "detail", "symbol", "open"],
        run: () => {
          const input = window.prompt("Symbol to open (e.g. EURUSD)?");
          if (!input) return;
          const normalized = input.trim().toUpperCase();
          if (!normalized) return;
          if (window.location.pathname === "/") {
            window.dispatchEvent(
              new CustomEvent("fse:open-signal-detail", {
                detail: { symbol: normalized },
              })
            );
            return;
          }
          window.sessionStorage.setItem("fse:open-signal-symbol", normalized);
          router.push("/#scanner");
        },
      },
      {
        id: "action-approval-secret",
        label: "Open Approval Secret Dialog",
        hint: "action",
        keywords: ["approval", "secret", "auth", "dialog"],
        run: () => {
          window.dispatchEvent(new Event("fse:open-approval-secret-dialog"));
        },
      },
      {
        id: "action-reload",
        label: "Reload Page",
        hint: "action",
        keywords: ["reload", "refresh", "restart"],
        run: () => {
          window.location.reload();
        },
      },
    ],
    [router]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.includes(q))
    );
  }, [commands, query]);

  const clampedIndex =
    filtered.length === 0
      ? 0
      : Math.max(0, Math.min(activeIndex, filtered.length - 1));

  const openPalette = () => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (value) return false;
          return true;
        });
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpenEvent = () => openPalette();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("fse:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("fse:open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      '[data-command-index="' + clampedIndex + '"]'
    );
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [clampedIndex, open]);

  const runCommand = (cmd: Command) => {
    setOpen(false);
    window.setTimeout(() => cmd.run(), 0);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex(Math.min(clampedIndex + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex(Math.max(clampedIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const cmd = filtered[clampedIndex];
      if (cmd) runCommand(cmd);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-3 pt-[10vh] backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <div
        ref={trapRef}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#0b0e14] shadow-2xl"
      >
        <div className="border-b border-zinc-800 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Type a command or search"
            aria-label="Command palette search"
            className="h-9 w-full rounded border border-zinc-800 bg-zinc-950/60 px-2.5 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-700"
          />
        </div>
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[11px] text-zinc-600">
              No commands match.
            </li>
          ) : (
            filtered.map((cmd, idx) => (
              <li key={cmd.id} role="option" aria-selected={idx === clampedIndex}>
                <button
                  type="button"
                  data-command-index={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => runCommand(cmd)}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors " +
                    (idx === clampedIndex
                      ? "bg-emerald-950/30 text-emerald-200"
                      : "text-zinc-300 hover:bg-zinc-900/60")
                  }
                >
                  <span className="truncate">{cmd.label}</span>
                  {cmd.hint && (
                    <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                      {cmd.hint}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-1.5 font-mono text-[10px] text-zinc-600">
          <span>{"\u2191\u2193"} navigate {"\u00B7"} Enter run {"\u00B7"} Esc close</span>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}