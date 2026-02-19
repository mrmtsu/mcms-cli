import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { getApiInfo, listApis } from "../core/client.js";
import { buildSchemaBundle, extractApiEndpoints } from "../core/schema.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

type PullOptions = {
  out?: string;
  endpoints?: string;
};

export function registerSchemaCommands(program: Command): void {
  const schema = program.command("schema").description("Schema operations");

  schema
    .command("pull")
    .description("Fetch API schema metadata and save to file")
    .option("--out <path>", "output JSON file", "microcms-schema.json")
    .option("--endpoints <list>", "comma-separated endpoints to pull")
    .action(async (...actionArgs: unknown[]) => {
      const options = actionArgs[0] as PullOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);

      const selectedEndpoints = parseEndpointsOption(options.endpoints);
      let requestId: string | null = null;
      let endpoints: string[];

      if (selectedEndpoints.length > 0) {
        endpoints = selectedEndpoints;
      } else {
        const listed = await listApis(ctx);
        requestId = listed.requestId;
        endpoints = extractApiEndpoints(listed.data);
      }

      if (endpoints.length === 0) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: "No endpoints were found. Specify --endpoints or check API permissions.",
          exitCode: EXIT_CODE.INVALID_INPUT
        });
      }

      const pulled: Array<{ endpoint: string; api: unknown }> = [];
      for (const endpoint of endpoints) {
        const info = await getApiInfo(ctx, endpoint);
        requestId = info.requestId ?? requestId;
        pulled.push({
          endpoint,
          api: info.data
        });
      }

      const bundle = buildSchemaBundle({
        serviceDomain: ctx.serviceDomain,
        apis: pulled
      });

      const outPath = options.out ?? "microcms-schema.json";
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(bundle, null, 2), "utf8");

      printSuccess(
        ctx,
        {
          out: outPath,
          endpointCount: pulled.length,
          endpoints: pulled.map((item) => item.endpoint)
        },
        requestId
      );
    });
}

function parseEndpointsOption(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const endpoints = value
    .split(",")
    .map((endpoint) => endpoint.trim())
    .filter((endpoint) => endpoint.length > 0);

  return [...new Set(endpoints)];
}
