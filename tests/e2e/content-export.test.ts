import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

function writeMockStore(path: string): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        nextId: 1,
        endpoints: {
          notes: {
            "1": {
              title: "note-1",
              views: 10,
              nested: { ignored: true },
            },
            "2": {
              title: "note-2",
              views: 20,
            },
          },
          blogs: {
            a: {
              title: "blog-a",
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

function buildEnv(mockStorePath: string): NodeJS.ProcessEnv {
  return {
    MICROCMS_SERVICE_DOMAIN: "mock",
    MICROCMS_API_KEY: "mock-key",
    MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
  };
}

describe("content export", () => {
  it("exports endpoint data as JSON file", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-export-json-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const outPath = join(workDir, "notes-export.json");
    writeMockStore(mockStorePath);

    const result = runCli(
      ["content", "export", "notes", "--out", outPath, "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      operation: "content.export",
      endpoint: "notes",
      format: "json",
      out: outPath,
      count: 2,
    });

    const exported = JSON.parse(readFileSync(outPath, "utf8"));
    expect(exported.endpoint).toBe("notes");
    expect(exported.totalCount).toBe(2);
    expect(exported.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "1", title: "note-1", views: 10 }),
        expect.objectContaining({ id: "2", title: "note-2", views: 20 }),
      ]),
    );
  });

  it("exports endpoint data as CSV with only scalar fields", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-export-csv-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const outPath = join(workDir, "notes-export.csv");
    writeMockStore(mockStorePath);

    const result = runCli(
      ["content", "export", "notes", "--out", outPath, "--format", "csv", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);

    const csv = readFileSync(outPath, "utf8");
    const [header, ...rows] = csv.trim().split("\n");
    expect(header).toContain("id");
    expect(header).toContain("title");
    expect(header).toContain("views");
    expect(header).not.toContain("nested");
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.includes("note-1"))).toBe(true);
  });

  it("exports all endpoints into a directory", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-export-all-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const outDir = join(workDir, "backup");
    writeMockStore(mockStorePath);

    const result = runCli(
      ["content", "export", "--all", "--out", outDir, "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.operation).toBe("content.export");
    expect(body.data.mode).toBe("all");
    expect(body.data.endpointCount).toBe(2);

    const notes = JSON.parse(readFileSync(join(outDir, "notes.json"), "utf8"));
    const blogs = JSON.parse(readFileSync(join(outDir, "blogs.json"), "utf8"));
    expect(notes.endpoint).toBe("notes");
    expect(blogs.endpoint).toBe("blogs");
  });

  it("skips object APIs on --all export", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-export-all-skip-object-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const outDir = join(workDir, "backup");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {
            notes: {
              "1": { title: "note-1" },
            },
            settings: {
              singleton: { siteName: "demo" },
            },
          },
          schemas: {
            notes: {
              endpoint: "notes",
              apiType: "list",
              apiFields: [{ fieldId: "title", kind: "text" }],
            },
            settings: {
              endpoint: "settings",
              apiType: "object",
              apiFields: [{ fieldId: "siteName", kind: "text" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "export", "--all", "--out", outDir, "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.endpointCount).toBe(1);
    expect(body.data.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ endpoint: "settings" })]),
    );

    expect(existsSync(join(outDir, "notes.json"))).toBe(true);
    expect(existsSync(join(outDir, "settings.json"))).toBe(false);
  });

  it("fails when endpoint is omitted without --all", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-export-invalid-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const outPath = join(workDir, "out.json");
    writeMockStore(mockStorePath);

    const result = runCli(
      ["content", "export", "--out", outPath, "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_INPUT");
  });
});
