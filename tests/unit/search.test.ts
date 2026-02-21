import { describe, expect, it } from "vitest";
import { rankSearchHits, type SearchHit } from "../../src/core/search.js";

describe("search ranking", () => {
  it("ranks hits by query match score and respects limit", () => {
    const hits: SearchHit[] = [
      {
        kind: "command",
        title: "microcms content list",
        ref: "content list",
        snippet: "list content",
        score: 0,
        source: "local",
      },
      {
        kind: "doc",
        title: "コンテンツ一覧取得API",
        ref: "content-api/コンテンツ一覧取得API.md",
        snippet: "content-api コンテンツ一覧取得API.md",
        score: 0,
        source: "mcp",
        category: "content-api",
        filename: "コンテンツ一覧取得API.md",
      },
      {
        kind: "command",
        title: "microcms spec",
        ref: "spec",
        snippet: "output machine-readable CLI spec",
        score: 0,
        source: "local",
      },
    ];

    const ranked = rankSearchHits("content", hits, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].title).toContain("content");
  });
});
