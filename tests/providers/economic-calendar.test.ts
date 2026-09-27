import { describe, it, expect } from "vitest";
import { NoopEconomicCalendarProvider } from "@/providers/economic-calendar/noop-provider";

describe("NoopEconomicCalendarProvider", () => {
  it("reports SKIPPED rather than claiming news was checked", async () => {
    const provider = new NoopEconomicCalendarProvider();
    const result = await provider.getNewsRisk();
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.evaluationStatus).toBe("SKIPPED");
  });

  // The whole point of the noop: it must never read as "checked and clear".
  it("omits newsPending so an unchecked window cannot be mistaken for clear", async () => {
    const provider = new NoopEconomicCalendarProvider();
    const result = await provider.getNewsRisk();
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.newsPending).toBeUndefined();
  });

  it("keeps the NEWS_BLOCK veto skipped, not satisfied", async () => {
    const provider = new NoopEconomicCalendarProvider();
    const result = await provider.getNewsRisk();
    if (!result.ok) throw new Error("expected ok");
    // The Phase 1 veto treats an absent newsPending as "no provider connected"
    // and stays skipped. A boolean false here would instead SATISFY the check.
    const newsPending = result.data.newsPending;
    const vetoWouldEvaluate = newsPending !== undefined;
    expect(vetoWouldEvaluate).toBe(false);
  });

  it("reports a healthy but inert provider status", () => {
    const provider = new NoopEconomicCalendarProvider();
    const status = provider.getProviderStatus();
    expect(status.state).toBe("CONNECTED");
    expect(status.errorCount).toBe(0);
  });

  it("returns the same SKIPPED answer on repeated calls (no real calendar exists)", async () => {
    const provider = new NoopEconomicCalendarProvider();
    const a = await provider.getNewsRisk();
    const b = await provider.getNewsRisk();
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.data.evaluationStatus).toBe("SKIPPED");
    expect(b.data.evaluationStatus).toBe("SKIPPED");
  });
});
