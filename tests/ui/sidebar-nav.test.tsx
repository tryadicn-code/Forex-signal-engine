import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => "/",
}));

describe("SidebarNav portfolio link", () => {
  it("renders Portfolio as a link to /portfolio", () => {
    render(<SidebarNav />);

    const links = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/portfolio");

    expect(links.length).toBeGreaterThan(0);
  });
});