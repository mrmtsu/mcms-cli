import { stat } from "node:fs/promises";
import { Command } from "commander";
import { listMedia, uploadMedia } from "../core/client.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand, parseIntegerOption } from "./utils.js";

type ListOptions = {
  limit?: string;
  imageOnly?: boolean;
  fileName?: string;
  token?: string;
};

export function registerMediaCommands(program: Command): void {
  const media = program.command("media").description("Media operations");

  media
    .command("list")
    .option("--limit <limit>")
    .option("--image-only", "retrieve images only")
    .option("--file-name <fileName>")
    .option("--token <token>")
    .action(async (...actionArgs: unknown[]) => {
      const options = actionArgs[0] as ListOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const queries = compactObject({
        limit: parseIntegerOption("limit", options.limit, { min: 1, max: 100 }),
        imageOnly: options.imageOnly,
        fileName: options.fileName,
        token: options.token,
      });

      const result = await listMedia(ctx, queries);
      printSuccess(ctx, result.data, result.requestId);
    });

  media
    .command("upload")
    .argument("<path>", "Path to media file")
    .option("--dry-run", "show operation without sending request")
    .action(async (...actionArgs: unknown[]) => {
      const path = actionArgs[0] as string;
      const options = actionArgs[1] as { dryRun?: boolean };
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);

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
    });
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
