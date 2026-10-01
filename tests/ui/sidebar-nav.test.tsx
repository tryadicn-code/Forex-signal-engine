import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

type PaperOverlayWindow = Window & {
  __fseOpenPaper?: (view: "portfolio" | "journal") => void;
};

afterEach(() => {
  delete (window as PaperOverlayWindow).__fseOpenPaper;
});

describe("SidebarNav interactions", () => {
  it("opens Portfolio through the global paper overlay handler when available", () => {
    const openPaper = vi.fn();
    (window as PaperOverlayWindow).__fseOpenPaper = openPaper;

    render(<SidebarNav />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open paper portfolio" })[0]
    );

    expect(openPaper).toHaveBeenCalledWith("portfolio");
  });

  it("falls back to the paper open event when the direct handler is unavailable", () => {
    const listener = vi.fn();
    window.addEventListener("fse:open-paper", listener);

    render(<SidebarNav />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open paper portfolio" })[0]
    );

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<{
      view?: "portfolio" | "journal";
    }>;
    expect(event.detail?.view).toBe("portfolio");

    window.removeEventListener("fse:open-paper", listener);
  });
});
