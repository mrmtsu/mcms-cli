import { EXIT_CODE, type ExitCode } from "./exit-codes.js";

export type ErrorCode =
  | "INVALID_INPUT"
  | "AUTH_FAILED"
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "CONFLICT"
  | "NOT_FOUND"
  | "API_ERROR"
  | "UNKNOWN_ERROR";

export type JsonErrorShape = {
  code: ErrorCode;
  message: string;
  details?: unknown;
  retryable: boolean;
};

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: ExitCode;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(params: {
    code: ErrorCode;
    message: string;
    exitCode: ExitCode;
    details?: unknown;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = "CliError";
    this.code = params.code;
    this.exitCode = params.exitCode;
    this.details = params.details;
    this.retryable = Boolean(params.retryable);
  }

  toJson(options?: { includeDetails?: boolean }): JsonErrorShape {
    const payload: JsonErrorShape = {
      code: this.code,
      message: this.message,
      retryable: this.retryable
    };

    if (options?.includeDetails && this.details !== undefined) {
      payload.details = this.details;
    }

    return payload;
  }
}

const NETWORK_NAMES = new Set(["AbortError", "FetchError"]);

function isLikelyNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  if (NETWORK_NAMES.has(err.name)) {
    return true;
  }

  const code = (err as NodeJS.ErrnoException).code;
  if (typeof code === "string") {
    return [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EAI_AGAIN"
    ].includes(code);
  }

  return false;
}

export function fromHttpStatus(status: number, message: string, details?: unknown): CliError {
  if (status === 401) {
    return new CliError({
      code: "AUTH_FAILED",
      message,
      details,
      exitCode: EXIT_CODE.AUTH,
      retryable: false
    });
  }

  if (status === 403) {
    return new CliError({
      code: "FORBIDDEN",
      message,
      details,
      exitCode: EXIT_CODE.PERMISSION,
      retryable: false
    });
  }

  if (status === 404) {
    return new CliError({
      code: "NOT_FOUND",
      message,
      details,
      exitCode: EXIT_CODE.INVALID_INPUT,
      retryable: false
    });
  }

  if (status === 409) {
    return new CliError({
      code: "CONFLICT",
      message,
      details,
      exitCode: EXIT_CODE.CONFLICT,
      retryable: false
    });
  }

  if (status === 408 || status === 425 || status === 429) {
    return new CliError({
      code: "NETWORK_ERROR",
      message,
      details,
      exitCode: EXIT_CODE.NETWORK,
      retryable: true
    });
  }

  if (status >= 500) {
    return new CliError({
      code: "API_ERROR",
      message,
      details,
      exitCode: EXIT_CODE.NETWORK,
      retryable: true
    });
  }

  return new CliError({
    code: "API_ERROR",
    message,
    details,
    exitCode: EXIT_CODE.UNKNOWN,
    retryable: false
  });
}

export function normalizeError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (isLikelyNetworkError(error)) {
    return new CliError({
      code: "NETWORK_ERROR",
      message: "Network request failed",
      details: toErrorDetails(error),
      exitCode: EXIT_CODE.NETWORK,
      retryable: true
    });
  }

  const status = getStatusCode(error);
  if (typeof status === "number") {
    return fromHttpStatus(status, `microCMS API request failed with status ${status}`, toErrorDetails(error));
  }

  if (error instanceof Error) {
    return new CliError({
      code: "UNKNOWN_ERROR",
      message: error.message,
      details: toErrorDetails(error),
      exitCode: EXIT_CODE.UNKNOWN,
      retryable: false
    });
  }

  return new CliError({
    code: "UNKNOWN_ERROR",
    message: "Unexpected error",
    details: { error },
    exitCode: EXIT_CODE.UNKNOWN,
    retryable: false
  });
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const maybeStatus = (error as { status?: unknown }).status;
  if (typeof maybeStatus === "number") {
    return maybeStatus;
  }

  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
  if (typeof responseStatus === "number") {
    return responseStatus;
  }

  return undefined;
}

function toErrorDetails(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return error;
}
