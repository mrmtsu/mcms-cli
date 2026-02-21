import { Command } from "commander";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import {
  parseDocsSourceOption,
  resolveDocsProvider,
  truncateMarkdown,
} from "../core/docs/provider.js";
import { contextFromCommand, getActionCommand, parseIntegerOption } from "./utils.js";

type DocsListOptions = {
  source?: string;
  category?: string;
  limit?: string;
};

type DocsGetOptions = {
  source?: string;
  category?: string;
  file?: string;
  maxChars?: string;
};

export function registerDocsCommands(program: Command): void {
  const docs = program
    .command("docs")
    .description("Documentation reference operations (no API key required)");

  docs
    .command("list")
    .description("List official documentation metadata (no API key required)")
    .option("--source <source>", "source strategy: auto|mcp|local", "auto")
    .option("--category <name>", "optional document category")
    .option("--limit <n>", "number of documents to return (1-200)", "100")
    .action(async (...actionArgs: unknown[]) => {
      const options = actionArgs[0] as DocsListOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const source = parseDocsSourceOption(options.source);
      const limit = parseIntegerOption("limit", options.limit, { min: 1, max: 200 }) ?? 100;
      const category = normalizeCategory(options.category);
      const resolved = await resolveDocsProvider(source);

      try {
        const listed = await resolved.provider.listDocuments({ category, limit });
        printSuccess(ctx, {
          sourceResolved: resolved.sourceResolved,
          warnings: resolved.warnings,
          categories: listed.categories,
          docs: listed.docs,
          total: listed.total,
        });
      } finally {
        await resolved.provider.dispose?.();
      }
    });

  docs
    .command("get")
    .description("Get official documentation markdown (no API key required)")
    .requiredOption("--category <name>", "document category")
    .requiredOption("--file <filename>", "document filename")
    .option("--source <source>", "source strategy: auto|mcp|local", "auto")
    .option("--max-chars <n>", "truncate markdown output to N chars")
    .action(async (...actionArgs: unknown[]) => {
      const options = actionArgs[0] as DocsGetOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const source = parseDocsSourceOption(options.source);
      const category = requireValue("category", options.category);
      const filename = requireValue("file", options.file);
      const maxChars = parseIntegerOption("max-chars", options.maxChars, {
        min: 1,
        max: 1_000_000,
      });
      const resolved = await resolveDocsProvider(source);

      try {
        const document = await resolved.provider.getDocument({ category, filename });
        const truncated = truncateMarkdown(document.markdown, maxChars);

        if (ctx.json) {
          printSuccess(ctx, {
            category: document.category,
            filename: document.filename,
            markdown: truncated.markdown,
            truncated: truncated.truncated,
            originalLength: truncated.originalLength,
            sourceResolved: resolved.sourceResolved,
            warnings: resolved.warnings,
          });
          return;
        }

        process.stdout.write(`${truncated.markdown}\n`);
      } finally {
        await resolved.provider.dispose?.();
      }
    });
}

function normalizeCategory(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function requireValue(field: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (normalized && normalized.length > 0) {
    return normalized;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `--${field} is required`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}
