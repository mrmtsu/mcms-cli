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

describe("schema diff", () => {
  it("reports differences from baseline schema", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-diff-"));
    const baselinePath = join(workDir, "baseline.json");
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      baselinePath,
      JSON.stringify(
        {
          version: "0.x",
          apis: [
            {
              endpoint: "posts",
              api: {
                apiFields: [
                  { fieldId: "title", required: true, kind: "text" },
                  { fieldId: "legacy", kind: "text" },
                ],
              },
            },
            {
              endpoint: "news",
              api: {
                apiFields: [{ fieldId: "headline", kind: "text" }],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

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
                { fieldId: "author", kind: "text" },
              ],
            },
            pages: {
              endpoint: "pages",
              apiFields: [{ fieldId: "name", kind: "text" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["schema", "diff", "--baseline", baselinePath, "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.hasDiff).toBe(true);
    expect(body.data.endpointsAdded).toEqual(["pages"]);
    expect(body.data.endpointsRemoved).toEqual(["news"]);
    expect(body.data.endpoints).toEqual([
      expect.objectContaining({
        endpoint: "posts",
        added: ["author"],
        removed: ["legacy"],
      }),
    ]);
  });

  it("returns exit code 1 with --exit-code when differences exist", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-diff-exit-"));
    const baselinePath = join(workDir, "baseline.json");
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      baselinePath,
      JSON.stringify(
        {
          apis: [
            {
              endpoint: "posts",
              api: {
                apiFields: [{ fieldId: "title", kind: "text" }],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {},
          schemas: {
            posts: {
              endpoint: "posts",
              apiFields: [{ fieldId: "title", kind: "number" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["schema", "diff", "--baseline", baselinePath, "--exit-code", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.data.hasDiff).toBe(true);
  });

  it("keeps exit code 0 with --exit-code when there is no difference", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-schema-diff-none-"));
    const baselinePath = join(workDir, "baseline.json");
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      baselinePath,
      JSON.stringify(
        {
          apis: [
            {
              endpoint: "posts",
              api: {
                apiFields: [{ fieldId: "title", kind: "text" }],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

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
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["schema", "diff", "--baseline", baselinePath, "--exit-code", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.hasDiff).toBe(false);
  });
});
