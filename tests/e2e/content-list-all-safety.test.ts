import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

function writeMockStore(path: string, items: number): void {
  const endpointEntries = Object.fromEntries(
    Array.from({ length: items }, (_, index) => [
      String(index + 1),
      { title: `note-${index + 1}` },
    ]),
  );

  writeFileSync(
    path,
    JSON.stringify(
      {
        nextId: items + 1,
        endpoints: {
          notes: endpointEntries,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("content list --all safety", () => {
  it("stops safely when an empty page is reached before totalCount", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-all-stop-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    writeMockStore(mockStorePath, 3);

    const result = runCli(
      ["content", "list", "notes", "--all", "--limit", "2", "--offset", "2", "--json"],
      {
        MICROCMS_SERVICE_DOMAIN: "mock",
        MICROCMS_API_KEY: "mock-key",
        MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
      },
    );

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.contents).toHaveLength(1);
    expect(body.data.totalCount).toBe(3);
    expect(body.data.offset).toBe(2);
  });

  it("fails when merged content count exceeds safety limit", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-all-limit-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    writeMockStore(mockStorePath, 3);

    const result = runCli(["content", "list", "notes", "--all", "--limit", "2", "--json"], {
      MICROCMS_SERVICE_DOMAIN: "mock",
      MICROCMS_API_KEY: "mock-key",
      MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
      MICROCMS_CONTENT_ALL_MAX_ITEMS: "2",
    });

    expect(result.code).toBe(1);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("API_ERROR");
    expect(body.error.message).toContain("safety limit");
  });
});
