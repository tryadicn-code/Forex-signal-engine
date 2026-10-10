import { useState } from "react";
import type { PaperTrade } from "@/paper/types";
import { cn } from "@/lib/utils";

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyTradeButton({ trade }: { trade: PaperTrade }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onClick = async () => {
    const ok = await copyText(JSON.stringify(trade, null, 2));
    if (ok) {
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-label="Copy trade JSON"
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        failed
          ? "border-red-800/70 text-red-300"
          : copied
            ? "border-emerald-700/60 text-emerald-300"
            : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
      )}
    >
      {failed ? "Failed" : copied ? "Copied" : "Copy"}
    </button>
  );
}