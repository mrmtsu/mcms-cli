import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("validate error contract", () => {
  it("returns stable error envelope when JSON file is invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "microcms-cli-payload-"));
    const payloadPath = join(dir, "payload.json");
    writeFileSync(payloadPath, "{ invalid json", "utf8");

    const result = runCli(["validate", "posts", "--file", payloadPath, "--json"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        retryable: false,
      },
      meta: {
        version: "0.x",
      },
    });
    expect(body.error.message).toContain("Invalid JSON file");
  });
});
