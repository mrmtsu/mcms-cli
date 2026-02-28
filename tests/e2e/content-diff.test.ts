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

describe("content diff", () => {
  it("shows added/removed/changed fields between published and draft", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-diff-"));
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {
            notes: {
              "1": {
                title: "Published",
                body: "Same",
                oldField: "legacy",
                updatedAt: "2026-02-20T00:00:00.000Z",
              },
            },
          },
          drafts: {
            notes: {
              "1": {
                "dk-1": {
                  title: "Draft",
                  body: "Same",
                  newField: "added",
                  updatedAt: "2026-02-28T00:00:00.000Z",
                },
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "diff", "notes", "1", "--draft-key", "dk-1", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      operation: "content.diff",
      endpoint: "notes",
      id: "1",
      draftKey: "dk-1",
      hasDiff: true,
      added: [expect.objectContaining({ field: "newField", value: "added" })],
      removed: [expect.objectContaining({ field: "oldField", value: "legacy" })],
      changed: [expect.objectContaining({ field: "title", before: "Published", after: "Draft" })],
    });
  });

  it("ignores standard metadata fields and reports no diff", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-diff-same-"));
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {
            notes: {
              "1": {
                title: "Same",
                updatedAt: "2026-02-20T00:00:00.000Z",
              },
            },
          },
          drafts: {
            notes: {
              "1": {
                "dk-1": {
                  title: "Same",
                  updatedAt: "2026-02-28T00:00:00.000Z",
                },
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "diff", "notes", "1", "--draft-key", "dk-1", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.hasDiff).toBe(false);
    expect(body.data.added).toEqual([]);
    expect(body.data.removed).toEqual([]);
    expect(body.data.changed).toEqual([]);
  });

  it("fails when draft content is not found", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-diff-missing-"));
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {
            notes: {
              "1": { title: "Published" },
            },
          },
          drafts: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "diff", "notes", "1", "--draft-key", "invalid", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("NOT_FOUND");
  });

  it("renders readable diff in plain output mode", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-diff-plain-"));
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: { "1": { title: "Published", oldField: "legacy" } } },
          drafts: {
            notes: {
              "1": { "dk-1": { title: "Draft", newField: "added" } },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "diff", "notes", "1", "--draft-key", "dk-1", "--plain"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("+ newField: added");
    expect(result.stdout).toContain("- oldField: legacy");
    expect(result.stdout).toContain("~ title: Published -> Draft");
  });

  it("renders row-based diff in table output mode", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-diff-table-"));
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: { "1": { title: "Published" } } },
          drafts: {
            notes: {
              "1": { "dk-1": { title: "Draft", newField: "added" } },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "diff", "notes", "1", "--draft-key", "dk-1", "--table"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("type");
    expect(result.stdout).toContain("field");
    expect(result.stdout).toContain("added");
    expect(result.stdout).toContain("changed");
  });
});
