"use client";

import Link from "next/link";

const NAV_ITEMS = [
  { kind: "link", href: "/#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { kind: "paper", label: "Porto", desktopLabel: "Portfolio", glyph: "◫" },
  { kind: "link", href: "/#scanner", label: "Signal", desktopLabel: "Signal", glyph: "⚡", primary: true },
  { kind: "link", href: "/backtest", label: "Backtest", desktopLabel: "Backtest", glyph: "▥" },
  { kind: "link", href: "/system", label: "System", desktopLabel: "System", glyph: "⚙" },
] as const;

function navClassName(primary = false): string {
  return [
    "flex min-w-0 flex-col items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
    "md:flex-row md:justify-start md:gap-2 md:px-2.5 md:text-xs",
    primary
      ? "-mt-3 text-amber-300 md:mt-0 md:text-amber-300"
      : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100",
  ].join(" ");
}

function NavLabel({
  glyph,
  label,
  desktopLabel,
  primary = false,
}: {
  glyph: string;
  label: string;
  desktopLabel: string;
  primary?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={
          primary
            ? "flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/50 bg-[#11151d] text-xl leading-none text-amber-300 shadow-lg shadow-amber-950/40 md:h-auto md:w-auto md:border-0 md:bg-transparent md:text-base md:shadow-none"
            : "text-base leading-none md:text-sm"
        }
      >
        {glyph}
      </span>
      <span className={primary ? "font-semibold text-amber-300 md:hidden" : "md:hidden"}>
        {label}
      </span>
      <span className={primary ? "hidden font-semibold text-amber-300 md:inline" : "hidden md:inline"}>
        {desktopLabel}
      </span>
    </>
  );
}

export function SidebarNav() {
  const openPortfolio = () => {
    window.dispatchEvent(
      new CustomEvent("fse:open-paper", { detail: { view: "portfolio" } })
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-zinc-800 bg-[#0b0e14]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-52 md:grid-cols-1 md:content-start md:border-t-0 md:bg-transparent md:px-2 md:py-4 md:backdrop-blur-none"
    >
      {NAV_ITEMS.map((item) => {
        const primary = "primary" in item && item.primary === true;

        if (item.kind === "paper") {
          return (
            <button
              key="portfolio"
              type="button"
              onClick={openPortfolio}
              className={navClassName(false)}
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
          <Link
            key={item.href}
            href={item.href}
            className={navClassName(primary)}
          >
            <NavLabel
              glyph={item.glyph}
              label={item.label}
              desktopLabel={item.desktopLabel}
              primary={primary}
            />
          </Link>
        );
      })}
    </nav>
  );
}
