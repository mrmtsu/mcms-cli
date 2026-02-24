import { describe, expect, it } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { listContentAllWithFetcher } from "../../src/commands/content.js";

function createContext(): RuntimeContext {
  return {
    json: true,
    verbose: false,
    color: false,
    timeoutMs: 1000,
    retry: 0,
    retryMaxDelayMs: 1000,
    outputMode: "inspect",
    profileSource: "none",
    serviceDomain: "example",
    serviceDomainSource: "option",
    apiKey: "test-api-key",
    apiKeySource: "option",
    apiKeySourceDetail: "option",
  };
}

describe("content list --all helper", () => {
  it("fails when totalCount changes between pages", async () => {
    let calls = 0;
    await expect(
      listContentAllWithFetcher(createContext(), "notes", { limit: 1, offset: 0 }, async () => {
        calls += 1;
        if (calls === 1) {
          return {
            data: { contents: [{ id: "1" }], totalCount: 3 },
            requestId: "rid-1",
          };
        }

        return {
          data: { contents: [{ id: "2" }], totalCount: 2 },
          requestId: "rid-2",
        };
      }),
    ).rejects.toMatchObject({
      code: "API_ERROR",
    });
  });
});
