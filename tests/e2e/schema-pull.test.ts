import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

function buildMockStore(workDir: string): { mockStorePath: string; env: NodeJS.ProcessEnv } {
  const mockStorePath = join(workDir, "mock-content-store.json");
  writeFileSync(
    mockStorePath,
    JSON.stringify(
      {
        nextId: 1,
        endpoints: {},
        schemas: {
          blogs: {
            endpoint: "blogs",
            apiFields: [
              { fieldId: "title", required: true, kind: "text", name: "Title", isUnique: false },
              { fieldId: "body", required: true, kind: "richEditorV2", name: "Body" },
              {
                fieldId: "category",
                kind: "select",
                name: "Category",
                multipleSelect: false,
                selectItems: [
                  { id: "tech", value: "Tech" },
                  { id: "life", value: "Life" },
                ],
              },
            ],
          },
          tags: {
            endpoint: "tags",
            apiFields: [
              { fieldId: "name", required: true, kind: "text", name: "Name", isUnique: false },
            ],
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    mockStorePath,
    env: {
      MICROCMS_SERVICE_DOMAIN: "mock",
      MICROCMS_API_KEY: "mock-key",
      MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
    },
  };
}

describe("schema pull", () => {
  it("rejects unknown --format value", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-pull-"));
    const { env } = buildMockStore(workDir);
    const outPath = join(workDir, "out.json");

    const result = runCli(
      ["schema", "pull", "--format", "invalid", "--out", outPath, "--json"],
      env,
    );
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("invalid");
  });

  it("outputs JSON Schema with --format json-schema", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-pull-json-schema-"));
    const { env } = buildMockStore(workDir);
    const outPath = join(workDir, "schema.json");

    const result = runCli(
      ["schema", "pull", "--format", "json-schema", "--out", outPath, "--json"],
      env,
    );
    expect(result.code).toBe(0);
    expect(existsSync(outPath)).toBe(true);

    const output = JSON.parse(readFileSync(outPath, "utf8"));
    // Multiple endpoints → keyed by endpoint name
    expect(output.blogs).toBeDefined();
    expect(output.blogs.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(output.blogs.properties.title).toEqual({ type: "string" });
    expect(output.blogs.required).toEqual(["title", "body"]);
    expect(output.tags).toBeDefined();
    expect(output.tags.properties.name).toEqual({ type: "string" });

    const body = JSON.parse(result.stdout);
    expect(body.data.format).toBe("json-schema");
  });

  it("outputs single JSON Schema when single endpoint specified", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-pull-single-"));
    const { env } = buildMockStore(workDir);
    const outPath = join(workDir, "blogs-schema.json");

    const result = runCli(
      [
        "schema",
        "pull",
        "--format",
        "json-schema",
        "--endpoints",
        "blogs",
        "--out",
        outPath,
        "--json",
      ],
      env,
    );
    expect(result.code).toBe(0);

    const output = JSON.parse(readFileSync(outPath, "utf8"));
    // Single endpoint → direct JSON Schema object
    expect(output.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(output.title).toBe("blogs");
    expect(output.properties.title).toEqual({ type: "string" });
  });

  it("includes x-microcms extensions with --include-extensions", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-pull-ext-"));
    const { env } = buildMockStore(workDir);
    const outPath = join(workDir, "schema.json");

    const result = runCli(
      [
        "schema",
        "pull",
        "--format",
        "json-schema",
        "--include-extensions",
        "--endpoints",
        "blogs",
        "--out",
        outPath,
        "--json",
      ],
      env,
    );
    expect(result.code).toBe(0);

    const output = JSON.parse(readFileSync(outPath, "utf8"));
    expect(output.properties.title["x-microcms-field-id"]).toBe("title");
    expect(output.properties.title["x-microcms-kind"]).toBe("text");
  });

  it("outputs microcms format by default", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-pull-default-"));
    const { env } = buildMockStore(workDir);
    const outPath = join(workDir, "schema.json");

    const result = runCli(["schema", "pull", "--out", outPath, "--json"], env);
    expect(result.code).toBe(0);

    const output = JSON.parse(readFileSync(outPath, "utf8"));
    // microCMS bundle format
    expect(output.version).toBe("0.x");
    expect(output.apis).toBeDefined();

    const body = JSON.parse(result.stdout);
    expect(body.data.format).toBe("microcms");
  });
});
