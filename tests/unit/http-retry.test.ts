import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/core/http.js";

describe("http retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries retryable status and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"rate"}', {
          status: 429,
          headers: {
            "retry-after": "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "x-request-id": "rid-2",
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await requestJson<{ ok: boolean }>({
      url: "https://example.test/api",
      apiKey: "k",
      timeoutMs: 1000,
      retry: 1,
      retryMaxDelayMs: 100,
      method: "GET",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data.ok).toBe(true);
    expect(result.requestId).toBe("rid-2");
  });

  it("adds retry diagnostics when retries are exhausted", async () => {
    const error = new Error("connection reset") as Error & { code?: string };
    error.code = "ECONNRESET";

    const fetchMock = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestJson({
        url: "https://example.test/api",
        apiKey: "k",
        timeoutMs: 1000,
        retry: 2,
        retryMaxDelayMs: 10,
        method: "GET",
      }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
      details: {
        retry: {
          retriesUsed: 2,
          maxAttempts: 3,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-idempotent write methods by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"message":"temporary"}', {
        status: 429,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestJson({
        url: "https://example.test/api",
        apiKey: "k",
        timeoutMs: 1000,
        retry: 3,
        retryMaxDelayMs: 10,
        method: "POST",
        body: { title: "x" },
      }),
    ).rejects.toMatchObject({
      details: {
        retry: {
          maxAttempts: 1,
          policy: {
            allowed: false,
            reason: "unsafe_method",
          },
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries write methods when idempotency key header is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"temporary"}', {
          status: 429,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "ok" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestJson({
      url: "https://example.test/api",
      apiKey: "k",
      timeoutMs: 1000,
      retry: 1,
      retryMaxDelayMs: 10,
      method: "POST",
      body: { title: "x" },
      headers: {
        "Idempotency-Key": "req-1",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ id: "ok" });
  });

  it("redacts query string from verbose retry-skip logs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"message":"temporary"}', {
        status: 429,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await expect(
      requestJson({
        url: "https://example.test/api/v1/posts?draftKey=secret-value&token=abc",
        apiKey: "k",
        timeoutMs: 1000,
        retry: 2,
        retryMaxDelayMs: 10,
        method: "POST",
        verbose: true,
      }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });

    const logs = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
    expect(logs).not.toContain("secret-value");
    expect(logs).not.toContain("token=abc");
    expect(logs).toContain("https://example.test/api/v1/posts");
  });

  it("does not emit retry logs when verbose is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"rate"}', {
          status: 429,
          headers: {
            "retry-after": "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const result = await requestJson<{ ok: boolean }>({
      url: "https://example.test/api",
      apiKey: "k",
      timeoutMs: 1000,
      retry: 1,
      retryMaxDelayMs: 100,
      method: "GET",
      verbose: false,
    });

    expect(result.data.ok).toBe(true);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("emits retry logs when verbose is true", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"rate"}', {
          status: 429,
          headers: {
            "retry-after": "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const result = await requestJson<{ ok: boolean }>({
      url: "https://example.test/api",
      apiKey: "k",
      timeoutMs: 1000,
      retry: 1,
      retryMaxDelayMs: 100,
      method: "GET",
      verbose: true,
    });

    expect(result.data.ok).toBe(true);
    const logs = stderrSpy.mock.calls.map((call) => String(call[0])).join("");
    expect(logs).toContain("[retry]");
    expect(logs).toContain("attempt 1/2");
  });
});
