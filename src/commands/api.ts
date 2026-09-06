import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { createApi, getApiInfo, listApis } from "../core/client.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { readJsonFile } from "../core/io.js";
import { printSuccess } from "../core/output.js";
import { withOperationConfirmation } from "../core/operation-risk.js";
import { parseApiCreatePayload, type ApiType } from "../validation/api-creation.js";
import { withCommandContext } from "./utils.js";

type CreateOptions = {
  file: string;
  name?: string;
  endpoint?: string;
  type?: string;
  allowAdditionalCharge?: boolean;
  dryRun?: boolean;
};

export function registerApiCommands(program: Command): void {
  const api = program
    .command("api")
    .description("Create and inspect APIs and API schema entrypoints");

  api
    .command("create")
    .requiredOption("--file <path>", "API create payload JSON file")
    .option("--name <name>", "API name (overrides file)")
    .option("--endpoint <endpoint>", "API endpoint (overrides file)")
    .option("--type <type>", "API type: list|object (overrides file)")
    .option("--allow-additional-charge", "allow API creation above plan limit when supported")
    .option("--dry-run", "validate input without sending request")
    .description("Create an API via Management API")
    .action(
      withCommandContext(async (ctx, options: CreateOptions) => {
        const input = await readJsonFile(options.file);
        const payload = parseApiCreatePayload(input, {
          name: options.name,
          endpoint: options.endpoint,
          type: parseApiTypeOption(options.type),
        });
        const allowAdditionalCharge = Boolean(options.allowAdditionalCharge);

        if (options.dryRun) {
          printSuccess(
            ctx,
            withOperationConfirmation("api.create", {
              dryRun: true,
              operation: "api.create",
              file: options.file,
              payload,
              allowAdditionalCharge,
            }),
          );
          return;
        }

        const result = await createApi(ctx, payload, { allowAdditionalCharge });
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

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

function parseApiTypeOption(value: string | undefined): ApiType | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "list") {
    return "list";
  }

  if (normalized === "object") {
    return "object";
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Invalid API type: ${value}. Expected list or object.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}
