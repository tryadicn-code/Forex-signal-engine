"use client";

import Link from "next/link";

const NAV_ITEMS = [
  { kind: "link", href: "/#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { kind: "paper", label: "Porto", desktopLabel: "Portfolio", glyph: "◫" },
  { kind: "signal", label: "Signal", desktopLabel: "Signal", glyph: "⚡" },
  { kind: "link", href: "/backtest", label: "Backtest", desktopLabel: "Backtest", glyph: "▥" },
  { kind: "link", href: "/system", label: "System", desktopLabel: "System", glyph: "⚙" },
] as const;

const MOBILE_NAV_ITEMS = [
  NAV_ITEMS[0],
  NAV_ITEMS[1],
  NAV_ITEMS[3],
  NAV_ITEMS[4],
] as const;

function MobileNavLabel({
  glyph,
  label,
}: {
  glyph: string;
  label: string;
}) {
  return (
    <>
      <span aria-hidden="true" className="text-base leading-none">
        {glyph}
      </span>
      <span>{label}</span>
    </>
  );
}

function DesktopNavLabel({
  glyph,
  label,
  primary = false,
}: {
  glyph: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={primary ? "text-base text-amber-300" : "text-sm"}
      >
        {glyph}
      </span>
      <span className={primary ? "font-semibold text-amber-300" : ""}>
        {label}
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

  const focusReadySignal = () => {
    if (window.location.pathname !== "/") {
      window.sessionStorage.setItem("fse:focus-ready-signal", "1");
      window.location.assign("/#scanner");
      return;
    }

    window.dispatchEvent(new Event("fse:focus-ready-signal"));
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 h-16 md:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 80"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            d="M0 0 H404 C432 0 438 34 500 34 C562 34 568 0 596 0 H1000 V80 H0 Z"
            fill="rgb(11 14 20 / 0.985)"
          />
          <path
            d="M0 0 H404 C432 0 438 34 500 34 C562 34 568 0 596 0 H1000"
            fill="none"
            stroke="rgb(63 63 70)"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="relative z-10 grid h-full grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_NAV_ITEMS.map((item, index) => {
            const colClass =
              index === 0
                ? "col-start-1"
                : index === 1
                  ? "col-start-2"
                  : index === 2
                    ? "col-start-4"
                    : "col-start-5";

            if (item.kind === "paper") {
              return (
                <button
                  key="portfolio"
                  type="button"
                  onClick={openPortfolio}
                  className={`${colClass} flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}
                >
                  <MobileNavLabel glyph={item.glyph} label={item.label} />
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${colClass} flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}
              >
                <MobileNavLabel glyph={item.glyph} label={item.label} />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={focusReadySignal}
          aria-label="Go to first ready signal"
          className="absolute left-1/2 top-0 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-500/70 bg-[#0b0e14] text-[28px] leading-none text-amber-300 shadow-lg shadow-amber-950/40 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <span aria-hidden="true">⚡</span>
        </button>
      </nav>

      <nav
        aria-label="Primary"
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 grid-cols-1 content-start border-r border-zinc-800 bg-transparent px-2 py-4 md:grid"
      >
        {NAV_ITEMS.map((item) => {
          const primary = item.kind === "signal";

          if (item.kind === "paper") {
            return (
              <button
                key="portfolio"
                type="button"
                onClick={openPortfolio}
                className="flex min-w-0 items-center justify-start gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <DesktopNavLabel
                  glyph={item.glyph}
                  label={item.desktopLabel}
                />
              </button>
            );
          }

          if (item.kind === "signal") {
            return (
              <button
                key="signal"
                type="button"
                onClick={focusReadySignal}
                className="flex min-w-0 items-center justify-start gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-zinc-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <DesktopNavLabel
                  glyph={item.glyph}
                  label={item.desktopLabel}
                  primary
                />
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-0 items-center justify-start gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <DesktopNavLabel
                glyph={item.glyph}
                label={item.desktopLabel}
                primary={primary}
              />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
