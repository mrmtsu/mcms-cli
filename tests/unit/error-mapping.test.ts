import { describe, expect, it } from "vitest";
import { fromHttpStatus } from "../../src/core/errors.js";

describe("http status mapping", () => {
  it("maps 403 to permission exit code", () => {
    const error = fromHttpStatus(403, "forbidden");
    expect(error.code).toBe("FORBIDDEN");
    expect(error.exitCode).toBe(4);
  });

  it("maps 409 to conflict exit code", () => {
    const error = fromHttpStatus(409, "conflict");
    expect(error.code).toBe("CONFLICT");
    expect(error.exitCode).toBe(6);
  });

  it("maps 429 to retryable network exit code", () => {
    const error = fromHttpStatus(429, "rate limited");
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.exitCode).toBe(5);
    expect(error.retryable).toBe(true);
  });
});
