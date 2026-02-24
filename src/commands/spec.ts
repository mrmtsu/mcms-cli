import { Command } from "commander";
import { printSuccess } from "../core/output.js";
import { getCliSpec } from "../core/spec.js";
import { withCommandContext } from "./utils.js";

export function registerSpecCommand(program: Command): void {
  program
    .command("spec")
    .description("Output machine-readable CLI spec")
    .action(
      withCommandContext(async (ctx) => {
        const spec = getCliSpec();
        printSuccess(ctx, spec);
      }),
    );
}
