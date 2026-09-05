import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { createApi } from "../../src/core/client.js";
import type { ApiCreatePayload } from "../../src/validation/api-creation.js";

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

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an API through management v1 and opts into additional charge explicitly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ endpoint: "blogs", id: "api-1" }), {
        status: 201,
        headers: {
          "x-request-id": "rid-api-create",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      name: "Blog",
      endpoint: "blogs",
      type: "list",
      apiFields: [{ fieldId: "title", name: "Title", kind: "text", required: true }],
      customFields: [],
    } satisfies ApiCreatePayload;

    const result = await createApi(createContext(), payload, {
      allowAdditionalCharge: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    const requestInit = firstCall[1] as { body?: string; method?: string };
    expect(requestUrl.origin).toBe("https://example.microcms-management.io");
    expect(requestUrl.pathname).toBe("/api/v1/apis");
    expect(requestUrl.searchParams.get("allowAdditionalCharge")).toBe("true");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(requestInit.body ?? "null")).toEqual(payload);
    expect(result.data).toEqual({ endpoint: "blogs", id: "api-1" });
    expect(result.requestId).toBe("rid-api-create");
  });

  it("does not send an additional-charge query by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      name: "Blog",
      endpoint: "blogs",
      type: "list",
      apiFields: [{ fieldId: "title", name: "Title", kind: "text" }],
    } satisfies ApiCreatePayload;

    await createApi(createContext(), payload);

    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(firstCall[0]));
    expect(requestUrl.search).toBe("");
  });
});
