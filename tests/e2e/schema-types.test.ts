import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("schema/types commands", () => {
  it("generates declaration file from local schema", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-types-"));
    const schemaPath = join(workDir, "schema.json");
    const outPath = join(workDir, "microcms-types.d.ts");

    writeFileSync(
      schemaPath,
      JSON.stringify(
        {
          version: "0.x",
          pulledAt: "2026-01-01T00:00:00.000Z",
          serviceDomain: "example",
          apis: [
            {
              endpoint: "posts",
              api: {
                apiFields: [
                  { fieldId: "title", required: true, kind: "text" },
                  { fieldId: "views", kind: "number" },
                ],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli([
      "types",
      "generate",
      "--schema",
      schemaPath,
      "--out",
      outPath,
      "--json",
    ]);
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.out).toBe(outPath);
    expect(body.data.endpointCount).toBe(1);
    expect(existsSync(outPath)).toBe(true);

    const content = readFileSync(outPath, "utf8");
    expect(content).toContain("interface PostsContent");
    expect(content).toContain("title: string;");
    expect(content).toContain("views?: number;");
  });

  it("syncs schema from management API and generates types", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-types-sync-"));
    const outPath = join(workDir, "microcms-types.d.ts");
    const schemaOutPath = join(workDir, "microcms-schema.json");
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
          schemas: {
            posts: {
              endpoint: "posts",
              apiFields: [
                { fieldId: "title", required: true, kind: "text" },
                { fieldId: "views", kind: "number" },
              ],
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
      ["types", "sync", "--out", outPath, "--schema-out", schemaOutPath, "--json"],
      env,
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      out: outPath,
      schemaOut: schemaOutPath,
      endpointCount: 1,
      source: "management_api",
    });
    expect(existsSync(outPath)).toBe(true);
    expect(existsSync(schemaOutPath)).toBe(true);

    const typesContent = readFileSync(outPath, "utf8");
    expect(typesContent).toContain("interface PostsContent");
    expect(typesContent).toContain("title: string;");
    expect(typesContent).toContain("views?: number;");

    const schemaContent = JSON.parse(readFileSync(schemaOutPath, "utf8"));
    expect(schemaContent.apis).toEqual(
      expect.arrayContaining([expect.objectContaining({ endpoint: "posts" })]),
    );
  });

  it("supports endpoint filtering with types sync", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-types-sync-endpoints-"));
    const outPath = join(workDir, "microcms-types.d.ts");
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
          schemas: {
            posts: {
              endpoint: "posts",
              apiFields: [{ fieldId: "title", kind: "text" }],
            },
            news: {
              endpoint: "news",
              apiFields: [{ fieldId: "headline", kind: "text" }],
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
      ["types", "sync", "--out", outPath, "--endpoints", "posts", "--json"],
      env,
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.endpointCount).toBe(1);

    const typesContent = readFileSync(outPath, "utf8");
    expect(typesContent).toContain("interface PostsContent");
    expect(typesContent).not.toContain("interface NewsContent");
  });
});
