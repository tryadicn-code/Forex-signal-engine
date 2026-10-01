"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PaperOverlayWindow = Window & {
  __fseOpenPaper?: (view: "portfolio" | "journal") => void;
};

const NAV_ITEMS = [
  { kind: "link", href: "/#overview", label: "Home", desktopLabel: "Dashboard", glyph: "▦" },
  { kind: "paper", label: "Porto", desktopLabel: "Portfolio", glyph: "◫" },
  { kind: "signal", label: "Signal", desktopLabel: "Signal", glyph: "⚡" },
  { kind: "link", href: "/backtest", label: "Backtest", desktopLabel: "Backtest", glyph: "▥" },
  { kind: "link", href: "/system", label: "System", desktopLabel: "System", glyph: "⚙" },
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
      <span aria-hidden="true" className="text-xl leading-none">
        {glyph}
      </span>
      <span className="leading-none">{label}</span>
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
  const router = useRouter();

  const openPortfolio = () => {
    const browserWindow = window as PaperOverlayWindow;
    if (browserWindow.__fseOpenPaper) {
      browserWindow.__fseOpenPaper("portfolio");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("fse:open-paper", { detail: { view: "portfolio" } })
    );
  };

  const focusReadySignal = () => {
    if (window.location.pathname !== "/") {
      window.sessionStorage.setItem("fse:focus-ready-signal", "1");
      router.push("/#scanner");
      return;
    }

    window.dispatchEvent(new Event("fse:focus-ready-signal"));
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-zinc-800 bg-[#0b0e14]/98 md:hidden"
      >
        <div className="grid h-full grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => {
            const itemClass =
              "relative z-10 flex min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

            if (item.kind === "paper") {
              return (
                <button
                  key="portfolio"
                  type="button"
                  onClick={openPortfolio}
                  aria-label="Open paper portfolio"
                  className={itemClass}
                >
                  <MobileNavLabel glyph={item.glyph} label={item.label} />
                </button>
              );
            }

            if (item.kind === "signal") {
              return (
                <button
                  key="signal"
                  type="button"
                  onClick={focusReadySignal}
                  className={`${itemClass} text-amber-300`}
                >
                  <MobileNavLabel glyph={item.glyph} label={item.label} />
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={itemClass}
              >
                <MobileNavLabel glyph={item.glyph} label={item.label} />
              </Link>
            );
          })}
        </div>
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
                aria-label="Open paper portfolio"
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
