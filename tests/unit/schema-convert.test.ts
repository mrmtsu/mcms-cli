import { describe, expect, it } from "vitest";
import { toJsonSchema, type MicroCMSApiSchema } from "@mrmtsu/microcms-schema-adapter";

describe("schema-adapter integration", () => {
  const sampleSchema: MicroCMSApiSchema = {
    apiFields: [
      { fieldId: "title", name: "Title", kind: "text", required: true, isUnique: false },
      { fieldId: "body", name: "Body", kind: "richEditorV2", required: true },
      {
        fieldId: "category",
        name: "Category",
        kind: "select",
        multipleSelect: false,
        selectItems: [
          { id: "tech", value: "Tech" },
          { id: "life", value: "Life" },
        ],
      },
      { fieldId: "views", name: "Views", kind: "number", numberMin: 0 },
    ],
  };

  it("converts microCMS schema to JSON Schema draft-07", () => {
    const result = toJsonSchema(sampleSchema, { title: "blogs" });

    expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(result.type).toBe("object");
    expect(result.title).toBe("blogs");
    expect(result.required).toEqual(["title", "body"]);
    expect(result.properties?.title).toEqual({ type: "string" });
    expect(result.properties?.body).toEqual({ type: "string", contentMediaType: "text/html" });
    expect(result.properties?.category).toEqual({
      type: "string",
      enum: ["Tech", "Life"],
    });
    expect(result.properties?.views).toEqual({ type: "number", minimum: 0 });
  });

  it("includes x-microcms extensions when enabled", () => {
    const result = toJsonSchema(sampleSchema, { includeExtensions: true });
    const prop = result.properties?.title as Record<string, unknown>;

    expect(prop["x-microcms-field-id"]).toBe("title");
    expect(prop["x-microcms-field-name"]).toBe("Title");
    expect(prop["x-microcms-kind"]).toBe("text");
  });

  it("omits extensions by default", () => {
    const result = toJsonSchema(sampleSchema);
    const prop = result.properties?.title as Record<string, unknown>;

    expect(prop["x-microcms-field-id"]).toBeUndefined();
  });

  it("converts multiple endpoints independently", () => {
    const apis = [
      { endpoint: "blogs", api: sampleSchema },
      {
        endpoint: "tags",
        api: {
          apiFields: [
            { fieldId: "name", name: "Name", kind: "text", required: true, isUnique: false },
          ],
        } as MicroCMSApiSchema,
      },
    ];

    const results = Object.fromEntries(
      apis.map((entry) => [entry.endpoint, toJsonSchema(entry.api, { title: entry.endpoint })]),
    );

    expect(Object.keys(results)).toEqual(["blogs", "tags"]);
    expect(results.blogs.title).toBe("blogs");
    expect(results.tags.title).toBe("tags");
    expect(results.tags.required).toEqual(["name"]);
  });
});
