/**
 * Primary workstation navigation.
 *
 * Phase 3 is intentionally a single compact workspace, so navigation points to
 * sections of the dashboard rather than placeholder routes.
 */

const NAV_ITEMS = [
  { href: "#overview", label: "Dashboard", glyph: "▦" },
  { href: "#scanner", label: "Scanner", glyph: "≣" },
  { href: "#signals", label: "Signals", glyph: "⚡" },
  { href: "#markets", label: "Markets", glyph: "◉" },
] as const;

export function SidebarNav() {
  return (
    <nav
      aria-label="Primary"
      className="flex gap-1 overflow-x-auto px-3 py-2 md:w-52 md:flex-col md:overflow-visible md:px-2 md:py-4"
    >
      {NAV_ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <span aria-hidden="true" className="text-sm leading-none">
            {item.glyph}
          </span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
