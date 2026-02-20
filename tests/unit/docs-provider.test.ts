import { describe, expect, it } from "vitest";
import { parseDocsSourceOption, truncateMarkdown } from "../../src/core/docs/provider.js";

describe("docs provider helpers", () => {
  it("parses docs source option", () => {
    expect(parseDocsSourceOption(undefined)).toBe("auto");
    expect(parseDocsSourceOption("mcp")).toBe("mcp");
    expect(parseDocsSourceOption("local")).toBe("local");
  });

  it("truncates markdown by max chars", () => {
    const result = truncateMarkdown("abcdefghij", 5);
    expect(result.truncated).toBe(true);
    expect(result.originalLength).toBe(10);
    expect(result.markdown).toContain("abcde");
  });
});
