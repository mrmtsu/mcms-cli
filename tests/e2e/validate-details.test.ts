import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

function buildEnv(mockStorePath: string): NodeJS.ProcessEnv {
  return {
    MICROCMS_SERVICE_DOMAIN: "mock",
    MICROCMS_API_KEY: "mock-key",
    MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
  };
}

describe("validate diagnostics", () => {
  it("returns structured validation details in JSON mode without --verbose", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-validate-details-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const payloadPath = join(workDir, "payload.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
          schemas: {
            notes: {
              endpoint: "notes",
              apiFields: [
                { fieldId: "title", required: true, kind: "text" },
                { fieldId: "status", kind: "select", selectItems: ["draft", "published"] },
              ],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(payloadPath, JSON.stringify({ status: "archived" }, null, 2), "utf8");

    const result = runCli(
      ["validate", "notes", "--file", payloadPath, "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("Required field is missing: title");
    expect(body.error.details).toBeDefined();
    expect(body.error.details.strictWarnings).toBe(false);
    expect(body.error.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REQUIRED_FIELD_MISSING",
          field: "title",
          path: "$.title",
        }),
        expect.objectContaining({
          code: "FIELD_VALUE_OUT_OF_RANGE",
          field: "status",
          path: "$.status",
        }),
      ]),
    );
  });
});
