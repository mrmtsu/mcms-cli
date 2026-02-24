import { Command } from "commander";
import { getMember } from "../core/client.js";
import { printSuccess } from "../core/output.js";
import { withCommandContext } from "./utils.js";

export function registerMemberCommands(program: Command): void {
  const member = program.command("member").description("Member operations");

  member
    .command("get")
    .argument("<memberId>", "Member ID")
    .description("Get member details from management API")
    .action(
      withCommandContext(async (ctx, memberId: string) => {
        const result = await getMember(ctx, memberId);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );
}
