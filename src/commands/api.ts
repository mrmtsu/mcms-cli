import { Command } from "commander";
import { getApiInfo, listApis } from "../core/client.js";
import { printSuccess } from "../core/output.js";
import { withCommandContext } from "./utils.js";

export function registerApiCommands(program: Command): void {
  const api = program.command("api").description("Inspect APIs");

  api
    .command("list")
    .description("List APIs")
    .action(
      withCommandContext(async (ctx) => {
        const result = await listApis(ctx);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  api
    .command("info")
    .argument("<endpoint>", "API endpoint")
    .description("Show API details")
    .action(
      withCommandContext(async (ctx, endpoint: string) => {
        const result = await getApiInfo(ctx, endpoint);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );
}
