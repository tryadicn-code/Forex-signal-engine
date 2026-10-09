"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * UIUX-M-011: unified modal close button.
 *
 * Replaces four different close-button implementations that differed in
 * padding, radius, and font size. Desktop rendering shows "Close"; a compact
 * icon-only variant is available via `variant="icon"` for bottom-sheet
 * headers that need to preserve vertical space.
 *
 * Minimum touch target: h-10 (40px) which exceeds the previous ~32px
 * implementations while staying compact enough for a modal header.
 */
export function ModalCloseButton({
  onClick,
  label = "Close",
  variant = "text",
  className,
  style,
}: {
  onClick: () => void;
  label?: string;
  variant?: "text" | "icon";
  className?: string;
  /** Optional inline style escape hatch (e.g. height override). */
  style?: CSSProperties;
}) {
  const base =
    "inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/40 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(base, "w-10", className)}
        style={style}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="h-4 w-4"
        >
          <path
            d="m6 6 8 8M14 6l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(base, "px-3", className)}
      style={style}
    >
      {label}
    </button>
  );
}