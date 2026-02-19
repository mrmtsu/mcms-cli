import { describe, expect, it } from "vitest";
import { generateTypesFromSchema } from "../../src/core/schema.js";

describe("schema type generation", () => {
  it("generates endpoint interfaces from schema bundle", () => {
    const generated = generateTypesFromSchema({
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
              { fieldId: "status", kind: "select", selectItems: [{ value: "draft" }, { value: "published" }] }
            ]
          }
        }
      ]
    });

    expect(generated.endpointCount).toBe(1);
    expect(generated.code).toContain("export interface PostsContent");
    expect(generated.code).toContain("title: string;");
    expect(generated.code).toContain("views?: number;");
    expect(generated.code).toContain('status?: "draft" | "published";');
    expect(generated.code).toContain('"posts": PostsContent;');
  });

  it("returns warnings for entries without fields", () => {
    const generated = generateTypesFromSchema({
      apis: [{ endpoint: "empty", api: {} }]
    });

    expect(generated.endpointCount).toBe(1);
    expect(generated.warnings.join("\n")).toContain("No fields found");
  });
});
