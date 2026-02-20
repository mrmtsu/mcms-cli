import { Command } from "commander";
import { printSuccess } from "../core/output.js";
import { getCliSpec } from "../core/spec.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

export function registerSpecCommand(program: Command): void {
  program
    .command("spec")
    .description("Output machine-readable CLI spec")
    .action(async (...actionArgs: unknown[]) => {
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const spec = getCliSpec();
      printSuccess(ctx, spec);
    });
}
