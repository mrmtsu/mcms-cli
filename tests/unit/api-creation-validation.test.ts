import { describe, expect, it } from "vitest";
import { CliError } from "../../src/core/errors.js";
import { parseApiCreatePayload } from "../../src/validation/api-creation.js";

describe("API creation validation", () => {
  it("fills basic API settings from explicit overrides", () => {
    const payload = parseApiCreatePayload(
      {
        apiFields: [{ fieldId: "title", name: "Title", kind: "text", required: true }],
      },
      {
        name: "Blog",
        endpoint: "blogs",
        type: "list",
      },
    );

    expect(payload).toEqual({
      name: "Blog",
      endpoint: "blogs",
      type: "list",
      apiFields: [{ fieldId: "title", name: "Title", kind: "text", required: true }],
    });
  });

  it("checks custom field layout references", () => {
    const payload = parseApiCreatePayload({
      name: "Blog",
      endpoint: "blogs",
      type: "list",
      apiFields: [{ fieldId: "seo", name: "SEO", kind: "custom", customFieldId: "seoBlock" }],
      customFields: [
        {
          fieldId: "seoBlock",
          name: "SEO block",
          fields: [{ fieldId: "title", name: "Title", kind: "text" }],
          fieldOrderByColumn: [["title"]],
        },
      ],
    });

    expect(payload.customFields?.[0].fieldOrderByColumn).toEqual([["title"]]);

    expect(() =>
      parseApiCreatePayload({
        name: "Blog",
        endpoint: "blogs",
        type: "list",
        apiFields: [{ fieldId: "title", name: "Title", kind: "text" }],
        customFields: [
          {
            fieldId: "seoBlock",
            name: "SEO block",
            fields: [{ fieldId: "metaTitle", name: "Title", kind: "text" }],
            fieldOrderByColumn: [["missing"]],
          },
        ],
      }),
    ).toThrow(CliError);
  });

  it("reports structural errors with field paths", () => {
    let error: unknown;
    try {
      parseApiCreatePayload({
        name: "Blog",
        endpoint: "blogs",
        type: "list",
        apiFields: [{ fieldId: "CreatedAt", name: "Created at", kind: "text" }],
        unexpected: true,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe("INVALID_INPUT");
    expect((error as CliError).details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: "apiFields.0.fieldId" }),
          expect.objectContaining({
            path: "",
            message: 'Unrecognized key: "unexpected"',
          }),
        ]),
      }),
    );
  });
});
