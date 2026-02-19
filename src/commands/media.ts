import { stat } from "node:fs/promises";
import { Command } from "commander";
import { uploadMedia } from "../core/client.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

export function registerMediaCommands(program: Command): void {
  const media = program.command("media").description("Media operations");

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
            exitCode: EXIT_CODE.INVALID_INPUT
          });
        });

        if (!file.isFile()) {
          throw new CliError({
            code: "INVALID_INPUT",
            message: `Path is not a file: ${path}`,
            details: { path },
            exitCode: EXIT_CODE.INVALID_INPUT
          });
        }

        printSuccess(ctx, {
          dryRun: true,
          operation: "media.upload",
          path,
          size: file.size
        });
        return;
      }

      const result = await uploadMedia(ctx, path);
      printSuccess(ctx, result.data, result.requestId);
    });
}
