import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import {
  createContent,
  deleteContent,
  getContent,
  listContent,
  updateContent,
} from "../../src/core/client.js";

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

describe("content client http unification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the same HTTP path shape for list/get/create/update/delete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ contents: [], totalCount: 0, offset: 0, limit: 1 }), {
          status: 200,
          headers: { "x-request-id": "rid-list" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "post-1", title: "hello" }), {
          status: 200,
          headers: { "x-request-id": "rid-get" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "post-2", title: "created" }), {
          status: 201,
          headers: { "x-request-id": "rid-create" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "post-2" }), {
          status: 200,
          headers: { "x-request-id": "rid-update" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { "x-request-id": "rid-delete" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const ctx = createContext();

    const listed = await listContent(ctx, "notes", { limit: 1, offset: 0 });
    expect(listed.requestId).toBe("rid-list");

    const got = await getContent(ctx, "notes", "post-1");
    expect(got.requestId).toBe("rid-get");

    const created = await createContent(ctx, "notes", { title: "created" });
    expect(created.requestId).toBe("rid-create");

    const updated = await updateContent(ctx, "notes", "post-2", { title: "updated" });
    expect(updated.requestId).toBe("rid-update");

    const deleted = await deleteContent(ctx, "notes", "post-2");
    expect(deleted.requestId).toBe("rid-delete");
    expect(deleted.data).toMatchObject({
      id: "post-2",
      deleted: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);

    const listUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(listUrl.origin).toBe("https://example.microcms.io");
    expect(listUrl.pathname).toBe("/api/v1/notes");
    expect(listUrl.searchParams.get("limit")).toBe("1");
    expect(listUrl.searchParams.get("offset")).toBe("0");

    const getUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(getUrl.pathname).toBe("/api/v1/notes/post-1");

    const createUrl = new URL(String(fetchMock.mock.calls[2]?.[0]));
    const createInit = fetchMock.mock.calls[2]?.[1] as { method?: string };
    expect(createUrl.pathname).toBe("/api/v1/notes");
    expect(createInit.method).toBe("POST");

    const updateUrl = new URL(String(fetchMock.mock.calls[3]?.[0]));
    const updateInit = fetchMock.mock.calls[3]?.[1] as { method?: string };
    expect(updateUrl.pathname).toBe("/api/v1/notes/post-2");
    expect(updateInit.method).toBe("PATCH");

    const deleteUrl = new URL(String(fetchMock.mock.calls[4]?.[0]));
    const deleteInit = fetchMock.mock.calls[4]?.[1] as { method?: string };
    expect(deleteUrl.pathname).toBe("/api/v1/notes/post-2");
    expect(deleteInit.method).toBe("DELETE");
  });
});
