import { stat } from "node:fs/promises";
import { Command } from "commander";
import { deleteMedia, listMedia, uploadMedia } from "../core/client.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { parseIntegerOption, withCommandContext } from "./utils.js";

type ListOptions = {
  limit?: string;
  imageOnly?: boolean;
  fileName?: string;
  token?: string;
};

type DeleteOptions = {
  url: string;
  dryRun?: boolean;
};

export function registerMediaCommands(program: Command): void {
  const media = program.command("media").description("Media operations");

  media
    .command("list")
    .option("--limit <limit>")
    .option("--image-only", "retrieve images only")
    .option("--file-name <fileName>")
    .option("--token <token>")
    .action(
      withCommandContext(async (ctx, options: ListOptions) => {
        const queries = compactObject({
          limit: parseIntegerOption("limit", options.limit, { min: 1, max: 100 }),
          imageOnly: options.imageOnly,
          fileName: options.fileName,
          token: options.token,
        });

        const result = await listMedia(ctx, queries);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  media
    .command("upload")
    .argument("<path>", "Path to media file")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(async (ctx, path: string, options: { dryRun?: boolean }) => {
        if (options.dryRun) {
          const file = await stat(path).catch(() => {
            throw new CliError({
              code: "INVALID_INPUT",
              message: `Could not read file: ${path}`,
              details: { path },
              exitCode: EXIT_CODE.INVALID_INPUT,
            });
          });

          if (!file.isFile()) {
            throw new CliError({
              code: "INVALID_INPUT",
              message: `Path is not a file: ${path}`,
              details: { path },
              exitCode: EXIT_CODE.INVALID_INPUT,
            });
          }

          printSuccess(ctx, {
            dryRun: true,
            operation: "media.upload",
            path,
            size: file.size,
          });
          return;
        }

        const result = await uploadMedia(ctx, path);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  media
    .command("delete")
    .requiredOption("--url <url>", "Media URL to delete")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(async (ctx, options: DeleteOptions) => {
        const url = parseMediaUrl(options.url);

        if (options.dryRun) {
          printSuccess(ctx, {
            dryRun: true,
            operation: "media.delete",
            url,
          });
          return;
        }

        const result = await deleteMedia(ctx, url);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function parseMediaUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Invalid url: ${value}. Expected a valid http(s) URL.`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Invalid url: ${value}. Expected a valid http(s) URL.`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return parsed.toString();
}
