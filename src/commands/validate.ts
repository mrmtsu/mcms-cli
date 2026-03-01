import { Command } from "commander";
import { getApiInfo } from "../core/client.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { assertObjectPayload, readJsonFile } from "../core/io.js";
import { printSuccess } from "../core/output.js";
import { validatePayload, type ValidationResult } from "../validation/payload.js";
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
          const summary = summarizeValidationFailure(result, hasStrictWarningFailure);
          throw new CliError({
            code: "INVALID_INPUT",
            message: summary
              ? `Payload validation failed: ${summary}`
              : "Payload validation failed",
            details: {
              ...result,
              strictWarnings: Boolean(options.strictWarnings),
            },
            detailsVisibility: "always",
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

function summarizeValidationFailure(
  result: ValidationResult,
  includeWarnings: boolean,
  limit = 3,
): string {
  const reasons = includeWarnings ? [...result.errors, ...result.warnings] : result.errors;
  if (reasons.length === 0) {
    return "";
  }

  const head = reasons.slice(0, limit).join("; ");
  const rest = reasons.length - Math.min(limit, reasons.length);
  return rest > 0 ? `${head} (+${rest} more)` : head;
}
