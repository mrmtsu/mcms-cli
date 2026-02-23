import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createClient } from "microcms-js-sdk";
import type { RuntimeContext } from "./context.js";
import { CliError, fromHttpStatus } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";
import { requestFormData, requestJson } from "./http.js";

const MANAGEMENT_BASE_URL_OVERRIDE = process.env.MICROCMS_MANAGEMENT_API_BASE_URL;
const CONTENT_BASE_URL_OVERRIDE = process.env.MICROCMS_CONTENT_API_BASE_URL;
const CONTENT_MOCK_FILE = process.env.MICROCMS_CONTENT_MOCK_FILE;

function assertAuth(
  ctx: RuntimeContext,
): asserts ctx is RuntimeContext & { serviceDomain: string; apiKey: string } {
  if (!ctx.serviceDomain) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Service domain is required. Pass --service-domain or set MICROCMS_SERVICE_DOMAIN.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (!ctx.apiKey) {
    throw new CliError({
      code: "AUTH_FAILED",
      message: "API key is required. Pass --api-key, set MICROCMS_API_KEY, or run auth login.",
      exitCode: EXIT_CODE.AUTH,
    });
  }
}

function getContentClient(ctx: RuntimeContext) {
  assertAuth(ctx);

  return createClient({
    serviceDomain: ctx.serviceDomain,
    apiKey: ctx.apiKey,
  }) as {
    getList(params: { endpoint: string; queries?: Record<string, unknown> }): Promise<unknown>;
    getListDetail(params: {
      endpoint: string;
      contentId: string;
      queries?: Record<string, unknown>;
    }): Promise<unknown>;
    create(params: { endpoint: string; content: Record<string, unknown> }): Promise<unknown>;
    update(params: {
      endpoint: string;
      contentId: string;
      content: Record<string, unknown>;
    }): Promise<unknown>;
    delete(params: { endpoint: string; contentId: string }): Promise<void>;
  };
}

export async function listContent(
  ctx: RuntimeContext,
  endpoint: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  if (CONTENT_MOCK_FILE) {
    return runMockList(endpoint, queries);
  }

  if (CONTENT_BASE_URL_OVERRIDE) {
    const url = buildApiUrl(getContentBaseUrl(ctx.serviceDomain), [endpoint], queries);
    const result = await requestJson<unknown>({
      url,
      apiKey: ctx.apiKey,
      timeoutMs: ctx.timeoutMs,
      retry: ctx.retry,
      retryMaxDelayMs: ctx.retryMaxDelayMs,
      verbose: ctx.verbose,
    });
    return { data: result.data, requestId: result.requestId };
  }

  const client = getContentClient(ctx);
  const data = await client.getList({ endpoint, queries });
  return { data, requestId: null };
}

export async function getContent(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  if (CONTENT_MOCK_FILE) {
    return runMockGet(endpoint, contentId, queries);
  }

  if (CONTENT_BASE_URL_OVERRIDE) {
    const url = buildApiUrl(getContentBaseUrl(ctx.serviceDomain), [endpoint, contentId], queries);
    const result = await requestJson<unknown>({
      url,
      apiKey: ctx.apiKey,
      timeoutMs: ctx.timeoutMs,
      retry: ctx.retry,
      retryMaxDelayMs: ctx.retryMaxDelayMs,
      verbose: ctx.verbose,
    });
    return { data: result.data, requestId: result.requestId };
  }

  const client = getContentClient(ctx);
  const data = await client.getListDetail({ endpoint, contentId, queries });
  return { data, requestId: null };
}

export async function listContentMeta(
  ctx: RuntimeContext,
  endpoint: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx.serviceDomain), ["contents", endpoint], queries);
  const result = await requestJson<unknown>({
    url,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  return { data: result.data, requestId: result.requestId };
}

export async function getContentMeta(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx.serviceDomain), [
    "contents",
    endpoint,
    contentId,
  ]);
  const result = await requestJson<unknown>({
    url,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  return { data: result.data, requestId: result.requestId };
}

export async function createContent(
  ctx: RuntimeContext,
  endpoint: string,
  content: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  if (CONTENT_MOCK_FILE) {
    return runMockCreate(endpoint, content);
  }

  if (CONTENT_BASE_URL_OVERRIDE) {
    const url = buildApiUrl(getContentBaseUrl(ctx.serviceDomain), [endpoint]);
    const result = await requestJson<unknown>({
      url,
      method: "POST",
      apiKey: ctx.apiKey,
      timeoutMs: ctx.timeoutMs,
      retry: ctx.retry,
      retryMaxDelayMs: ctx.retryMaxDelayMs,
      verbose: ctx.verbose,
      body: content,
    });
    return { data: result.data, requestId: result.requestId };
  }

  const client = getContentClient(ctx);
  const data = await client.create({ endpoint, content });
  return { data, requestId: null };
}

export async function updateContent(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
  content: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  if (CONTENT_MOCK_FILE) {
    return runMockUpdate(endpoint, contentId, content);
  }

  if (CONTENT_BASE_URL_OVERRIDE) {
    const url = buildApiUrl(getContentBaseUrl(ctx.serviceDomain), [endpoint, contentId]);
    const result = await requestJson<unknown>({
      url,
      method: "PATCH",
      apiKey: ctx.apiKey,
      timeoutMs: ctx.timeoutMs,
      retry: ctx.retry,
      retryMaxDelayMs: ctx.retryMaxDelayMs,
      verbose: ctx.verbose,
      body: content,
    });
    return { data: result.data, requestId: result.requestId };
  }

  const client = getContentClient(ctx);
  const data = await client.update({ endpoint, contentId, content });
  return { data, requestId: null };
}

export async function deleteContent(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  if (CONTENT_MOCK_FILE) {
    return runMockDelete(endpoint, contentId);
  }

  if (CONTENT_BASE_URL_OVERRIDE) {
    const url = buildApiUrl(getContentBaseUrl(ctx.serviceDomain), [endpoint, contentId]);
    const result = await requestJson<unknown>({
      url,
      method: "DELETE",
      apiKey: ctx.apiKey,
      timeoutMs: ctx.timeoutMs,
      retry: ctx.retry,
      retryMaxDelayMs: ctx.retryMaxDelayMs,
      verbose: ctx.verbose,
    });
    return {
      data: result.data,
      requestId: result.requestId,
    };
  }

  const client = getContentClient(ctx);
  await client.delete({ endpoint, contentId });
  return {
    data: {
      id: contentId,
      deleted: true,
    },
    requestId: null,
  };
}

export async function listApis(
  ctx: RuntimeContext,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx.serviceDomain), ["apis"]);
  const result = await requestJson<unknown>({
    url,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  return { data: result.data, requestId: result.requestId };
}

export async function getApiInfo(
  ctx: RuntimeContext,
  endpoint: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx.serviceDomain), ["apis", endpoint]);
  const result = await requestJson<unknown>({
    url,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  return { data: result.data, requestId: result.requestId };
}

export async function listMedia(
  ctx: RuntimeContext,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrlWithVersion(
    getManagementBaseUrl(ctx.serviceDomain),
    "v2",
    ["media"],
    queries,
  );
  const result = await requestJson<unknown>({
    url,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  return { data: result.data, requestId: result.requestId };
}

export async function uploadMedia(
  ctx: RuntimeContext,
  path: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);

  const buffer = await readFile(path).catch(() => {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Could not read file: ${path}`,
      details: { path },
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  });

  const formData = new FormData();
  const mimeType = guessMediaContentType(path);
  formData.append("file", new Blob([buffer], { type: mimeType }), basename(path));

  const url = buildApiUrl(getManagementBaseUrl(ctx.serviceDomain), ["media"]);
  const result = await requestFormData<unknown>({
    url,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
    formData,
  });

  return { data: result.data, requestId: result.requestId };
}

function getManagementBaseUrl(serviceDomain: string): string {
  if (MANAGEMENT_BASE_URL_OVERRIDE) {
    return normalizeBaseUrlOverride(
      "MICROCMS_MANAGEMENT_API_BASE_URL",
      MANAGEMENT_BASE_URL_OVERRIDE,
      ["microcms-management.io"],
    );
  }

  return buildTenantOrigin(serviceDomain, "microcms-management.io");
}

function getContentBaseUrl(serviceDomain: string): string {
  if (CONTENT_BASE_URL_OVERRIDE) {
    return normalizeBaseUrlOverride("MICROCMS_CONTENT_API_BASE_URL", CONTENT_BASE_URL_OVERRIDE, [
      "microcms.io",
    ]);
  }

  return buildTenantOrigin(serviceDomain, "microcms.io");
}

function buildTenantOrigin(serviceDomain: string, baseDomain: string): string {
  const url = new URL("https://example.invalid");
  url.hostname = `${serviceDomain}.${baseDomain}`;
  return url.origin;
}

function buildApiUrl(
  baseOrigin: string,
  pathParts: string[],
  queries?: Record<string, unknown>,
): string {
  return buildApiUrlWithVersion(baseOrigin, "v1", pathParts, queries);
}

function buildApiUrlWithVersion(
  baseOrigin: string,
  version: "v1" | "v2",
  pathParts: string[],
  queries?: Record<string, unknown>,
): string {
  const url = new URL(baseOrigin);
  url.pathname = `/api/${version}/${pathParts.map((part) => encodeURIComponent(part)).join("/")}`;

  if (!queries) {
    return url.toString();
  }

  for (const [key, value] of Object.entries(queries)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function normalizeBaseUrlOverride(name: string, value: string, allowedDomains: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `${name} must be a valid URL`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (parsed.username || parsed.password) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `${name} must not include username/password`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!isLocalhost && parsed.protocol !== "https:") {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `${name} must use https for non-localhost origins`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const allowed =
    isLocalhost ||
    allowedDomains.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  if (!allowed) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `${name} points to a non-allowed host`,
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: {
        hostname: parsed.hostname,
      },
    });
  }

  return parsed.origin;
}

type MockContentStore = {
  nextId: number;
  endpoints: Record<string, Record<string, Record<string, unknown>>>;
};

async function runMockList(
  endpoint: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore();
  const endpointStore = store.endpoints[endpoint] ?? {};
  const offset = Number(queries?.offset ?? 0);
  const limit = Number(queries?.limit ?? 10);
  const allContents = Object.entries(endpointStore).map(([id, content]) => ({ id, ...content }));
  const contents = allContents.slice(offset, offset + limit);

  return {
    data: {
      contents,
      totalCount: allContents.length,
      offset,
      limit,
    },
    requestId: "mock-file-request",
  };
}

async function runMockGet(
  endpoint: string,
  contentId: string,
  _queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore();
  const endpointStore = store.endpoints[endpoint] ?? {};
  const hit = endpointStore[contentId];
  if (!hit) {
    throw fromHttpStatus(404, "mock content not found", {
      endpoint,
      contentId,
    });
  }

  return {
    data: {
      id: contentId,
      ...hit,
    },
    requestId: "mock-file-request",
  };
}

async function runMockCreate(
  endpoint: string,
  content: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore();
  if (!store.endpoints[endpoint]) {
    store.endpoints[endpoint] = {};
  }

  const id = `mock-created-${store.nextId}`;
  store.nextId += 1;
  store.endpoints[endpoint][id] = { ...content };
  await writeMockStore(store);

  return {
    data: {
      id,
      ...content,
    },
    requestId: "mock-file-request",
  };
}

async function runMockUpdate(
  endpoint: string,
  contentId: string,
  content: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore();
  const endpointStore = store.endpoints[endpoint] ?? {};
  if (!endpointStore[contentId]) {
    throw fromHttpStatus(404, "mock content not found", {
      endpoint,
      contentId,
    });
  }

  endpointStore[contentId] = {
    ...endpointStore[contentId],
    ...content,
  };
  store.endpoints[endpoint] = endpointStore;
  await writeMockStore(store);

  return {
    data: {
      id: contentId,
    },
    requestId: "mock-file-request",
  };
}

async function runMockDelete(
  endpoint: string,
  contentId: string,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore();
  const endpointStore = store.endpoints[endpoint] ?? {};
  if (!endpointStore[contentId]) {
    throw fromHttpStatus(404, "mock content not found", {
      endpoint,
      contentId,
    });
  }

  delete endpointStore[contentId];
  store.endpoints[endpoint] = endpointStore;
  await writeMockStore(store);

  return {
    data: {
      id: contentId,
      deleted: true,
    },
    requestId: "mock-file-request",
  };
}

async function readMockStore(): Promise<MockContentStore> {
  const path = getMockFilePath();

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<MockContentStore>;
    return {
      nextId: typeof parsed.nextId === "number" ? parsed.nextId : 1,
      endpoints:
        typeof parsed.endpoints === "object" && parsed.endpoints !== null ? parsed.endpoints : {},
    };
  } catch {
    return {
      nextId: 1,
      endpoints: {},
    };
  }
}

async function writeMockStore(store: MockContentStore): Promise<void> {
  const path = getMockFilePath();
  await writeFile(path, JSON.stringify(store, null, 2), "utf8");
}

function getMockFilePath(): string {
  if (!CONTENT_MOCK_FILE) {
    throw new Error("MICROCMS_CONTENT_MOCK_FILE is not set");
  }

  return CONTENT_MOCK_FILE;
}

function guessMediaContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}
