import { describe, expect, it } from "vitest";
import { decideExecution, explainDecision } from "@/core/execution";
import type { DecisionInput } from "@/core/execution";

describe("decideExecution", () => {
  it("returns EXECUTE when setup, trigger and risk all pass", () => {
    const input: DecisionInput = {
      setupValid: true,
      triggerTriggered: true,
      riskCleared: true,
    };
    expect(decideExecution(input)).toBe("EXECUTE");
  });

  it("returns WAIT when the setup is valid but the trigger has not fired", () => {
    const input: DecisionInput = {
      setupValid: true,
      triggerTriggered: false,
      riskCleared: true,
    };
    expect(decideExecution(input)).toBe("WAIT");
  });

  it("returns BLOCKED when risk guards fail on a valid setup", () => {
    const input: DecisionInput = {
      setupValid: true,
      triggerTriggered: true,
      riskCleared: false,
    };
    expect(decideExecution(input)).toBe("BLOCKED");
  });

  it("returns INVALIDATED when the setup is no longer valid, regardless of other gates", () => {
    const input: DecisionInput = {
      setupValid: false,
      triggerTriggered: true,
      riskCleared: true,
    };
    expect(decideExecution(input)).toBe("INVALIDATED");
  });

  it("treats INVALIDATED as higher priority than BLOCKED", () => {
    const input: DecisionInput = {
      setupValid: false,
      triggerTriggered: true,
      riskCleared: false,
    };
    expect(decideExecution(input)).toBe("INVALIDATED");
  });

  it("returns WAIT by default when only risk has cleared", () => {
    const input: DecisionInput = {
      setupValid: true,
      triggerTriggered: false,
      riskCleared: true,
    };
    expect(decideExecution(input)).toBe("WAIT");
  });
});

describe("explainDecision", () => {
  it.each([
    ["EXECUTE"],
    ["WAIT"],
    ["BLOCKED"],
    ["INVALIDATED"],
  ] as const)("returns a non-empty explanation for %s", (decision) => {
    expect(explainDecision(decision).length).toBeGreaterThan(0);
  });
});
