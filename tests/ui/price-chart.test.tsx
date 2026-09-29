import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PriceChart } from "@/components/signals/price-chart";
import type { PriceChartResponse } from "@/types/chart";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function payload(timeframe: "M15" | "H1" | "H4" | "D1"): PriceChartResponse {
  return {
    symbol: "EURUSD",
    timeframe,
    source: "mock",
    asOf: T0,
    pricePrecision: 5,
    candles: Array.from({ length: 60 }, (_, index) => {
      const base = 1.08 + index * 0.0001;
      return {
        timestamp: T0 - (60 - index) * 60_000,
        open: base,
        high: base + 0.0002,
        low: base - 0.0002,
        close: base + 0.0001,
      };
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Phase 3 price chart", () => {
  it("loads H1 candles only when the chart component is mounted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload("H1"),
      })
    );

    render(<PriceChart symbol="EURUSD" asOf={T0} />);

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: /EURUSD H1 candlestick chart/i })
      ).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("timeframe=H1");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("asOf=" + T0);
  });

  it("switches timeframe and requests new candles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const value = String(input);
        const timeframe = value.includes("timeframe=M15") ? "M15" : "H1";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => payload(timeframe),
        });
      })
    );

    render(<PriceChart symbol="EURUSD" asOf={T0} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "M15" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("img", { name: /EURUSD M15 candlestick chart/i })
      ).toBeInTheDocument();
    });
  });
});
