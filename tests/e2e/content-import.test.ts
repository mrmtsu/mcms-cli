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

describe("content import", () => {
  it("imports contents from export-like JSON file", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-import-json-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "contents.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      importPath,
      JSON.stringify(
        {
          endpoint: "notes",
          totalCount: 2,
          contents: [{ title: "note-a" }, { title: "note-b" }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    const imported = runCli(["content", "import", "notes", "--file", importPath, "--json"], env);
    expect(imported.code).toBe(0);

    const importedBody = JSON.parse(imported.stdout);
    expect(importedBody.data).toMatchObject({
      operation: "content.import",
      endpoint: "notes",
      total: 2,
      created: 2,
      updated: 0,
    });

    const listed = runCli(["content", "list", "notes", "--all", "--json"], env);
    expect(listed.code).toBe(0);
    const listedBody = JSON.parse(listed.stdout);
    expect(listedBody.data.totalCount).toBe(2);
    expect(listedBody.data.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "note-a" }),
        expect.objectContaining({ title: "note-b" }),
      ]),
    );
  });

  it("supports upsert: update existing id and create missing id", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-import-upsert-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "upsert.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 10,
          endpoints: {
            notes: {
              "item-1": { title: "old-title" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      importPath,
      JSON.stringify(
        {
          contents: [
            { id: "item-1", title: "updated-title" },
            { id: "item-404", title: "created-title" },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    const imported = runCli(
      ["content", "import", "notes", "--file", importPath, "--upsert", "--json"],
      env,
    );
    expect(imported.code).toBe(0);
    const importedBody = JSON.parse(imported.stdout);
    expect(importedBody.data).toMatchObject({
      total: 2,
      created: 1,
      updated: 1,
      upsert: true,
    });

    const listed = runCli(["content", "list", "notes", "--all", "--json"], env);
    expect(listed.code).toBe(0);
    const listedBody = JSON.parse(listed.stdout);
    expect(listedBody.data.totalCount).toBe(2);
    expect(listedBody.data.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "item-1", title: "updated-title" }),
        expect.objectContaining({ title: "created-title" }),
      ]),
    );
  });

  it("validates against API schema in dry-run mode", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-import-dryrun-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "invalid.json");

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

    writeFileSync(
      importPath,
      JSON.stringify(
        {
          contents: [{ status: "archived" }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    const imported = runCli(
      ["content", "import", "notes", "--file", importPath, "--dry-run", "--json"],
      env,
    );
    expect(imported.code).toBe(2);
    const errorBody = JSON.parse(imported.stderr);
    expect(errorBody.error.code).toBe("INVALID_INPUT");
    expect(errorBody.error.message).toContain("dry-run");

    const listed = runCli(["content", "list", "notes", "--all", "--json"], env);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout).data.totalCount).toBe(0);
  });

  it("fails with strict warnings when unknown fields are included", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-import-strict-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "strict.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
          schemas: {
            notes: {
              endpoint: "notes",
              apiFields: [{ fieldId: "title", kind: "text" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      importPath,
      JSON.stringify(
        {
          contents: [{ title: "ok", unknownField: "warn" }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      [
        "content",
        "import",
        "notes",
        "--file",
        importPath,
        "--dry-run",
        "--strict-warnings",
        "--json",
      ],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("validation");
  });

  it("validates interval option", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-import-interval-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "contents.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(importPath, JSON.stringify([{ title: "hello" }], null, 2), "utf8");

    const result = runCli(
      ["content", "import", "notes", "--file", importPath, "--interval", "abc", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_INPUT");
  });

  it("prints progress lines in non-json mode", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-import-progress-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const importPath = join(workDir, "contents.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(importPath, JSON.stringify([{ title: "a" }, { title: "b" }], null, 2), "utf8");

    const result = runCli(
      ["content", "import", "notes", "--file", importPath],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("[1/2] Created:");
    expect(result.stderr).toContain("[2/2] Created:");
  });
});
