import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { patchContentCreatedBy } from "../../src/core/client.js";

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

describe("content created-by client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses management v1 endpoint for content created-by patch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "post-1" }), {
        status: 200,
        headers: {
          "x-request-id": "rid-content-created-by-set",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await patchContentCreatedBy(createContext(), "notes", "post-1", "member-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    const requestInit = firstCall[1] as { method?: string; body?: string };
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v1/contents/notes/post-1/createdBy");
    expect(requestInit.method).toBe("PATCH");
    expect(JSON.parse(requestInit.body ?? "{}")).toEqual({
      createdBy: "member-1",
    });
    expect(result.requestId).toBe("rid-content-created-by-set");
  });
});
