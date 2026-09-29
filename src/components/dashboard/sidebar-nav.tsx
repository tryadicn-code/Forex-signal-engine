"use client";

/**
 * Workstation navigation.
 *
 * Home/Scanner remain document anchors. Signals opens the most relevant signal
 * detail on mobile, while Portfolio/Journal open dedicated paper-trading
 * overlays without moving the underlying page.
 */

type PaperPanel = "portfolio" | "journal";

const NAV_ITEMS = [
  { kind: "anchor", href: "#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { kind: "anchor", href: "#scanner", label: "Scanner", desktopLabel: "Scanner", glyph: "≣" },
  { kind: "signals", label: "Signals", desktopLabel: "Signals", glyph: "⚡" },
  { kind: "paper", panel: "portfolio", label: "Portfolio", desktopLabel: "Portfolio", glyph: "◫" },
  { kind: "paper", panel: "journal", label: "Journal", desktopLabel: "Journal", glyph: "◎" },
] as const;

function navClassName(): string {
  return "flex min-w-0 flex-col items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:flex-row md:justify-start md:gap-2 md:px-2.5 md:text-xs";
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

function dispatchPaperPanel(panel: PaperPanel): void {
  window.dispatchEvent(
    new CustomEvent("fse:open-paper-panel", { detail: { panel } })
  );
}

export function SidebarNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-zinc-800 bg-[#0b0e14]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:h-auto md:w-52 md:grid-cols-1 md:border-t-0 md:bg-transparent md:px-2 md:py-4 md:backdrop-blur-none"
    >
      {NAV_ITEMS.map((item) => {
        if (item.kind === "anchor") {
          return (
            <a key={item.href} href={item.href} className={navClassName()}>
              <NavLabel
                glyph={item.glyph}
                label={item.label}
                desktopLabel={item.desktopLabel}
              />
            </a>
          );
        }

        if (item.kind === "signals") {
          return (
            <button
              key="signals"
              type="button"
              onClick={() => window.dispatchEvent(new Event("fse:navigate-signals"))}
              className={navClassName()}
            >
              <NavLabel
                glyph={item.glyph}
                label={item.label}
                desktopLabel={item.desktopLabel}
              />
            </button>
          );
        }

        return (
          <button
            key={item.panel}
            type="button"
            onClick={() => dispatchPaperPanel(item.panel)}
            className={navClassName()}
          >
            <NavLabel
              glyph={item.glyph}
              label={item.label}
              desktopLabel={item.desktopLabel}
            />
          </button>
        );
      })}
    </nav>
  );
}
