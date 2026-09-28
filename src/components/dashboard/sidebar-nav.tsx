/**
 * Primary navigation.
 *
 * Client component only because the active route highlight needs the current
 * pathname. It holds no data state of any kind.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", glyph: "▦" },
  { href: "/scanner", label: "Scanner", glyph: "≣" },
  { href: "/signals", label: "Signals", glyph: "⚡" },
  { href: "/markets", label: "Markets", glyph: "◉" },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex gap-1 overflow-x-auto px-3 py-2 md:w-52 md:flex-col md:overflow-visible md:px-2 md:py-4"
    >
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors",
              "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100",
              active && "bg-zinc-800 text-zinc-50 ring-1 ring-inset ring-zinc-700"
            )}
          >
            <span aria-hidden="true" className="text-sm leading-none">
              {item.glyph}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
