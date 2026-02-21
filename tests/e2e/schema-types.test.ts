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
});
