import { describe, expect, it } from "vitest";
import { fromHttpStatus } from "../../src/core/errors.js";
import { printError } from "../../src/core/output.js";

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

  it("includes API error details in JSON mode without verbose", () => {
    const error = fromHttpStatus(400, "bad request", {
      message: "invalid field",
      status: 400,
    });
    const originalWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      printError(
        {
          json: true,
          verbose: false,
          color: false,
          timeoutMs: 10_000,
          retry: 2,
          retryMaxDelayMs: 3_000,
          outputMode: "inspect",
          profileSource: "none",
          serviceDomainSource: "none",
          apiKeySource: "none",
          apiKeySourceDetail: "none",
        },
        error,
      );
    } finally {
      process.stderr.write = originalWrite;
    }

    const body = JSON.parse(stderr);
    expect(body.error.code).toBe("API_ERROR");
    expect(body.error.details).toMatchObject({
      message: "invalid field",
      status: 400,
    });
  });
});
