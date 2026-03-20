import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { getApiInfo, listApis } from "../core/client.js";
import { printSuccess } from "../core/output.js";
import { withCommandContext } from "./utils.js";

export function registerApiCommands(program: Command): void {
  const api = program.command("api").description("Inspect APIs and API schema entrypoints");

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
    .description(
      "Show API details for one-off inspection (use `microcms schema pull` or `microcms api schema export` for reusable schema exports)",
    )
    .action(
      withCommandContext(async (ctx, endpoint: string) => {
        const result = await getApiInfo(ctx, endpoint);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  const apiSchema = api
    .command("schema")
    .description("Schema-oriented aliases that improve discoverability without changing outputs");

  apiSchema
    .command("inspect")
    .argument("<endpoint>", "API endpoint")
    .description("Alias of `microcms api info <endpoint>` for schema discovery")
    .action(
      withCommandContext(async (ctx, endpoint: string) => {
        const result = await getApiInfo(ctx, endpoint);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  apiSchema
    .command("export")
    .argument("<endpoint>", "API endpoint")
    .option("--out <path>", "output JSON file")
    .description(
      "Export a single endpoint schema in API import-compatible shape (facade for `microcms schema pull --format api-export`)",
    )
    .action(
      withCommandContext(async (ctx, endpoint: string, options: { out?: string }) => {
        const result = await getApiInfo(ctx, endpoint);
        const outPath = options.out ?? `${endpoint}-api-schema.json`;
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, JSON.stringify(result.data, null, 2), "utf8");

        printSuccess(
          ctx,
          {
            out: outPath,
            format: "api-export",
            endpointCount: 1,
            endpoints: [endpoint],
            canonicalCommand: `microcms schema pull --format api-export --endpoints ${endpoint} --out ${outPath} --json`,
          },
          result.requestId,
        );
      }),
    );
}
