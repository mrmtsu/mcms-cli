import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("auth status contract", () => {
  it("returns stable success envelope", () => {
    const result = runCli(["auth", "status", "--json"]);
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body).toMatchObject({
      ok: true,
      data: {
        apiKeyAvailable: false,
        apiKeySource: "none",
      },
      meta: {
        version: "0.x",
      },
    });
    expect(body.meta).toHaveProperty("requestId");
  });
});
