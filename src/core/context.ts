import { readApiKey, readApiKeyForProfile } from "./auth-store.js";
import { readConfig } from "./config.js";
import { CliError } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";

export type ApiKeySource = "option" | "env" | "keychain" | "none";
export type ApiKeySourceDetail =
  | "option"
  | "stdin"
  | "prompt"
  | "env"
  | "keychain_profile"
  | "keychain_service"
  | "none";
export type ProfileSource = "option" | "env" | "config" | "none";
export type ServiceDomainSource = "option" | "env" | "profile" | "config" | "none";
export type OutputMode = "inspect" | "plain" | "table";

export type RuntimeContext = {
  json: boolean;
  verbose: boolean;
  color: boolean;
  timeoutMs: number;
  retry: number;
  retryMaxDelayMs: number;
  outputMode: OutputMode;
  selectFields?: string[];
  profile?: string;
  profileSource: ProfileSource;
  serviceDomain?: string;
  serviceDomainSource: ServiceDomainSource;
  apiKey?: string;
  apiKeySource: ApiKeySource;
  apiKeySourceDetail: ApiKeySourceDetail;
};

export type GlobalOptions = {
  json?: boolean;
  plain?: boolean;
  table?: boolean;
  select?: string;
  profile?: string;
  serviceDomain?: string;
  apiKey?: string;
  apiKeyStdin?: boolean;
  apiKeyPrompt?: boolean;
  timeout?: string | number;
  retry?: string | number;
  retryMaxDelay?: string | number;
  verbose?: boolean;
  color?: boolean;
};

export async function createRuntimeContext(options: GlobalOptions): Promise<RuntimeContext> {
  const config = await readConfig();

  const profileOption = normalizeString(options.profile);
  const profileEnv = normalizeString(process.env.MICROCMS_PROFILE);
  const profileConfig = normalizeString(config.defaultProfile);
  const profile = resolveProfileName(profileOption ?? profileEnv ?? profileConfig);
  const profileSource: ProfileSource = profileOption
    ? "option"
    : profileEnv
      ? "env"
      : profileConfig
        ? "config"
        : "none";

  const profileServiceDomain = profile
    ? normalizeString(config.profiles?.[profile]?.serviceDomain)
    : undefined;
  const serviceDomainOption = normalizeString(options.serviceDomain);
  const serviceDomainEnv = normalizeString(process.env.MICROCMS_SERVICE_DOMAIN);
  const serviceDomainConfig = normalizeString(config.serviceDomain);
  const serviceDomain = resolveServiceDomain(
    serviceDomainOption ?? serviceDomainEnv ?? profileServiceDomain ?? serviceDomainConfig,
  );
  const serviceDomainSource: ServiceDomainSource = serviceDomainOption
    ? "option"
    : serviceDomainEnv
      ? "env"
      : profileServiceDomain
        ? "profile"
        : serviceDomainConfig
          ? "config"
          : "none";

  const fromOption = normalizeString(options.apiKey);
  const apiKeyStdin = Boolean(options.apiKeyStdin);
  const apiKeyPrompt = Boolean(options.apiKeyPrompt);

  if (fromOption && apiKeyStdin) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Use either --api-key or --api-key-stdin, not both",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (apiKeyPrompt && (fromOption || apiKeyStdin)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Use --prompt alone. It conflicts with --api-key and --api-key-stdin.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  let apiKey = fromOption;
  let apiKeySource: ApiKeySource = "none";
  let apiKeySourceDetail: ApiKeySourceDetail = "none";

  if (apiKey) {
    apiKeySource = "option";
    apiKeySourceDetail = "option";
  } else if (apiKeyStdin) {
    apiKey = await readApiKeyFromStdin();
    apiKeySource = "option";
    apiKeySourceDetail = "stdin";
  } else if (apiKeyPrompt) {
    apiKey = await readApiKeyFromPrompt();
    apiKeySource = "option";
    apiKeySourceDetail = "prompt";
  } else {
    apiKey = normalizeString(process.env.MICROCMS_API_KEY);
    if (apiKey) {
      apiKeySource = "env";
      apiKeySourceDetail = "env";
    }
  }

  if (!apiKey && profile) {
    const fromProfileKeychain = await readApiKeyForProfile(profile);
    if (fromProfileKeychain) {
      apiKey = fromProfileKeychain;
      apiKeySource = "keychain";
      apiKeySourceDetail = "keychain_profile";
    }
  }

  if (!apiKey && serviceDomain) {
    const fromKeychain = await readApiKey(serviceDomain);
    if (fromKeychain) {
      apiKey = fromKeychain;
      apiKeySource = "keychain";
      apiKeySourceDetail = "keychain_service";
    }
  }

  return {
    json: Boolean(options.json),
    verbose: Boolean(options.verbose),
    color: options.color !== false,
    timeoutMs: parseTimeout(options.timeout),
    retry: parseRetry(options.retry),
    retryMaxDelayMs: parseRetryMaxDelay(options.retryMaxDelay),
    ...parseOutputMode(options),
    profile,
    profileSource,
    serviceDomain,
    serviceDomainSource,
    apiKey,
    apiKeySource,
    apiKeySourceDetail,
  };
}

function parseOutputMode(options: GlobalOptions): {
  outputMode: OutputMode;
  selectFields?: string[];
} {
  const plain = Boolean(options.plain);
  const table = Boolean(options.table);

  if (plain && table) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Use either --plain or --table, not both",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (Boolean(options.json) && (plain || table)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--json cannot be combined with --plain or --table",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const selectFields = parseSelectFields(options.select);

  return {
    outputMode: table ? "table" : plain ? "plain" : "inspect",
    selectFields,
  };
}

function parseSelectFields(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const fields = value
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field.length > 0);

  if (fields.length === 0) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--select requires at least one field name",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const unique = [...new Set(fields)];
  if (unique.some((field) => !/^[A-Za-z0-9_.-]+$/.test(field))) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--select supports letters, numbers, dot, underscore, hyphen",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return unique;
}

function parseTimeout(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return assertRange("timeout", value, 1, 120_000);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (/^\d+$/.test(value.trim()) && Number.isFinite(parsed) && parsed > 0) {
      return assertRange("timeout", parsed, 1, 120_000);
    }
    throw invalidInteger("timeout", value, "1-120000");
  }

  return 10_000;
}

function parseRetry(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return assertRange("retry", value, 0, 10);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (/^\d+$/.test(value.trim()) && Number.isFinite(parsed)) {
      return assertRange("retry", parsed, 0, 10);
    }
    throw invalidInteger("retry", value, "0-10");
  }

  return 2;
}

function parseRetryMaxDelay(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return assertRange("retry-max-delay", value, 100, 120_000);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (/^\d+$/.test(value.trim()) && Number.isFinite(parsed) && parsed > 0) {
      return assertRange("retry-max-delay", parsed, 100, 120_000);
    }
    throw invalidInteger("retry-max-delay", value, "100-120000");
  }

  return 3_000;
}

function normalizeString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProfileName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/.test(value)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message:
        "Invalid profile name format. Use letters, numbers, dot, underscore, hyphen (1-64 chars).",
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: { provided: value },
    });
  }

  return value;
}

function resolveServiceDomain(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message:
        "Invalid service domain format. Expected lowercase letters, numbers, hyphens, max 63 chars, no leading/trailing hyphen.",
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: {
        provided: value,
      },
    });
  }

  return normalized;
}

async function readApiKeyFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--api-key-stdin requires piped stdin input (TTY is not supported)",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const trimmed = Buffer.concat(chunks).toString("utf8").trim();
  if (!trimmed) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--api-key-stdin was specified but stdin did not contain an API key",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return trimmed;
}

async function readApiKeyFromPrompt(): Promise<string> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--prompt requires an interactive TTY",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const stdin = process.stdin;
  const wasRaw = Boolean(stdin.isRaw);
  stdin.setEncoding("utf8");
  stdin.resume();

  process.stderr.write("API key: ");

  return new Promise<string>((resolve, reject) => {
    let value = "";
    let escapePending = false;
    let inControlSequence = false;
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("error", onError);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
      process.stderr.write("\n");
    };

    const finishResolve = (apiKey: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(apiKey);
    };

    const finishReject = (error: CliError) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onData = (chunk: string | Buffer) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      for (const char of text) {
        if (escapePending) {
          escapePending = false;
          if (char === "[" || char === "O") {
            inControlSequence = true;
          }
          continue;
        }

        if (inControlSequence) {
          if (/[A-Za-z~]/.test(char)) {
            inControlSequence = false;
          }
          continue;
        }

        if (char === "\r" || char === "\n") {
          const trimmed = value.trim();
          if (!trimmed) {
            finishReject(
              new CliError({
                code: "INVALID_INPUT",
                message: "No API key was entered",
                exitCode: EXIT_CODE.INVALID_INPUT,
              }),
            );
            return;
          }

          finishResolve(trimmed);
          return;
        }

        if (char === "\u0003") {
          finishReject(
            new CliError({
              code: "INVALID_INPUT",
              message: "API key input canceled",
              exitCode: EXIT_CODE.INVALID_INPUT,
            }),
          );
          return;
        }

        if (char === "\u007f" || char === "\b" || char === "\u0008") {
          value = value.slice(0, -1);
          continue;
        }

        if (char === "\u001b") {
          escapePending = true;
          continue;
        }

        if (char >= " ") {
          value += char;
        }
      }
    };

    const onEnd = () => {
      finishReject(
        new CliError({
          code: "INVALID_INPUT",
          message: "API key input stream ended before completion",
          exitCode: EXIT_CODE.INVALID_INPUT,
        }),
      );
    };

    const onError = () => {
      finishReject(
        new CliError({
          code: "INVALID_INPUT",
          message: "Failed to read API key from prompt",
          exitCode: EXIT_CODE.INVALID_INPUT,
        }),
      );
    };

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
    stdin.on("end", onEnd);
    stdin.on("error", onError);
  });
}

function assertRange(name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalidInteger(name, String(value), `${min}-${max}`);
  }
  return value;
}

function invalidInteger(name: string, value: string, expectedRange: string): CliError {
  return new CliError({
    code: "INVALID_INPUT",
    message: `Invalid ${name}: ${value}. Expected integer in range ${expectedRange}.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}
