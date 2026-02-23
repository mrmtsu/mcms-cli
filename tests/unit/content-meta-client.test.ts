import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { getContentMeta, listContentMeta } from "../../src/core/client.js";

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

describe("content metadata client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses management v1 endpoint for content meta list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ contents: [], totalCount: 0, offset: 0, limit: 10 }), {
        status: 200,
        headers: {
          "x-request-id": "rid-content-meta-list",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listContentMeta(createContext(), "notes", {
      limit: 10,
      offset: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v1/contents/notes");
    expect(requestUrl.searchParams.get("limit")).toBe("10");
    expect(requestUrl.searchParams.get("offset")).toBe("20");
    expect(result.requestId).toBe("rid-content-meta-list");
  });

  it("uses management v1 endpoint for content meta get", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "post-1", status: ["DRAFT"] }), {
        status: 200,
        headers: {
          "x-request-id": "rid-content-meta-get",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getContentMeta(createContext(), "notes", "post-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v1/contents/notes/post-1");
    expect(result.requestId).toBe("rid-content-meta-get");
  });
});
