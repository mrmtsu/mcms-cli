import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { RuntimeContext } from "./context.js";
import { CliError, fromHttpStatus } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";
import { requestFormData, requestJson } from "./http.js";

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

export async function listContent(
  ctx: RuntimeContext,
  endpoint: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockList(mockFilePath, endpoint, queries, ctx.verbose);
  }

  const url = buildApiUrl(getContentBaseUrl(ctx), [endpoint], queries);
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

export async function getContent(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockGet(mockFilePath, endpoint, contentId, queries, ctx.verbose);
  }

  const url = buildApiUrl(getContentBaseUrl(ctx), [endpoint, contentId], queries);
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

export async function listContentMeta(
  ctx: RuntimeContext,
  endpoint: string,
  queries?: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx), ["contents", endpoint], queries);
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
  const url = buildApiUrl(getManagementBaseUrl(ctx), ["contents", endpoint, contentId]);
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

export async function patchContentStatus(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
  status: "PUBLISH" | "DRAFT",
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockPatchStatus(mockFilePath, endpoint, contentId, status, ctx.verbose);
  }

  const url = buildApiUrl(getManagementBaseUrl(ctx), ["contents", endpoint, contentId, "status"]);
  const result = await requestJson<unknown>({
    url,
    method: "PATCH",
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
    body: {
      status: [status],
    },
  });

  return { data: result.data, requestId: result.requestId };
}

export async function patchContentCreatedBy(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
  memberId: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx), [
    "contents",
    endpoint,
    contentId,
    "createdBy",
  ]);
  const result = await requestJson<unknown>({
    url,
    method: "PATCH",
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
    body: {
      createdBy: memberId,
    },
  });

  return { data: result.data, requestId: result.requestId };
}

export async function createContent(
  ctx: RuntimeContext,
  endpoint: string,
  content: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockCreate(mockFilePath, endpoint, content, ctx.verbose);
  }

  const url = buildApiUrl(getContentBaseUrl(ctx), [endpoint]);
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

export async function updateContent(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
  content: Record<string, unknown>,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockUpdate(mockFilePath, endpoint, contentId, content, ctx.verbose);
  }

  const url = buildApiUrl(getContentBaseUrl(ctx), [endpoint, contentId]);
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

export async function deleteContent(
  ctx: RuntimeContext,
  endpoint: string,
  contentId: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockDelete(mockFilePath, endpoint, contentId, ctx.verbose);
  }

  const url = buildApiUrl(getContentBaseUrl(ctx), [endpoint, contentId]);
  const result = await requestJson<unknown>({
    url,
    method: "DELETE",
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  const responseObject =
    typeof result.data === "object" && result.data !== null && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};

  return {
    data: {
      id: contentId,
      deleted: true,
      ...responseObject,
    },
    requestId: result.requestId,
  };
}

export async function listApis(
  ctx: RuntimeContext,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockListApis(mockFilePath, ctx.verbose);
  }

  const url = buildApiUrl(getManagementBaseUrl(ctx), ["apis"]);
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
  const mockFilePath = getContentMockFilePath(ctx);
  if (mockFilePath) {
    return runMockGetApiInfo(mockFilePath, endpoint, ctx.verbose);
  }

  const url = buildApiUrl(getManagementBaseUrl(ctx), ["apis", endpoint]);
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

export async function getMember(
  ctx: RuntimeContext,
  memberId: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrl(getManagementBaseUrl(ctx), ["members", memberId]);
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
  const url = buildApiUrlWithVersion(getManagementBaseUrl(ctx), "v2", ["media"], queries);
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

  const url = buildApiUrl(getManagementBaseUrl(ctx), ["media"]);
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

export async function deleteMedia(
  ctx: RuntimeContext,
  mediaUrl: string,
): Promise<{ data: unknown; requestId: string | null }> {
  assertAuth(ctx);
  const url = buildApiUrlWithVersion(getManagementBaseUrl(ctx), "v2", ["media"], {
    url: mediaUrl,
  });
  const result = await requestJson<unknown>({
    url,
    method: "DELETE",
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    retry: ctx.retry,
    retryMaxDelayMs: ctx.retryMaxDelayMs,
    verbose: ctx.verbose,
  });

  return { data: result.data, requestId: result.requestId };
}

function getManagementBaseUrl(ctx: RuntimeContext & { serviceDomain: string }): string {
  const override = resolveOverride(
    ctx.managementApiBaseUrlOverride,
    process.env.MICROCMS_MANAGEMENT_API_BASE_URL,
  );
  if (override) {
    return normalizeBaseUrlOverride("MICROCMS_MANAGEMENT_API_BASE_URL", override, [
      "microcms-management.io",
    ]);
  }

  return buildTenantOrigin(ctx.serviceDomain, "microcms-management.io");
}

function getContentBaseUrl(ctx: RuntimeContext & { serviceDomain: string }): string {
  const override = resolveOverride(
    ctx.contentApiBaseUrlOverride,
    process.env.MICROCMS_CONTENT_API_BASE_URL,
  );
  if (override) {
    return normalizeBaseUrlOverride("MICROCMS_CONTENT_API_BASE_URL", override, ["microcms.io"]);
  }

  return buildTenantOrigin(ctx.serviceDomain, "microcms.io");
}

function getContentMockFilePath(ctx: RuntimeContext): string | null {
  const value = resolveOverride(ctx.contentMockFile, process.env.MICROCMS_CONTENT_MOCK_FILE);
  return value ?? null;
}

function resolveOverride(primary?: string, fallback?: string): string | undefined {
  const fromPrimary = normalizeOptionalString(primary);
  if (fromPrimary) {
    return fromPrimary;
  }

  return normalizeOptionalString(fallback);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
  schemas?: Record<string, Record<string, unknown>>;
  drafts?: Record<string, Record<string, Record<string, Record<string, unknown>>>>;
};

async function runMockList(
  mockFilePath: string,
  endpoint: string,
  queries?: Record<string, unknown>,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
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

async function runMockListApis(
  mockFilePath: string,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
  const endpoints = [
    ...new Set([
      ...Object.keys(store.endpoints),
      ...Object.keys(store.schemas ?? {}),
      ...Object.keys(store.drafts ?? {}),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return {
    data: {
      contents: endpoints.map((endpoint) => ({ endpoint })),
      totalCount: endpoints.length,
    },
    requestId: "mock-file-request",
  };
}

async function runMockGetApiInfo(
  mockFilePath: string,
  endpoint: string,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
  const schema = store.schemas?.[endpoint];
  if (isRecord(schema)) {
    return {
      data: schema,
      requestId: "mock-file-request",
    };
  }

  const endpointStore = store.endpoints[endpoint];
  if (!endpointStore) {
    throw fromHttpStatus(404, "mock api not found", { endpoint });
  }

  return {
    data: {
      endpoint,
      apiFields: inferMockApiFields(endpointStore),
    },
    requestId: "mock-file-request",
  };
}

async function runMockGet(
  mockFilePath: string,
  endpoint: string,
  contentId: string,
  queries?: Record<string, unknown>,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
  const draftKey =
    typeof queries?.draftKey === "string" && queries.draftKey.trim().length > 0
      ? queries.draftKey.trim()
      : null;

  if (draftKey) {
    const draftHit = store.drafts?.[endpoint]?.[contentId]?.[draftKey];
    if (!draftHit) {
      throw fromHttpStatus(404, "mock draft content not found", {
        endpoint,
        contentId,
        draftKey,
      });
    }

    return {
      data: {
        id: contentId,
        ...draftHit,
      },
      requestId: "mock-file-request",
    };
  }

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
  mockFilePath: string,
  endpoint: string,
  content: Record<string, unknown>,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
  if (!store.endpoints[endpoint]) {
    store.endpoints[endpoint] = {};
  }

  const id = `mock-created-${store.nextId}`;
  store.nextId += 1;
  store.endpoints[endpoint][id] = { ...content };
  await writeMockStore(mockFilePath, store);

  return {
    data: {
      id,
      ...content,
    },
    requestId: "mock-file-request",
  };
}

async function runMockUpdate(
  mockFilePath: string,
  endpoint: string,
  contentId: string,
  content: Record<string, unknown>,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
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
  await writeMockStore(mockFilePath, store);

  return {
    data: {
      id: contentId,
    },
    requestId: "mock-file-request",
  };
}

async function runMockDelete(
  mockFilePath: string,
  endpoint: string,
  contentId: string,
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
  const endpointStore = store.endpoints[endpoint] ?? {};
  if (!endpointStore[contentId]) {
    throw fromHttpStatus(404, "mock content not found", {
      endpoint,
      contentId,
    });
  }

  delete endpointStore[contentId];
  store.endpoints[endpoint] = endpointStore;
  await writeMockStore(mockFilePath, store);

  return {
    data: {
      id: contentId,
      deleted: true,
    },
    requestId: "mock-file-request",
  };
}

async function runMockPatchStatus(
  mockFilePath: string,
  endpoint: string,
  contentId: string,
  status: "PUBLISH" | "DRAFT",
  verbose = false,
): Promise<{ data: unknown; requestId: string }> {
  const store = await readMockStore(mockFilePath, verbose);
  const endpointStore = store.endpoints[endpoint] ?? {};
  if (!endpointStore[contentId]) {
    throw fromHttpStatus(404, "mock content not found", {
      endpoint,
      contentId,
    });
  }

  endpointStore[contentId] = {
    ...endpointStore[contentId],
    _status: status,
  };
  store.endpoints[endpoint] = endpointStore;
  await writeMockStore(mockFilePath, store);

  return {
    data: {
      id: contentId,
      status: [status],
    },
    requestId: "mock-file-request",
  };
}

async function readMockStore(path: string, verbose = false): Promise<MockContentStore> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<MockContentStore>;
    return {
      nextId: typeof parsed.nextId === "number" ? parsed.nextId : 1,
      endpoints:
        typeof parsed.endpoints === "object" && parsed.endpoints !== null ? parsed.endpoints : {},
      schemas: typeof parsed.schemas === "object" && parsed.schemas !== null ? parsed.schemas : {},
      drafts: typeof parsed.drafts === "object" && parsed.drafts !== null ? parsed.drafts : {},
    };
  } catch (error) {
    logVerbose(verbose, `failed to read mock store ${path}; using empty fallback store`, error);
    return {
      nextId: 1,
      endpoints: {},
      schemas: {},
      drafts: {},
    };
  }
}

async function writeMockStore(path: string, store: MockContentStore): Promise<void> {
  await writeFile(path, JSON.stringify(store, null, 2), "utf8");
}

function logVerbose(verbose: boolean, message: string, error: unknown): void {
  if (!verbose) {
    return;
  }

  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[client] ${message}: ${detail}\n`);
}

function inferMockApiFields(
  endpointStore: Record<string, Record<string, unknown>>,
): Array<{ fieldId: string; kind: string }> {
  const first = Object.values(endpointStore)[0];
  if (!first || !isRecord(first)) {
    return [];
  }

  return Object.entries(first).map(([fieldId, value]) => ({
    fieldId,
    kind: inferMockFieldKind(value),
  }));
}

function inferMockFieldKind(value: unknown): string {
  if (typeof value === "string") {
    return "text";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "text";
  }

  if (typeof value === "object") {
    return "object";
  }

  return "text";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
