import { describe, expect, it } from "vitest";
import { getOperationConfirmation } from "../../src/core/operation-risk.js";

describe("operation risk policy", () => {
  it("marks destructive operations with confirmation requirements", () => {
    const policy = getOperationConfirmation("content.delete");
    expect(policy.requiresConfirmation).toBe(true);
    expect(policy.riskLevel).toBe("high");
    expect(policy.confirmationReason).toBeTruthy();
  });

  it("returns low risk defaults for unknown operations", () => {
    const policy = getOperationConfirmation("unknown.operation");
    expect(policy.requiresConfirmation).toBe(false);
    expect(policy.riskLevel).toBe("low");
    expect(policy.confirmationReason).toBeNull();
  });
});
