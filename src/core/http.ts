import { CliError, fromHttpStatus, normalizeError } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";

type RequestBaseParams = {
  url: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  apiKey: string;
  timeoutMs: number;
  retry: number;
  retryMaxDelayMs: number;
  verbose?: boolean;
  headers?: Record<string, string>;
};

type JsonRequestParams = Omit<RequestBaseParams, "method"> & {
  method?: RequestBaseParams["method"];
  body?: unknown;
};

type JsonResponse<T> = {
  data: T;
  requestId: string | null;
};

type RetryPolicy = {
  allowed: boolean;
  reason: "safe_method" | "idempotency_key" | "unsafe_method";
};

export async function requestJson<T>(params: JsonRequestParams): Promise<JsonResponse<T>> {
  const method = params.method ?? "GET";

  return requestWithRetry<T>(
    {
      ...params,
      method
    },
    async (signal) => {
      return fetch(params.url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-MICROCMS-API-KEY": params.apiKey,
          ...params.headers
        },
        body: params.body === undefined ? undefined : JSON.stringify(params.body),
        signal
      });
    }
  );
}

type FormRequestParams = Omit<RequestBaseParams, "method"> & {
  formData: FormData;
};

export async function requestFormData<T>(params: FormRequestParams): Promise<JsonResponse<T>> {
  return requestWithRetry<T>(
    {
      ...params,
      method: "POST"
    },
    async (signal) => {
      return fetch(params.url, {
        method: "POST",
        headers: {
          "X-MICROCMS-API-KEY": params.apiKey,
          ...params.headers
        },
        body: params.formData,
        signal
      });
    }
  );
}

async function requestWithRetry<T>(
  params: RequestBaseParams,
  sender: (signal: AbortSignal) => Promise<Response>
): Promise<JsonResponse<T>> {
  const retryPolicy = resolveRetryPolicy(params.method, params.headers);
  const maxAttempts = retryPolicy.allowed ? params.retry + 1 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await withTimeout(params.timeoutMs, sender);
    } catch (error) {
      const normalized = normalizeNetworkError(error, params.timeoutMs);
      if (shouldRetry(normalized, attempt, maxAttempts)) {
        const delayMs = computeRetryDelay(attempt, undefined, params.retryMaxDelayMs);
        emitRetryLog(params, normalized, attempt, maxAttempts, delayMs);
        await sleep(delayMs);
        continue;
      }

      emitRetrySkipLog(params, normalized, retryPolicy);
      throw withRetryDiagnostics(normalized, attempt, maxAttempts, retryPolicy);
    }

    const requestId = response.headers.get("x-request-id");
    if (response.ok) {
      const data = await parseSuccessBody<T>(response);
      return {
        data,
        requestId
      };
    }

    const retryAfterMs = parseRetryAfterHeader(response.headers.get("retry-after"));
    const responseText = await response.text();
    const responseBody = responseText.length > 0 ? safeJsonParse(responseText) : undefined;
    const errorDetails = withMetadata(responseBody, {
      status: response.status,
      requestId,
      retryAfterMs
    });
    const normalized = fromHttpStatus(
      response.status,
      `microCMS API request failed with status ${response.status}`,
      errorDetails
    );

    if (shouldRetry(normalized, attempt, maxAttempts)) {
      const delayMs = computeRetryDelay(attempt, retryAfterMs, params.retryMaxDelayMs);
      emitRetryLog(params, normalized, attempt, maxAttempts, delayMs);
      await sleep(delayMs);
      continue;
    }

    emitRetrySkipLog(params, normalized, retryPolicy);
    throw withRetryDiagnostics(normalized, attempt, maxAttempts, retryPolicy);
  }

  throw new CliError({
    code: "UNKNOWN_ERROR",
    message: "Retry loop terminated unexpectedly",
    exitCode: EXIT_CODE.UNKNOWN
  });
}

async function withTimeout(timeoutMs: number, sender: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await sender(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function resolveRetryPolicy(method: RequestBaseParams["method"], headers?: Record<string, string>): RetryPolicy {
  const upperMethod = method.toUpperCase();

  if (upperMethod === "GET") {
    return {
      allowed: true,
      reason: "safe_method"
    };
  }

  const hasIdempotencyKey = Object.entries(headers ?? {}).some(([key, value]) => {
    const lower = key.toLowerCase();
    if (lower !== "idempotency-key" && lower !== "x-idempotency-key") {
      return false;
    }

    return value.trim().length > 0;
  });

  if (hasIdempotencyKey) {
    return {
      allowed: true,
      reason: "idempotency_key"
    };
  }

  return {
    allowed: false,
    reason: "unsafe_method"
  };
}

function normalizeNetworkError(error: unknown, timeoutMs: number): CliError {
  if (error instanceof Error && error.name === "AbortError") {
    return new CliError({
      code: "NETWORK_ERROR",
      message: `Request timed out after ${timeoutMs}ms`,
      exitCode: EXIT_CODE.NETWORK,
      retryable: true
    });
  }

  return normalizeError(error);
}

function shouldRetry(error: CliError, attempt: number, maxAttempts: number): boolean {
  return error.retryable && attempt < maxAttempts;
}

function emitRetryLog(
  params: RequestBaseParams,
  error: CliError,
  attempt: number,
  maxAttempts: number,
  delayMs: number
): void {
  if (!params.verbose) {
    return;
  }

  const nextAttempt = attempt + 1;
  process.stderr.write(
    `[retry] ${error.code} on attempt ${attempt}/${maxAttempts}, retrying attempt ${nextAttempt} in ${delayMs}ms\n`
  );
}

function emitRetrySkipLog(params: RequestBaseParams, error: CliError, retryPolicy: RetryPolicy): void {
  if (!params.verbose) {
    return;
  }

  if (!error.retryable || retryPolicy.allowed || params.retry <= 0) {
    return;
  }

  const safeUrl = sanitizeUrlForLog(params.url);
  process.stderr.write(
    `[retry] skipped for ${params.method} ${safeUrl} because request is not retry-safe (set an idempotency key to enable)\n`
  );
}

function computeRetryDelay(attempt: number, retryAfterMs: number | undefined, maxDelayMs: number): number {
  if (retryAfterMs !== undefined) {
    return Math.max(0, Math.min(retryAfterMs, maxDelayMs));
  }

  const exponential = 250 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(exponential + jitter, maxDelayMs);
}

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const asSeconds = Number.parseInt(value, 10);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return undefined;
}

async function parseSuccessBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text.length > 0 ? safeJsonParse(text) : undefined;
  return (body ?? {}) as T;
}

function withMetadata(body: unknown, metadata: Record<string, unknown>): unknown {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return {
      ...(body as Record<string, unknown>),
      ...metadata
    };
  }

  return {
    body,
    ...metadata
  };
}

function withRetryDiagnostics(
  error: CliError,
  attempt: number,
  maxAttempts: number,
  retryPolicy: RetryPolicy
): CliError {
  const retriesUsed = Math.max(0, attempt - 1);
  const details = withMetadata(error.details, {
    retry: {
      attempts: attempt,
      retriesUsed,
      maxAttempts,
      policy: retryPolicy
    }
  });

  return new CliError({
    code: error.code,
    message: error.message,
    exitCode: error.exitCode,
    retryable: error.retryable,
    details
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    const index = url.indexOf("?");
    if (index === -1) {
      return url;
    }

    return `${url.slice(0, index)}?<redacted>`;
  }
}
