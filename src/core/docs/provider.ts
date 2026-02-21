import { CliError } from "../errors.js";
import { EXIT_CODE } from "../exit-codes.js";
import { createLocalDocsProvider } from "./local-provider.js";
import { createMcpDocsProvider } from "./mcp-provider.js";

export type DocsSourceMode = "auto" | "mcp" | "local";
export type DocsSourceResolved = "mcp" | "local";

export type DocsDocument = {
  category: string;
  filename: string;
};

export type DocsListResult = {
  categories: Array<{ category: string; count: number }>;
  docs: DocsDocument[];
  total: number;
};

export type DocsGetResult = {
  category: string;
  filename: string;
  markdown: string;
};

export type DocsProvider = {
  listDocuments(params: { category?: string; limit: number }): Promise<DocsListResult>;
  getDocument(params: { category: string; filename: string }): Promise<DocsGetResult>;
  dispose?(): Promise<void>;
};

export type ResolvedDocsProvider = {
  provider: DocsProvider;
  sourceResolved: DocsSourceResolved;
  warnings: string[];
};

export async function resolveDocsProvider(source: DocsSourceMode): Promise<ResolvedDocsProvider> {
  if (source === "local") {
    return {
      provider: createLocalDocsProvider(),
      sourceResolved: "local",
      warnings: [],
    };
  }

  if (source === "mcp") {
    const provider = createMcpDocsProvider();
    await provider.healthcheck();
    return {
      provider,
      sourceResolved: "mcp",
      warnings: [],
    };
  }

  const mcpProvider = createMcpDocsProvider();
  try {
    await mcpProvider.healthcheck();
    return {
      provider: mcpProvider,
      sourceResolved: "mcp",
      warnings: [],
    };
  } catch (error) {
    await mcpProvider.dispose?.();
    const reason = toWarningMessage(error);
    return {
      provider: createLocalDocsProvider(),
      sourceResolved: "local",
      warnings: [`MCP source is unavailable, fell back to local source: ${reason}`],
    };
  }
}

export function parseDocsSourceOption(value: string | undefined): DocsSourceMode {
  const normalized = value?.trim().toLowerCase() ?? "auto";
  if (normalized === "auto" || normalized === "mcp" || normalized === "local") {
    return normalized;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Invalid source: ${value}. Expected auto, mcp, or local.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

export function truncateMarkdown(
  markdown: string,
  maxChars: number | undefined,
): {
  markdown: string;
  truncated: boolean;
  originalLength: number;
} {
  const originalLength = markdown.length;
  if (!maxChars || originalLength <= maxChars) {
    return {
      markdown,
      truncated: false,
      originalLength,
    };
  }

  return {
    markdown: `${markdown.slice(0, maxChars)}\n\n<!-- truncated -->`,
    truncated: true,
    originalLength,
  };
}

function toWarningMessage(error: unknown): string {
  if (error instanceof CliError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "unknown error";
}
