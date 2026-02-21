import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { getApiInfo, listApis } from "../core/client.js";
import { readJsonFile } from "../core/io.js";
import { buildSchemaBundle, extractApiEndpoints, generateTypesFromSchema } from "../core/schema.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

type GenerateOptions = {
  schema?: string;
  out?: string;
  endpoints?: string;
};

export function registerTypesCommands(program: Command): void {
  const types = program.command("types").description("Type generation operations");

  types
    .command("generate")
    .description("Generate TypeScript type definitions from microCMS API schema")
    .option("--schema <path>", "use local schema JSON file")
    .option("--out <path>", "output declaration file", "microcms-types.d.ts")
    .option("--endpoints <list>", "comma-separated endpoints to fetch (when --schema is not used)")
    .action(async (...actionArgs: unknown[]) => {
      const options = actionArgs[0] as GenerateOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);

      let source: unknown;
      let requestId: string | null = null;

      if (options.schema) {
        source = await readJsonFile(options.schema);
      } else {
        const selectedEndpoints = parseEndpointsOption(options.endpoints);
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
            message: "No endpoints were found. Specify --endpoints or provide --schema.",
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        const apis: Array<{ endpoint: string; api: unknown }> = [];
        for (const endpoint of endpoints) {
          const info = await getApiInfo(ctx, endpoint);
          requestId = info.requestId ?? requestId;
          apis.push({ endpoint, api: info.data });
        }

        source = buildSchemaBundle({
          serviceDomain: ctx.serviceDomain,
          apis,
        });
      }

      const generated = generateTypesFromSchema(source);
      if (generated.endpointCount === 0) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: "No schema entries were found to generate types.",
          exitCode: EXIT_CODE.INVALID_INPUT,
        });
      }

      const outPath = options.out ?? "microcms-types.d.ts";
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, generated.code, "utf8");

      printSuccess(
        ctx,
        {
          out: outPath,
          endpointCount: generated.endpointCount,
          warnings: generated.warnings,
          source: options.schema ? "schema_file" : "management_api",
        },
        requestId,
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
