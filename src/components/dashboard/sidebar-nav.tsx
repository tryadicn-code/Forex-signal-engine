"use client";

import Link from "next/link";

const NAV_ITEMS = [
  { kind: "link", href: "/#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { kind: "paper", label: "Porto", desktopLabel: "Portfolio", glyph: "◫" },
  { kind: "signal", label: "Signal", desktopLabel: "Signal", glyph: "⚡", primary: true },
  { kind: "link", href: "/backtest", label: "Backtest", desktopLabel: "Backtest", glyph: "▥" },
  { kind: "link", href: "/system", label: "System", desktopLabel: "System", glyph: "⚙" },
] as const;

function navClassName(primary = false): string {
  return [
    "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded px-1 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
    "md:flex-row md:justify-start md:gap-2 md:px-2.5 md:text-xs",
    primary
      ? "-top-[26px] z-20 text-amber-300 md:top-0"
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
            ? "flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/70 bg-[#0b0e14] text-[28px] leading-none text-amber-300 shadow-lg shadow-amber-950/40 md:h-auto md:w-auto md:border-0 md:bg-transparent md:text-base md:shadow-none"
            : "text-base leading-none md:text-sm"
        }
      >
        {glyph}
      </span>
      {!primary && <span className="md:hidden">{label}</span>}
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

  const focusReadySignal = () => {
    if (window.location.pathname !== "/") {
      window.sessionStorage.setItem("fse:focus-ready-signal", "1");
      window.location.assign("/#scanner");
      return;
    }

    window.dispatchEvent(new Event("fse:focus-ready-signal"));
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 bg-[#0b0e14]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-52 md:grid-cols-1 md:content-start md:border-r md:border-zinc-800 md:bg-transparent md:px-2 md:py-4 md:backdrop-blur-none"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 42"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-0 h-[42px] w-full overflow-visible md:hidden"
      >
        <path
          d="M0 1 H430 C448 1 451 11 458 22 C467 36 480 40 500 40 C520 40 533 36 542 22 C549 11 552 1 570 1 H1000"
          fill="none"
          stroke="rgb(63 63 70)"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

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

        if (item.kind === "signal") {
          return (
            <button
              key="signal"
              type="button"
              onClick={focusReadySignal}
              aria-label="Go to first ready signal"
              className={navClassName(true)}
            >
              <NavLabel
                glyph={item.glyph}
                label={item.label}
                desktopLabel={item.desktopLabel}
                primary
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
