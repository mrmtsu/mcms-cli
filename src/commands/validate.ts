import { Command } from "commander";
import { getApiInfo } from "../core/client.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { assertObjectPayload, readJsonFile } from "../core/io.js";
import { printSuccess } from "../core/output.js";
import { validatePayload } from "../validation/payload.js";
import { contextFromCommand } from "./utils.js";

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .argument("<endpoint>", "API endpoint")
    .requiredOption("--file <path>", "Payload JSON file")
    .option("--strict-warnings", "treat warnings as validation errors")
    .description("Run lightweight payload precheck before create/update")
    .action(
      async (
        endpoint: string,
        options: { file: string; strictWarnings?: boolean },
        command: Command,
      ) => {
        const ctx = await contextFromCommand(command);
        const payload = assertObjectPayload(await readJsonFile(options.file));
        const apiInfo = await getApiInfo(ctx, endpoint);
        const result = validatePayload(payload, apiInfo.data);
        const hasStrictWarningFailure = Boolean(
          options.strictWarnings && result.warnings.length > 0,
        );

        if (!result.valid || hasStrictWarningFailure) {
          throw new CliError({
            code: "INVALID_INPUT",
            message: "Payload validation failed",
            details: {
              ...result,
              strictWarnings: Boolean(options.strictWarnings),
            },
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        printSuccess(
          ctx,
          {
            endpoint,
            ...result,
          },
          apiInfo.requestId,
        );
      },
    );
}
