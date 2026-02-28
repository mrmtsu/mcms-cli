import { describe, expect, it } from "vitest";
import { diffSchemaBundles } from "../../src/core/schema.js";

describe("schema diff", () => {
  it("returns no diff for equivalent bundles", () => {
    const baseline = {
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
    };

    const current = {
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
    };

    const result = diffSchemaBundles(baseline, current);
    expect(result.hasDiff).toBe(false);
    expect(result.endpointsAdded).toEqual([]);
    expect(result.endpointsRemoved).toEqual([]);
    expect(result.endpoints).toEqual([]);
  });

  it("detects endpoint and field differences", () => {
    const baseline = {
      apis: [
        {
          endpoint: "posts",
          api: {
            apiFields: [
              { fieldId: "title", required: true, kind: "text" },
              { fieldId: "legacy", kind: "text" },
              { fieldId: "status", kind: "select", selectItems: ["draft", "published"] },
              { fieldId: "views", kind: "number" },
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
    };

    const current = {
      apis: [
        {
          endpoint: "posts",
          api: {
            apiFields: [
              { fieldId: "title", required: true, kind: "text" },
              { fieldId: "author", kind: "text" },
              {
                fieldId: "status",
                kind: "select",
                selectItems: ["draft", "published", "archived"],
              },
              { fieldId: "views", required: true, kind: "text" },
            ],
          },
        },
        {
          endpoint: "pages",
          api: {
            apiFields: [{ fieldId: "name", kind: "text" }],
          },
        },
      ],
    };

    const result = diffSchemaBundles(baseline, current);
    expect(result.hasDiff).toBe(true);
    expect(result.endpointsAdded).toEqual(["pages"]);
    expect(result.endpointsRemoved).toEqual(["news"]);
    expect(result.summary).toMatchObject({
      endpointsAdded: 1,
      endpointsRemoved: 1,
      fieldsAdded: 1,
      fieldsRemoved: 1,
      fieldsChanged: 2,
    });

    expect(result.endpoints).toEqual([
      {
        endpoint: "posts",
        added: ["author"],
        removed: ["legacy"],
        changed: expect.arrayContaining([
          expect.objectContaining({
            fieldId: "status",
            changes: expect.arrayContaining([
              expect.objectContaining({
                key: "allowedValues",
              }),
            ]),
          }),
          expect.objectContaining({
            fieldId: "views",
            changes: expect.arrayContaining([
              expect.objectContaining({ key: "kind" }),
              expect.objectContaining({ key: "required" }),
            ]),
          }),
        ]),
      },
    ]);
  });
});
