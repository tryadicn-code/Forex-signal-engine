/**
 * Workstation navigation.
 *
 * Desktop uses a compact side rail. Mobile uses a fixed bottom bar so the top
 * header can stay readable and the scanner controls have more vertical room.
 */

const NAV_ITEMS = [
  { href: "#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { href: "#scanner", label: "Scanner", desktopLabel: "Scanner", glyph: "≣" },
  { href: "#signals", label: "Signals", desktopLabel: "Signals", glyph: "⚡" },
  { href: "#markets", label: "Health", desktopLabel: "Markets", glyph: "◉" },
] as const;

export function SidebarNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-zinc-800 bg-[#0b0e14]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:h-auto md:w-52 md:grid-cols-1 md:border-t-0 md:bg-transparent md:px-2 md:py-4 md:backdrop-blur-none"
    >
      {NAV_ITEMS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:flex-row md:justify-start md:gap-2 md:px-2.5 md:text-xs"
        >
          <span aria-hidden="true" className="text-base leading-none md:text-sm">
            {item.glyph}
          </span>
          <span className="md:hidden">{item.label}</span>
          <span className="hidden md:inline">{item.desktopLabel}</span>
        </a>
      ))}
    </nav>
  );
}
