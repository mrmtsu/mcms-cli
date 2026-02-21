import { readFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { CliError } from "../errors.js";
import { EXIT_CODE } from "../exit-codes.js";
import type { DocsGetResult, DocsListResult, DocsProvider } from "./provider.js";

const MCP_COMMAND_OVERRIDE = process.env.MICROCMS_DOC_MCP_COMMAND;
const MCP_STARTUP_TIMEOUT_MS = 2_000;
const MCP_REQUEST_TIMEOUT_MS = 5_000;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type McpClient = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

type DocsListDocumentsPayload = {
  categories?: Array<{
    category?: unknown;
    files?: unknown;
  }>;
};

type McpRuntime = {
  command: string;
  args: string[];
};

export function createMcpDocsProvider(): DocsProvider & { healthcheck(): Promise<void> } {
  const client = createMcpClient(resolveMcpRuntime());

  return {
    async healthcheck() {
      await callTool(client, "fetch_general");
    },
    async listDocuments(params): Promise<DocsListResult> {
      const args = params.category ? { category: params.category } : undefined;
      const raw = await callTool(client, "list_documents", args);
      const payload = parseListDocumentsPayload(raw);
      const categoryRows = payload.categories ?? [];

      const docs = categoryRows
        .flatMap((row) => {
          const category = typeof row.category === "string" ? row.category : undefined;
          const files = Array.isArray(row.files) ? row.files : [];
          if (!category) {
            return [];
          }

          return files
            .filter((file): file is string => typeof file === "string")
            .map((filename) => ({ category, filename }));
        })
        .slice(0, params.limit);

      const counts = new Map<string, number>();
      for (const doc of docs) {
        counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
      }

      return {
        categories: [...counts.entries()].map(([category, count]) => ({ category, count })),
        docs,
        total: docs.length,
      };
    },
    async getDocument(params): Promise<DocsGetResult> {
      const raw = await callTool(client, "search_document", {
        category: params.category,
        filename: params.filename,
      });

      return {
        category: params.category,
        filename: params.filename,
        markdown: normalizeSearchDocumentOutput(raw),
      };
    },
    async dispose() {
      await client.close();
    },
  };
}

function createMcpClient(runtime: McpRuntime): McpClient {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  const stderrChunks: string[] = [];
  let processRef: ChildProcessWithoutNullStreams | null = null;
  let initialized = false;
  let startupPromise: Promise<void> | null = null;
  let startupTimer: NodeJS.Timeout | null = null;
  let startupResolve: (() => void) | null = null;
  let startupReject: ((error: Error) => void) | null = null;
  let buffer: Buffer = Buffer.alloc(0);

  function ensureStarted(): ChildProcessWithoutNullStreams {
    if (processRef) {
      return processRef;
    }

    const child = spawn(runtime.command, runtime.args, {
      stdio: "pipe",
      env: buildMcpEnv(),
    });
    processRef = child;

    startupPromise = new Promise<void>((resolve, reject) => {
      startupResolve = resolve;
      startupReject = reject;
      startupTimer = setTimeout(() => {
        reject(new Error(`MCP server startup timed out after ${MCP_STARTUP_TIMEOUT_MS}ms`));
      }, MCP_STARTUP_TIMEOUT_MS);
    });

    child.once("spawn", () => {
      clearStartupTimer();
      startupResolve?.();
    });

    child.on("error", (error) => {
      const wrapped = new Error(
        `Failed to launch MCP server command "${runtime.command}": ${error.message}`,
      );
      clearStartupTimer();
      startupReject?.(wrapped);
      throwFromPending(wrapped);
    });

    child.on("exit", (code, signal) => {
      const suffix = stderrChunks.length > 0 ? ` (${stderrChunks.join("").trim()})` : "";
      const wrapped = new Error(
        `MCP server exited (code=${code ?? "null"}, signal=${signal ?? "null"})${suffix}`,
      );
      clearStartupTimer();
      startupReject?.(wrapped);
      throwFromPending(wrapped);
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    });

    child.stdout.on("data", (chunk) => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, part]);
      try {
        for (const message of readTransportMessages(
          () => buffer,
          (next) => {
            buffer = next;
          },
        )) {
          onMessage(message);
        }
      } catch (error) {
        const wrapped = new Error(
          `Failed to parse MCP response: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        throwFromPending(wrapped);
      }
    });

    return child;
  }

  async function request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const child = ensureStarted();
    await startupPromise;

    if (!initialized) {
      await initialize(child);
      initialized = true;
    }

    return requestRaw(child, method, params);
  }

  async function initialize(child: ChildProcessWithoutNullStreams): Promise<void> {
    await requestRaw(child, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "mcms-cli",
        version: "0.1.0",
      },
    });

    const initializedNotification = serializeTransportMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
    child.stdin.write(initializedNotification, (error) => {
      if (error) {
        throwFromPending(
          new Error(`Failed to send MCP initialized notification: ${error.message}`),
        );
      }
    });
  }

  async function requestRaw(
    child: ChildProcessWithoutNullStreams,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    const serialized = serializeTransportMessage(payload);

    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, MCP_REQUEST_TIMEOUT_MS);

      pending.set(id, {
        resolve,
        reject,
        timer,
      });

      child.stdin.write(serialized, (error) => {
        if (!error) {
          return;
        }

        const entry = pending.get(id);
        if (!entry) {
          return;
        }
        clearTimeout(entry.timer);
        pending.delete(id);
        reject(new Error(`Failed to write MCP request (${method}): ${error.message}`));
      });
    });
  }

  function onMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) {
      return;
    }

    const response = message as JsonRpcResponse;
    if (typeof response.id !== "number") {
      return;
    }

    const entry = pending.get(response.id);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timer);
    pending.delete(response.id);

    if (response.error) {
      const details =
        response.error.data === undefined ? "" : ` (${JSON.stringify(response.error.data)})`;
      entry.reject(new Error(`${response.error.message ?? "MCP request failed"}${details}`));
      return;
    }

    entry.resolve(response.result);
  }

  async function close(): Promise<void> {
    if (!processRef) {
      return;
    }

    const child = processRef;
    processRef = null;
    initialized = false;
    throwFromPending(new Error("MCP client closed"));

    if (!child.killed) {
      child.kill();
    }
  }

  function throwFromPending(error: Error): void {
    for (const [id, entry] of pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(error);
      pending.delete(id);
    }
  }

  function clearStartupTimer(): void {
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
  }

  return {
    request,
    close,
  };
}

function resolveMcpRuntime(): McpRuntime {
  const overridden = MCP_COMMAND_OVERRIDE?.trim();
  if (overridden && overridden.length > 0) {
    const extension = extname(overridden).toLowerCase();
    if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
      return {
        command: process.execPath,
        args: [overridden],
      };
    }

    return {
      command: overridden,
      args: [],
    };
  }

  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve("microcms-document-mcp-server/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const binRelative =
      typeof packageJson.bin === "string"
        ? packageJson.bin
        : (packageJson.bin?.["microcms-document-mcp-server"] ??
          (packageJson.bin ? Object.values(packageJson.bin)[0] : undefined));
    if (!binRelative) {
      throw new Error("bin field is missing");
    }

    return {
      command: process.execPath,
      args: [resolve(dirname(packageJsonPath), binRelative)],
    };
  } catch {
    return {
      command: "microcms-document-mcp-server",
      args: [],
    };
  }
}

function buildMcpEnv(): NodeJS.ProcessEnv {
  const keys = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "COMSPEC",
    "WINDIR",
    "LANG",
    "LC_ALL",
  ];
  const env: NodeJS.ProcessEnv = {};

  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

async function callTool(
  client: McpClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<string> {
  try {
    const result = await client.request("tools/call", {
      name,
      arguments: args ?? {},
    });
    const text = extractToolText(result);
    if (text === null) {
      throw new Error(`MCP tool "${name}" returned unsupported response payload`);
    }
    return text;
  } catch (error) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `MCP tool call failed (${name}): ${error instanceof Error ? error.message : "unknown error"}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }
}

function extractToolText(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    return null;
  }

  const maybeContent = (result as { content?: unknown }).content;
  if (!Array.isArray(maybeContent)) {
    return null;
  }

  const texts = maybeContent
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const item = entry as { type?: unknown; text?: unknown };
      if (item.type !== "text" || typeof item.text !== "string") {
        return null;
      }
      return item.text;
    })
    .filter((text): text is string => text !== null);

  if (texts.length === 0) {
    return null;
  }

  return texts.join("\n");
}

function parseListDocumentsPayload(raw: string): DocsListDocumentsPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "MCP list_documents returned non-JSON payload",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "MCP list_documents returned invalid payload",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return parsed as DocsListDocumentsPayload;
}

function normalizeSearchDocumentOutput(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  const marker = "\n---\n";
  if (!normalized.startsWith("カテゴリー:") || !normalized.includes(marker)) {
    return normalized;
  }

  const start = normalized.indexOf(marker);
  return normalized.slice(start + 1).trim();
}

function serializeTransportMessage(payload: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
}

function* readTransportMessages(
  readBuffer: () => Buffer,
  setBuffer: (next: Buffer) => void,
): Generator<unknown> {
  while (true) {
    const current = readBuffer();
    if (current.length === 0) {
      return;
    }

    if (startsWithContentLengthHeader(current)) {
      const separatorIndex = current.indexOf("\r\n\r\n");
      if (separatorIndex < 0) {
        return;
      }

      const headerText = current.slice(0, separatorIndex).toString("utf8");
      const length = parseContentLength(headerText);
      if (length === null) {
        throw new Error("MCP framing error: missing Content-Length");
      }

      const bodyStart = separatorIndex + 4;
      const bodyEnd = bodyStart + length;
      if (current.length < bodyEnd) {
        return;
      }

      const body = current.slice(bodyStart, bodyEnd).toString("utf8");
      setBuffer(current.slice(bodyEnd));
      yield parseJsonMessage(body);
      continue;
    }

    const lineBreakIndex = current.indexOf(0x0a);
    if (lineBreakIndex < 0) {
      return;
    }

    const line = current.slice(0, lineBreakIndex).toString("utf8").replace(/\r$/, "").trim();
    setBuffer(current.slice(lineBreakIndex + 1));
    if (line.length === 0) {
      continue;
    }

    yield parseJsonMessage(line);
  }
}

function parseJsonMessage(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `MCP transport error: invalid JSON payload (${error instanceof Error ? error.message : "unknown"})`,
    );
  }
}

function startsWithContentLengthHeader(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, 32).toString("utf8").toLowerCase();
  return probe.startsWith("content-length:");
}

function parseContentLength(headerText: string): number | null {
  const lines = headerText.split(/\r\n/);
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    if (key !== "content-length") {
      continue;
    }

    const raw = line.slice(separator + 1).trim();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  return null;
}
