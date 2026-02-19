import { describe, expect, it } from "vitest";
import { extractApiEndpoints } from "../../src/core/schema.js";

describe("completion endpoint extraction", () => {
  it("extracts endpoint names from typical API list responses", () => {
    const endpoints = extractApiEndpoints({
      contents: [{ endpoint: "posts" }, { endpoint: "news" }, { endpoint: "posts" }]
    });

    expect(endpoints).toEqual(["news", "posts"]);
  });

  it("falls back to apiId/id fields", () => {
    const endpoints = extractApiEndpoints({
      apis: [{ apiId: "articles" }, { id: "events" }]
    });

    expect(endpoints).toEqual(["articles", "events"]);
  });
});
