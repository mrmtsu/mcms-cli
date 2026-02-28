import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { toJsonSchema, type MicroCMSApiSchema } from "@mrmtsu/microcms-schema-adapter";
import { getApiInfo, listApis } from "../core/client.js";
import type { RuntimeContext } from "../core/context.js";
import { readJsonFile } from "../core/io.js";
import { buildSchemaBundle, diffSchemaBundles, extractApiEndpoints } from "../core/schema.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { withCommandContext } from "./utils.js";

type PullOptions = {
  out?: string;
  endpoints?: string;
  format?: "microcms" | "json-schema";
  includeExtensions?: boolean;
};

type DiffOptions = {
  baseline: string;
  exitCode?: boolean;
};

export function registerSchemaCommands(program: Command): void {
  const schema = program.command("schema").description("Schema operations");

  schema
    .command("pull")
    .description("Fetch API schema metadata and save to file")
    .option("--out <path>", "output JSON file", "microcms-schema.json")
    .option("--endpoints <list>", "comma-separated endpoints to pull")
    .option(
      "--format <format>",
      "output format (microcms: proprietary, json-schema: JSON Schema draft-07)",
      "microcms",
    )
    .option("--include-extensions", "include x-microcms-* extension properties (json-schema only)")
    .action(
      withCommandContext(async (ctx, options: PullOptions) => {
        const format = options.format ?? "microcms";
        if (format !== "microcms" && format !== "json-schema") {
          throw new CliError({
            code: "INVALID_INPUT",
            message: `Unknown format: "${format}". Use "microcms" or "json-schema".`,
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        const selectedEndpoints = parseEndpointsOption(options.endpoints);
        const remote = await pullRemoteSchemas(ctx, selectedEndpoints);

        const outPath = options.out ?? "microcms-schema.json";
        await mkdir(dirname(outPath), { recursive: true });

        if (format === "json-schema") {
          const adapterOptions = { includeExtensions: options.includeExtensions };
          const output =
            remote.apis.length === 1
              ? toJsonSchema(remote.apis[0].api as MicroCMSApiSchema, {
                  title: remote.apis[0].endpoint,
                  ...adapterOptions,
                })
              : Object.fromEntries(
                  remote.apis.map((entry) => [
                    entry.endpoint,
                    toJsonSchema(entry.api as MicroCMSApiSchema, {
                      title: entry.endpoint,
                      ...adapterOptions,
                    }),
                  ]),
                );

          await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
        } else {
          const bundle = buildSchemaBundle({
            serviceDomain: ctx.serviceDomain,
            apis: remote.apis,
          });
          await writeFile(outPath, JSON.stringify(bundle, null, 2), "utf8");
        }

        printSuccess(
          ctx,
          {
            out: outPath,
            format,
            endpointCount: remote.apis.length,
            endpoints: remote.apis.map((item) => item.endpoint),
          },
          remote.requestId,
        );
      }),
    );

  schema
    .command("diff")
    .description("Detect schema differences from baseline file")
    .requiredOption("--baseline <path>", "baseline schema JSON file (from schema pull)")
    .option("--exit-code", "return exit code 1 when differences are found")
    .action(
      withCommandContext(async (ctx, options: DiffOptions) => {
        const baseline = await readJsonFile(options.baseline);
        const remote = await pullRemoteSchemas(ctx, []);
        const current = buildSchemaBundle({
          serviceDomain: ctx.serviceDomain,
          apis: remote.apis,
        });
        const diff = diffSchemaBundles(baseline, current);

        if (options.exitCode && diff.hasDiff) {
          process.exitCode = EXIT_CODE.UNKNOWN;
        }

        printSuccess(
          ctx,
          {
            baseline: options.baseline,
            ...diff,
          },
          remote.requestId,
        );
      }),
    );
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

async function pullRemoteSchemas(
  ctx: RuntimeContext,
  selectedEndpoints: string[],
): Promise<{
  apis: Array<{ endpoint: string; api: unknown }>;
  requestId: string | null;
}> {
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
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const pulled: Array<{ endpoint: string; api: unknown }> = [];
  for (const endpoint of endpoints) {
    const info = await getApiInfo(ctx, endpoint);
    requestId = info.requestId ?? requestId;
    pulled.push({
      endpoint,
      api: info.data,
    });
  }

  return {
    apis: pulled,
    requestId,
  };
}
