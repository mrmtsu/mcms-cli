import { describe, expect, it } from "vitest";
import { validatePayload } from "../../src/validation/payload.js";

describe("payload validation v2", () => {
  it("checks field types from schema", () => {
    const schema = {
      apiFields: [
        { fieldId: "title", kind: "text", required: true },
        { fieldId: "views", kind: "number" },
      ],
    };

    const result = validatePayload({ title: "hello", views: "10" }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("views");
  });

  it("checks enum-like values from selectItems", () => {
    const schema = {
      apiFields: [
        {
          fieldId: "status",
          kind: "select",
          selectItems: [{ value: "draft" }, { value: "published" }],
        },
      ],
    };

    const result = validatePayload({ status: "archived" }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("status");
    expect(result.errors.join("\n")).toContain("draft");
  });

  it("avoids type errors for unknown field kinds", () => {
    const schema = {
      apiFields: [
        {
          fieldId: "customField",
          kind: "custom-widget",
        },
      ],
    };

    const result = validatePayload({ customField: { any: "shape" } }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
