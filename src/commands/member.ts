import { Command } from "commander";
import { getMember } from "../core/client.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

export function registerMemberCommands(program: Command): void {
  const member = program.command("member").description("Member operations");

  member
    .command("get")
    .argument("<memberId>", "Member ID")
    .description("Get member details from management API")
    .action(async (...actionArgs: unknown[]) => {
      const memberId = actionArgs[0] as string;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const result = await getMember(ctx, memberId);
      printSuccess(ctx, result.data, result.requestId);
    });
}
