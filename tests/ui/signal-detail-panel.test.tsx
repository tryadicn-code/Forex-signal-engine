import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignalDetailPanel } from "@/components/signals/signal-detail-panel";
import { failureResult } from "@/scanner/scanner-result";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/components/signals/price-chart", () => ({
  PriceChart: ({ symbol }: { symbol: string }) => (
    <div aria-label={"Price chart for " + symbol} />
  ),
}));

describe("SignalDetailPanel", () => {
  it("shows empty state when no result is selected", () => {
    render(
      <SignalDetailPanel
        result={null}
        signal={null}
        transitions={[]}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("Select a symbol")).toBeInTheDocument();
  });

  it("renders failure detail when the result failed the pipeline", () => {
    const failed = failureResult(
      "EURUSD",
      "PROVIDER_FAILURE",
      "Missing M15 candle coverage.",
      1_700_000_000_000
    );

    render(
      <SignalDetailPanel
        result={failed}
        signal={null}
        transitions={[]}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByText("Symbol failure")).toBeInTheDocument();
  });
});