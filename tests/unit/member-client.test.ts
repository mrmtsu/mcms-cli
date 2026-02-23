import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { getMember } from "../../src/core/client.js";

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

describe("member client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses management v1 endpoint for member get", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "member-1", name: "Alice" }), {
        status: 200,
        headers: {
          "x-request-id": "rid-member-get",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMember(createContext(), "member-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v1/members/member-1");
    expect(result.requestId).toBe("rid-member-get");
  });
});
