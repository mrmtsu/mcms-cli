import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { listMedia } from "../../src/core/client.js";

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

describe("media client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses management v2 endpoint for media list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ media: [], totalCount: 0, token: "next-token" }), {
        status: 200,
        headers: {
          "x-request-id": "rid-media-list",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listMedia(createContext(), {
      limit: 20,
      imageOnly: true,
      fileName: "logo",
      token: "abc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v2/media");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
    expect(requestUrl.searchParams.get("imageOnly")).toBe("true");
    expect(requestUrl.searchParams.get("fileName")).toBe("logo");
    expect(requestUrl.searchParams.get("token")).toBe("abc");
    expect(result.requestId).toBe("rid-media-list");
  });
});
