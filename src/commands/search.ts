import { Command } from "commander";
import type { SearchHit } from "../core/search.js";
import { rankSearchHits } from "../core/search.js";
import { getCliSpec } from "../core/spec.js";
import { parseDocsSourceOption, resolveDocsProvider } from "../core/docs/provider.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand, parseIntegerOption } from "./utils.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";

type SearchScope = "all" | "spec" | "docs";

type SearchOptions = {
  source?: string;
  scope?: string;
  category?: string;
  limit?: string;
};

export function registerSearchCommand(program: Command): void {
  program
    .command("search")
    .argument("<query>", "search query")
    .description("Search docs/spec for agent-friendly references (no API key required)")
    .option("--source <source>", "source strategy: auto|mcp|local", "auto")
    .option("--scope <scope>", "search scope: all|spec|docs", "all")
    .option("--category <name>", "optional docs category filter")
    .option("--limit <n>", "maximum number of hits (1-50)", "10")
    .action(async (...actionArgs: unknown[]) => {
      const query = actionArgs[0] as string;
      const options = actionArgs[1] as SearchOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);

      const source = parseDocsSourceOption(options.source);
      const scope = parseScope(options.scope);
      const category = normalizeCategory(options.category);
      const limit = parseIntegerOption("limit", options.limit, { min: 1, max: 50 }) ?? 10;
      const warnings: string[] = [];
      const hits: SearchHit[] = [];

      if (scope === "all" || scope === "spec") {
        hits.push(...buildSpecHits());
      }

      let sourceResolved: "local" | "mcp" = "local";
      if (scope === "all" || scope === "docs") {
        const resolved = await resolveDocsProvider(source);
        sourceResolved = resolved.sourceResolved;
        warnings.push(...resolved.warnings);
        try {
          const listed = await resolved.provider.listDocuments({
            category,
            limit: 200,
          });
          hits.push(
            ...listed.docs.map((doc) => toDocHit(doc.category, doc.filename, sourceResolved)),
          );
        } finally {
          await resolved.provider.dispose?.();
        }
      } else {
        sourceResolved = source === "mcp" ? "mcp" : "local";
      }

      const ranked = rankSearchHits(query, hits, limit);

      printSuccess(ctx, {
        query,
        scope,
        sourceResolved,
        warnings,
        hits: ranked,
      });
    });
}

function parseScope(value: string | undefined): SearchScope {
  const normalized = value?.trim().toLowerCase() ?? "all";
  if (normalized === "all" || normalized === "spec" || normalized === "docs") {
    return normalized;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Invalid scope: ${value}. Expected all, spec, or docs.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function normalizeCategory(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function buildSpecHits(): SearchHit[] {
  const spec = getCliSpec();
  return spec.commands.map((command) => ({
    kind: "command" as const,
    title: `microcms ${command.path}`,
    ref: command.path,
    snippet: `${command.description}. options: ${command.options.join(", ") || "none"}`,
    score: 0,
    source: "local" as const,
  }));
}

function toDocHit(category: string, filename: string, source: "local" | "mcp"): SearchHit {
  const title = filename.replace(/\.md$/i, "");
  return {
    kind: "doc",
    title,
    ref: `${category}/${filename}`,
    snippet: `${category} ${filename}`,
    score: 0,
    source,
    category,
    filename,
  };
}
