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

  it("requires 10-character select item IDs in API and custom fields", () => {
    const payload = {
      name: "Bookmarks",
      endpoint: "bookmarks",
      type: "list",
      apiFields: [
        {
          fieldId: "category",
          name: "Category",
          kind: "select",
          selectItems: [{ id: "1234567890", value: "Article" }],
        },
      ],
      customFields: [
        {
          fieldId: "details",
          name: "Details",
          fields: [
            {
              fieldId: "status",
              name: "Status",
              kind: "select",
              selectItems: [{ id: "abcdefghij", value: "Ready" }],
            },
          ],
          fieldOrderByColumn: [["status"]],
        },
      ],
    };

    expect(parseApiCreatePayload(payload)).toEqual(payload);

    const invalid = {
      ...payload,
      apiFields: [{ ...payload.apiFields[0], selectItems: [{ id: "short", value: "Article" }] }],
      customFields: [
        {
          ...payload.customFields[0],
          fields: [
            {
              ...payload.customFields[0].fields[0],
              selectItems: [{ id: "12345678901", value: "Ready" }],
            },
          ],
        },
      ],
    };

    let error: unknown;
    try {
      parseApiCreatePayload(invalid);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: "apiFields.0.selectItems.0.id" }),
          expect.objectContaining({ path: "customFields.0.fields.0.selectItems.0.id" }),
        ]),
      }),
    );
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
