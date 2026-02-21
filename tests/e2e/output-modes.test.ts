import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("human output modes", () => {
  it("supports --plain output", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-plain-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 3,
          endpoints: {
            notes: {
              "1": { title: "n1" },
              "2": { title: "n2" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = {
      MICROCMS_SERVICE_DOMAIN: "mock",
      MICROCMS_API_KEY: "mock-key",
      MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
    };

    const result = runCli(
      ["content", "list", "notes", "--all", "--plain", "--select", "id,title"],
      env,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("id=1");
    expect(result.stdout).toContain("title=n1");
  });

  it("supports --table output", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-table-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 2,
          endpoints: {
            notes: {
              "1": { title: "n1", body: "b1" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = {
      MICROCMS_SERVICE_DOMAIN: "mock",
      MICROCMS_API_KEY: "mock-key",
      MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
    };

    const result = runCli(
      ["content", "list", "notes", "--all", "--table", "--select", "id,title"],
      env,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("id");
    expect(result.stdout).toContain("title");
    expect(result.stdout).toContain("1");
    expect(result.stdout).toContain("n1");
  });
});
