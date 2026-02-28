import { describe, expect, it } from "vitest";
import { CliError } from "../../src/core/errors.js";
import { parseBulkOperations } from "../../src/validation/bulk-operations.js";

describe("bulk operations validation", () => {
  it("parses valid operation definitions", () => {
    const operations = parseBulkOperations({
      operations: [
        { action: "create", endpoint: "notes", payload: { title: "a" } },
        { action: "update", endpoint: "notes", id: "id-1", payload: { title: "b" } },
        { action: "delete", endpoint: "notes", id: "id-2" },
        { action: "status", endpoint: "notes", id: "id-3", status: "PUBLISH" },
      ],
    });

    expect(operations).toHaveLength(4);
  });

  it("rejects invalid definitions", () => {
    expect(() =>
      parseBulkOperations({ operations: [{ action: "create", endpoint: "notes" }] }),
    ).toThrow(CliError);
  });
});
