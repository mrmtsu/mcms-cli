import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { patchContentStatus } from "../../src/core/client.js";

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

describe("content status client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses management v1 endpoint for content status patch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "post-1" }), {
        status: 200,
        headers: {
          "x-request-id": "rid-content-status-set",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await patchContentStatus(createContext(), "notes", "post-1", "PUBLISH");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    const requestInit = firstCall[1] as { method?: string; body?: string };
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v1/contents/notes/post-1/status");
    expect(requestInit.method).toBe("PATCH");
    expect(JSON.parse(requestInit.body ?? "{}")).toEqual({
      status: ["PUBLISH"],
    });
    expect(result.requestId).toBe("rid-content-status-set");
  });
});
