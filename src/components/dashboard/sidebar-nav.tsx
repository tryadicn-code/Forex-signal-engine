"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PaperOverlayWindow = Window & {
  __fseOpenPaper?: (view: "portfolio" | "journal") => void;
};

const NAV_ITEMS = [
  { kind: "link", href: "/#overview", label: "Home", desktopLabel: "Dashboard", icon: "home" },
  { kind: "paper", label: "Porto", desktopLabel: "Portfolio", icon: "wallet" },
  { kind: "signal", label: "Signal", desktopLabel: "Signal", icon: "signal" },
  { kind: "link", href: "/backtest", label: "Backtest", desktopLabel: "Backtest", icon: "backtest" },
  { kind: "link", href: "/system", label: "System", desktopLabel: "System", icon: "system" },
] as const;

type NavIconName = (typeof NAV_ITEMS)[number]["icon"];

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  if (name === "home") {
    return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></svg>;
  }
  if (name === "wallet") {
    return <svg {...common}><path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 5.5 4H17" /><path d="M16 11h5v4h-5a2 2 0 1 1 0-4Z" /></svg>;
  }
  if (name === "signal") {
    return <svg {...common}><path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" /></svg>;
  }
  if (name === "backtest") {
    return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
}

function MobileNavLabel({
  icon,
  label,
}: {
  icon: NavIconName;
  label: string;
}) {
  return (
    <>
      <NavIcon name={icon} className="h-5 w-5" />
      <span className="leading-none">{label}</span>
    </>
  );
}

function DesktopNavLabel({
  icon,
  label,
  primary = false,
}: {
  icon: NavIconName;
  label: string;
  primary?: boolean;
}) {
  return (
    <>
      <NavIcon
        name={icon}
        className={primary ? "h-4 w-4 text-amber-300" : "h-4 w-4"}
      />
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
                  <MobileNavLabel icon={item.icon} label={item.label} />
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
                  <MobileNavLabel icon={item.icon} label={item.label} />
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={itemClass}
              >
                <MobileNavLabel icon={item.icon} label={item.label} />
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
                  icon={item.icon}
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
                  icon={item.icon}
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
                icon={item.icon}
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
