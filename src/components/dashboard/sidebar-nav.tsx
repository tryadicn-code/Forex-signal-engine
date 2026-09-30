"use client";

const NAV_ITEMS = [
  { href: "/#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { href: "/#scanner", label: "Scanner", desktopLabel: "Scanner", glyph: "≣" },
  { href: "/journal", label: "Journal", desktopLabel: "Journal", glyph: "◫" },
  { href: "/backtest", label: "Backtest", desktopLabel: "Backtest", glyph: "▥" },
  { href: "/system", label: "System", desktopLabel: "System", glyph: "⚙" },
] as const;

function navClassName(): string {
  return "flex min-w-0 flex-col items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:flex-row md:justify-start md:gap-2 md:px-2.5 md:text-xs";
}

function NavLabel({
  glyph,
  label,
  desktopLabel,
}: {
  glyph: string;
  label: string;
  desktopLabel: string;
}) {
  return (
    <>
      <span aria-hidden="true" className="text-base leading-none md:text-sm">
        {glyph}
      </span>
      <span className="md:hidden">{label}</span>
      <span className="hidden md:inline">{desktopLabel}</span>
    </>
  );
}

export function SidebarNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-zinc-800 bg-[#0b0e14]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-52 md:grid-cols-1 md:content-start md:border-t-0 md:bg-transparent md:px-2 md:py-4 md:backdrop-blur-none"
    >
      {NAV_ITEMS.map((item) => (
        <a key={item.href} href={item.href} className={navClassName()}>
          <NavLabel
            glyph={item.glyph}
            label={item.label}
            desktopLabel={item.desktopLabel}
          />
        </a>
      ))}
    </nav>
  );
}
