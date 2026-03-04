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

describe("agent workflow eval", () => {
  it("returns confirmation metadata for import dry-run", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-agent-import-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "import.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
          schemas: {
            notes: {
              endpoint: "notes",
              apiFields: [{ fieldId: "title", required: true, kind: "text" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(importPath, JSON.stringify({ contents: [{ title: "note" }] }, null, 2), "utf8");

    const result = runCli(
      ["content", "import", "notes", "--file", importPath, "--dry-run", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.operation).toBe("content.import");
    expect(body.data.requiresConfirmation).toBe(true);
    expect(body.data.riskLevel).toBe("high");
  });

  it("returns confirmation metadata for bulk dry-run", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-agent-bulk-"));
    const filePath = join(workDir, "operations.json");
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [{ action: "create", endpoint: "notes", payload: { title: "n1" } }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(["content", "bulk", "--file", filePath, "--dry-run", "--json"]);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.operation).toBe("content.bulk");
    expect(body.data.requiresConfirmation).toBe(true);
    expect(body.data.riskLevel).toBe("high");
  });

  it("suggests workflows that include dry-run commands", () => {
    const result = runCli(["task", "suggest", "status", "--json"]);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.suggestions[0].stepsPreview.join("\n")).toContain("--dry-run");
  });
});
