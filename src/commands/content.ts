import { Command } from "commander";
import { createContent, deleteContent, getContent, listContent, updateContent } from "../core/client.js";
import type { RuntimeContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { assertObjectPayload, readJsonFile } from "../core/io.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand, parseIntegerOption } from "./utils.js";

type ListOptions = {
  limit?: string;
  offset?: string;
  orders?: string;
  q?: string;
  filters?: string;
  fields?: string;
  ids?: string;
  depth?: string;
  draftKey?: string;
  all?: boolean;
};

export function registerContentCommands(program: Command): void {
  const content = program.command("content").description("Content API operations");

  content
    .command("list")
    .argument("<endpoint>", "API endpoint")
    .option("--limit <limit>")
    .option("--offset <offset>")
    .option("--orders <orders>")
    .option("--q <q>")
    .option("--filters <filters>")
    .option("--fields <fields>")
    .option("--ids <ids>")
    .option("--depth <depth>")
    .option("--draft-key <draftKey>")
    .option("--all", "fetch all pages")
    .action(async (...actionArgs: unknown[]) => {
      const endpoint = actionArgs[0] as string;
      const options = actionArgs[1] as ListOptions;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const queries = compactObject({
        limit: parseIntegerOption("limit", options.limit, { min: 1, max: 100 }),
        offset: parseIntegerOption("offset", options.offset, { min: 0, max: 100000 }),
        orders: options.orders,
        q: options.q,
        filters: options.filters,
        fields: options.fields,
        ids: options.ids,
        depth: parseIntegerOption("depth", options.depth, { min: 0, max: 3 }),
        draftKey: options.draftKey
      });
      const result = options.all
        ? await listContentAll(ctx, endpoint, queries)
        : await listContent(ctx, endpoint, queries);
      printSuccess(ctx, result.data, result.requestId);
    });

  content
    .command("get")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .option("--draft-key <draftKey>")
    .action(async (...actionArgs: unknown[]) => {
      const endpoint = actionArgs[0] as string;
      const id = actionArgs[1] as string;
      const options = actionArgs[2] as { draftKey?: string };
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const result = await getContent(ctx, endpoint, id, compactObject({ draftKey: options.draftKey }));
      printSuccess(ctx, result.data, result.requestId);
    });

  content
    .command("create")
    .argument("<endpoint>", "API endpoint")
    .requiredOption("--file <path>", "Payload JSON file")
    .option("--dry-run", "show operation without sending request")
    .action(async (...actionArgs: unknown[]) => {
      const endpoint = actionArgs[0] as string;
      const options = actionArgs[1] as { file: string; dryRun?: boolean };
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const payload = assertObjectPayload(await readJsonFile(options.file));

      if (options.dryRun) {
        printSuccess(ctx, {
          dryRun: true,
          operation: "content.create",
          endpoint,
          payload
        });
        return;
      }

      const result = await createContent(ctx, endpoint, payload);
      printSuccess(ctx, result.data, result.requestId);
    });

  content
    .command("update")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .requiredOption("--file <path>", "Payload JSON file")
    .option("--dry-run", "show operation without sending request")
    .action(async (...actionArgs: unknown[]) => {
      const endpoint = actionArgs[0] as string;
      const id = actionArgs[1] as string;
      const options = actionArgs[2] as { file: string; dryRun?: boolean };
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const payload = assertObjectPayload(await readJsonFile(options.file));

      if (options.dryRun) {
        printSuccess(ctx, {
          dryRun: true,
          operation: "content.update",
          endpoint,
          id,
          payload
        });
        return;
      }

      const result = await updateContent(ctx, endpoint, id, payload);
      printSuccess(ctx, result.data, result.requestId);
    });

  content
    .command("delete")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .option("--dry-run", "show operation without sending request")
    .action(async (...actionArgs: unknown[]) => {
      const endpoint = actionArgs[0] as string;
      const id = actionArgs[1] as string;
      const options = actionArgs[2] as { dryRun?: boolean };
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);

      if (options.dryRun) {
        printSuccess(ctx, {
          dryRun: true,
          operation: "content.delete",
          endpoint,
          id
        });
        return;
      }

      const result = await deleteContent(ctx, endpoint, id);
      const data =
        typeof result.data === "object" && result.data !== null
          ? result.data
          : {
              id,
              deleted: true
            };
      printSuccess(ctx, data, result.requestId);
    });
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

async function listContentAll(
  ctx: RuntimeContext,
  endpoint: string,
  queries: Partial<{
    limit: number;
    offset: number;
    orders: string;
    q: string;
    filters: string;
    fields: string;
    ids: string;
    depth: number;
    draftKey: string;
  }>
): Promise<{ data: unknown; requestId: string | null }> {
  const pageSize = queries.limit ?? 100;
  let offset = queries.offset ?? 0;
  const startOffset = offset;
  const mergedContents: unknown[] = [];
  let requestId: string | null = null;
  let totalCount: number | undefined;

  for (let i = 0; i < 10_000; i += 1) {
    const result = await listContent(ctx, endpoint, {
      ...queries,
      limit: pageSize,
      offset
    });
    requestId = result.requestId;
    const page = parseListShape(result.data);

    if (!page) {
      throw new CliError({
        code: "API_ERROR",
        message: "--all requires a list response containing `contents` and `totalCount`.",
        exitCode: EXIT_CODE.UNKNOWN
      });
    }

    totalCount = page.totalCount;
    mergedContents.push(...page.contents);

    if (mergedContents.length >= totalCount || page.contents.length === 0) {
      break;
    }

    offset += page.contents.length;
  }

  return {
    data: {
      contents: mergedContents,
      totalCount: totalCount ?? mergedContents.length,
      offset: startOffset,
      limit: pageSize
    },
    requestId
  };
}

function parseListShape(
  data: unknown
): {
  contents: unknown[];
  totalCount: number;
} | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const candidate = data as { contents?: unknown; totalCount?: unknown };
  if (!Array.isArray(candidate.contents) || typeof candidate.totalCount !== "number") {
    return null;
  }

  return {
    contents: candidate.contents,
    totalCount: candidate.totalCount
  };
}
