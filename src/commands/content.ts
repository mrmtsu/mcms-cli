import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { Command } from "commander";
import {
  createContent,
  deleteContent,
  getApiInfo,
  getContentMeta,
  getContent,
  listApis,
  listContentMeta,
  listContent,
  patchContentCreatedBy,
  patchContentStatus,
  updateContent,
} from "../core/client.js";
import type { RuntimeContext } from "../core/context.js";
import { CliError, normalizeError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { assertObjectPayload, readJsonFile } from "../core/io.js";
import { printSuccess } from "../core/output.js";
import { extractApiEndpoints } from "../core/schema.js";
import { parseBulkOperations, type BulkOperation } from "../validation/bulk-operations.js";
import { validatePayload, type ValidationIssue } from "../validation/payload.js";
import { parseIntegerOption, parseIntervalOption, sleepMs, withCommandContext } from "./utils.js";

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

type MetaListOptions = {
  limit?: string;
  offset?: string;
};

type StatusSetOptions = {
  status: string;
  dryRun?: boolean;
};

type CreatedBySetOptions = {
  member: string;
  dryRun?: boolean;
};

type ExportOptions = {
  out?: string;
  all?: boolean;
  format?: string;
};

type ImportOptions = {
  file: string;
  dryRun?: boolean;
  upsert?: boolean;
  interval?: string;
  strictWarnings?: boolean;
};

type BulkOptions = {
  file: string;
  dryRun?: boolean;
  interval?: string;
  continueOnError?: boolean;
  stopOnError?: boolean;
  validatePayload?: boolean;
  strictWarnings?: boolean;
};

type DiffOptions = {
  draftKey: string;
};

export function registerContentCommands(program: Command): void {
  const content = program.command("content").description("Content API operations");

  content
    .command("export")
    .argument("[endpoint]", "API endpoint")
    .requiredOption("--out <path>", "output file path (or directory when --all is set)")
    .option("--all", "export all endpoints")
    .option("--format <format>", "output format: json|csv", "json")
    .action(
      withCommandContext(async (ctx, endpoint: string | undefined, options: ExportOptions) => {
        const format = parseExportFormat(options.format);
        const outPath = normalizeOutPath(options.out);
        const requestState = { requestId: null as string | null };

        if (options.all) {
          if (endpoint) {
            throw new CliError({
              code: "INVALID_INPUT",
              message: "Do not pass <endpoint> together with --all.",
              exitCode: EXIT_CODE.INVALID_INPUT,
            });
          }

          const targets = await listExportTargets(ctx, requestState);
          const exported: Array<{ endpoint: string; out: string; count: number }> = [];
          const skipped = [...targets.skipped];

          for (const targetEndpoint of targets.endpoints) {
            try {
              const page = await exportEndpoint(ctx, targetEndpoint, requestState);
              const filePath = resolveExportAllPath(outPath, targetEndpoint, format);
              const fileBody = renderExportFile(
                {
                  endpoint: targetEndpoint,
                  totalCount: page.totalCount,
                  contents: page.contents,
                },
                format,
              );
              await writeExportFile(filePath, fileBody);
              exported.push({
                endpoint: targetEndpoint,
                out: filePath,
                count: page.contents.length,
              });
            } catch (error) {
              if (
                error instanceof CliError &&
                error.code === "API_ERROR" &&
                error.message.includes("list response containing `contents` and `totalCount`")
              ) {
                skipped.push({
                  endpoint: targetEndpoint,
                  reason: "non_list_endpoint",
                });
                continue;
              }

              throw error;
            }
          }

          printSuccess(
            ctx,
            {
              operation: "content.export",
              mode: "all",
              format,
              out: outPath,
              endpointCount: exported.length,
              exported,
              skipped,
            },
            requestState.requestId,
          );
          return;
        }

        if (!endpoint) {
          throw new CliError({
            code: "INVALID_INPUT",
            message: "Endpoint is required unless --all is set.",
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        const page = await exportEndpoint(ctx, endpoint, requestState);
        const fileBody = renderExportFile(
          {
            endpoint,
            totalCount: page.totalCount,
            contents: page.contents,
          },
          format,
        );
        await writeExportFile(outPath, fileBody);

        printSuccess(
          ctx,
          {
            operation: "content.export",
            endpoint,
            format,
            out: outPath,
            count: page.contents.length,
          },
          requestState.requestId,
        );
      }),
    );

  content
    .command("import")
    .argument("<endpoint>", "API endpoint")
    .requiredOption("--file <path>", "input JSON file")
    .option("--dry-run", "validate input without sending write requests")
    .option("--upsert", "update by id when present; create when id is missing/not found")
    .option("--interval <ms>", "delay between each write request in milliseconds")
    .option("--strict-warnings", "treat validation warnings as errors")
    .action(
      withCommandContext(async (ctx, endpoint: string, options: ImportOptions) => {
        const intervalMs = parseImportInterval(options.interval);
        const input = await readJsonFile(options.file);
        const items = parseImportItems(input);
        const shouldValidate = Boolean(options.dryRun || options.strictWarnings);
        let validationRequestId: string | null = null;
        let checks: Array<{
          index: number;
          id: string | null;
          valid: boolean;
          errors: string[];
          warnings: string[];
          issues: ValidationIssue[];
        }> = [];

        if (shouldValidate) {
          const schema = await getApiInfo(ctx, endpoint);
          validationRequestId = schema.requestId;
          checks = items.map((item, index) => {
            const { id, payload } = splitImportItem(item);
            const validation = validatePayload(payload, schema.data);
            const valid =
              validation.valid && !(options.strictWarnings && validation.warnings.length > 0);
            return {
              index: index + 1,
              id: id ?? null,
              valid,
              errors: validation.errors,
              warnings: validation.warnings,
              issues: validation.issues,
            };
          });

          const invalid = checks.filter((entry) => !entry.valid);
          if (invalid.length > 0) {
            const baseMessage = options.dryRun
              ? "Import dry-run validation failed"
              : "Import payload validation failed";
            const summary = summarizeImportValidationFailure(
              invalid,
              Boolean(options.strictWarnings),
            );
            throw new CliError({
              code: "INVALID_INPUT",
              message: summary ? `${baseMessage}: ${summary}` : baseMessage,
              exitCode: EXIT_CODE.INVALID_INPUT,
              detailsVisibility: "always",
              details: {
                endpoint,
                file: options.file,
                invalidCount: invalid.length,
                strictWarnings: Boolean(options.strictWarnings),
                items: invalid,
              },
            });
          }
        }

        if (options.dryRun) {
          printSuccess(
            ctx,
            {
              dryRun: true,
              operation: "content.import",
              endpoint,
              file: options.file,
              total: items.length,
              upsert: Boolean(options.upsert),
              intervalMs,
              strictWarnings: Boolean(options.strictWarnings),
              checked: checks,
            },
            validationRequestId,
          );
          return;
        }

        const results: Array<{
          index: number;
          action: "create" | "update";
          id: string | null;
          sourceId: string | null;
        }> = [];
        let requestId: string | null = validationRequestId;

        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const { id, payload } = splitImportItem(item);

          if (options.upsert && id) {
            try {
              const updated = await updateContent(ctx, endpoint, id, payload);
              requestId = updated.requestId ?? requestId;
              results.push({
                index: index + 1,
                action: "update",
                id,
                sourceId: id,
              });
              emitProgress(ctx, `[${index + 1}/${items.length}] Updated: ${id}`);
            } catch (error) {
              if (!(error instanceof CliError) || error.code !== "NOT_FOUND") {
                throw error;
              }

              const created = await createContent(ctx, endpoint, payload);
              requestId = created.requestId ?? requestId;
              const createdId = extractIdFromResponse(created.data);
              results.push({
                index: index + 1,
                action: "create",
                id: createdId,
                sourceId: id,
              });
              emitProgress(
                ctx,
                `[${index + 1}/${items.length}] Created: ${createdId ?? id ?? "(unknown-id)"}`,
              );
            }
          } else {
            const created = await createContent(ctx, endpoint, payload);
            requestId = created.requestId ?? requestId;
            const createdId = extractIdFromResponse(created.data);
            results.push({
              index: index + 1,
              action: "create",
              id: createdId,
              sourceId: id ?? null,
            });
            emitProgress(
              ctx,
              `[${index + 1}/${items.length}] Created: ${createdId ?? id ?? "(unknown-id)"}`,
            );
          }

          if (intervalMs > 0 && index < items.length - 1) {
            await sleepMs(intervalMs);
          }
        }

        const createdCount = results.filter((entry) => entry.action === "create").length;
        const updatedCount = results.filter((entry) => entry.action === "update").length;

        printSuccess(
          ctx,
          {
            operation: "content.import",
            endpoint,
            file: options.file,
            total: items.length,
            upsert: Boolean(options.upsert),
            intervalMs,
            strictWarnings: Boolean(options.strictWarnings),
            created: createdCount,
            updated: updatedCount,
            results,
          },
          requestId,
        );
      }),
    );

  content
    .command("bulk")
    .requiredOption("--file <path>", "bulk operation JSON file")
    .option("--dry-run", "validate operation file structure without executing writes")
    .option("--interval <ms>", "delay between each write request in milliseconds")
    .option("--continue-on-error", "continue processing even when an operation fails")
    .option("--stop-on-error", "stop processing on first failed operation (default)")
    .option(
      "--validate-payload",
      "validate create/update payloads against API schema (requires auth)",
    )
    .option("--strict-warnings", "treat validation warnings as errors")
    .action(
      withCommandContext(async (ctx, options: BulkOptions) => {
        const intervalMs = parseBulkInterval(options.interval);
        const input = await readJsonFile(options.file);
        const operations = parseBulkOperations(input);
        if (options.continueOnError && options.stopOnError) {
          throw new CliError({
            code: "INVALID_INPUT",
            message: "--continue-on-error and --stop-on-error cannot be used together.",
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }
        const stopOnError = Boolean(options.stopOnError) || !options.continueOnError;
        const shouldValidate = Boolean(options.validatePayload || options.strictWarnings);
        let validationRequestId: string | null = null;
        let checks: BulkValidationCheck[] = [];

        if (shouldValidate) {
          const endpoints = [
            ...new Set(
              operations
                .filter(
                  (operation) => operation.action === "create" || operation.action === "update",
                )
                .map((operation) => operation.endpoint),
            ),
          ];
          const schemas = new Map<string, unknown>();
          for (const endpoint of endpoints) {
            const info = await getApiInfo(ctx, endpoint);
            validationRequestId = info.requestId ?? validationRequestId;
            schemas.set(endpoint, info.data);
          }

          checks = operations
            .map((operation, index): BulkValidationCheck | null => {
              if (operation.action !== "create" && operation.action !== "update") {
                return null;
              }

              const schema = schemas.get(operation.endpoint);
              const validation = validatePayload(operation.payload, schema);
              const valid =
                validation.valid && !(options.strictWarnings && validation.warnings.length > 0);
              return {
                index: index + 1,
                action: operation.action,
                endpoint: operation.endpoint,
                id: operation.action === "update" ? operation.id : null,
                valid,
                errors: validation.errors,
                warnings: validation.warnings,
                issues: validation.issues,
              };
            })
            .filter((entry): entry is BulkValidationCheck => entry !== null);

          const invalid = checks.filter((entry) => !entry.valid);
          if (invalid.length > 0) {
            const summary = summarizeBulkValidationFailure(
              invalid,
              Boolean(options.strictWarnings),
            );
            throw new CliError({
              code: "INVALID_INPUT",
              message: summary
                ? `Bulk payload validation failed: ${summary}`
                : "Bulk payload validation failed",
              exitCode: EXIT_CODE.INVALID_INPUT,
              detailsVisibility: "always",
              details: {
                file: options.file,
                invalidCount: invalid.length,
                strictWarnings: Boolean(options.strictWarnings),
                items: invalid,
              },
            });
          }
        }

        if (options.dryRun) {
          printSuccess(
            ctx,
            {
              dryRun: true,
              operation: "content.bulk",
              file: options.file,
              total: operations.length,
              intervalMs,
              stopOnError,
              validatePayload: Boolean(options.validatePayload || options.strictWarnings),
              strictWarnings: Boolean(options.strictWarnings),
              checked: checks,
              operations,
            },
            validationRequestId,
          );
          return;
        }

        const results: BulkResultItem[] = [];
        let succeeded = 0;
        let failed = 0;
        let skipped = 0;
        let requestId: string | null = validationRequestId;

        for (let index = 0; index < operations.length; index += 1) {
          const target = operations[index];
          const operationLabel = formatBulkOperationLabel(target);
          try {
            const executed = await executeBulkOperation(ctx, target);
            requestId = executed.requestId ?? requestId;
            succeeded += 1;
            const resolvedId = "id" in target ? target.id : extractIdFromResponse(executed.data);
            results.push({
              index: index + 1,
              action: target.action,
              endpoint: target.endpoint,
              id: resolvedId,
              status: "succeeded",
              data: executed.data,
            });
            emitProgress(ctx, `[${index + 1}/${operations.length}] Succeeded: ${operationLabel}`);
          } catch (error) {
            const normalized = normalizeError(error);
            failed += 1;
            emitProgress(
              ctx,
              `[${index + 1}/${operations.length}] Failed: ${operationLabel} (${normalized.code})`,
            );
            results.push({
              index: index + 1,
              action: target.action,
              endpoint: target.endpoint,
              id: "id" in target ? target.id : null,
              status: "failed",
              error: normalized.toJson({ includeDetails: ctx.verbose }),
            });

            if (stopOnError) {
              emitProgress(ctx, "Stopping due to error (--stop-on-error).");
              for (let rest = index + 1; rest < operations.length; rest += 1) {
                const pending = operations[rest];
                skipped += 1;
                results.push({
                  index: rest + 1,
                  action: pending.action,
                  endpoint: pending.endpoint,
                  id: "id" in pending ? pending.id : null,
                  status: "skipped",
                });
              }
              break;
            }
          }

          if (intervalMs > 0 && index < operations.length - 1) {
            await sleepMs(intervalMs);
          }
        }

        if (failed > 0) {
          process.exitCode = EXIT_CODE.UNKNOWN;
        }

        printSuccess(
          ctx,
          {
            operation: "content.bulk",
            file: options.file,
            total: operations.length,
            intervalMs,
            stopOnError,
            validatePayload: Boolean(options.validatePayload || options.strictWarnings),
            strictWarnings: Boolean(options.strictWarnings),
            succeeded,
            failed,
            skipped,
            results,
          },
          requestId,
        );
      }),
    );

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
    .action(
      withCommandContext(async (ctx, endpoint: string, options: ListOptions) => {
        const queries = compactObject({
          limit: parseIntegerOption("limit", options.limit, { min: 1, max: 100 }),
          offset: parseIntegerOption("offset", options.offset, { min: 0, max: 100000 }),
          orders: options.orders,
          q: options.q,
          filters: options.filters,
          fields: options.fields,
          ids: options.ids,
          depth: parseIntegerOption("depth", options.depth, { min: 0, max: 3 }),
          draftKey: options.draftKey,
        });
        const result = options.all
          ? await listContentAllWithFetcher(ctx, endpoint, queries, (nextQueries) =>
              listContent(ctx, endpoint, nextQueries),
            )
          : await listContent(ctx, endpoint, queries);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  content
    .command("get")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .option("--draft-key <draftKey>")
    .action(
      withCommandContext(
        async (ctx, endpoint: string, id: string, options: { draftKey?: string }) => {
          const result = await getContent(
            ctx,
            endpoint,
            id,
            compactObject({ draftKey: options.draftKey }),
          );
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );

  content
    .command("diff")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .requiredOption("--draft-key <draftKey>", "draft key for preview content")
    .action(
      withCommandContext(async (ctx, endpoint: string, id: string, options: DiffOptions) => {
        const published = await getContent(ctx, endpoint, id);
        const draft = await getContent(
          ctx,
          endpoint,
          id,
          compactObject({ draftKey: options.draftKey }),
        );

        const publishedData = parseDiffContent(published.data, "published");
        const draftData = parseDiffContent(draft.data, "draft");
        const diff = diffTopLevelContentFields(publishedData, draftData);
        const payload: ContentDiffPayload = {
          operation: "content.diff",
          endpoint,
          id,
          draftKey: options.draftKey,
          ...diff,
        };
        const output =
          ctx.outputMode === "plain"
            ? renderContentDiffPlain(payload)
            : ctx.outputMode === "table"
              ? renderContentDiffTable(payload)
              : payload;

        printSuccess(ctx, output, draft.requestId ?? published.requestId);
      }),
    );

  content
    .command("create")
    .argument("<endpoint>", "API endpoint")
    .requiredOption("--file <path>", "Payload JSON file")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(
        async (ctx, endpoint: string, options: { file: string; dryRun?: boolean }) => {
          const payload = assertObjectPayload(await readJsonFile(options.file));

          if (options.dryRun) {
            printSuccess(ctx, {
              dryRun: true,
              operation: "content.create",
              endpoint,
              payload,
            });
            return;
          }

          const result = await createContent(ctx, endpoint, payload);
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );

  content
    .command("update")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .requiredOption("--file <path>", "Payload JSON file")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(
        async (ctx, endpoint: string, id: string, options: { file: string; dryRun?: boolean }) => {
          const payload = assertObjectPayload(await readJsonFile(options.file));

          if (options.dryRun) {
            printSuccess(ctx, {
              dryRun: true,
              operation: "content.update",
              endpoint,
              id,
              payload,
            });
            return;
          }

          const result = await updateContent(ctx, endpoint, id, payload);
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );

  content
    .command("delete")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(
        async (ctx, endpoint: string, id: string, options: { dryRun?: boolean }) => {
          if (options.dryRun) {
            printSuccess(ctx, {
              dryRun: true,
              operation: "content.delete",
              endpoint,
              id,
            });
            return;
          }

          const result = await deleteContent(ctx, endpoint, id);
          const data =
            typeof result.data === "object" && result.data !== null
              ? result.data
              : {
                  id,
                  deleted: true,
                };
          printSuccess(ctx, data, result.requestId);
        },
      ),
    );

  const meta = content.command("meta").description("Management API content metadata operations");

  meta
    .command("list")
    .argument("<endpoint>", "API endpoint")
    .option("--limit <limit>")
    .option("--offset <offset>")
    .action(
      withCommandContext(async (ctx, endpoint: string, options: MetaListOptions) => {
        const queries = compactObject({
          limit: parseIntegerOption("limit", options.limit, { min: 1, max: 100 }),
          offset: parseIntegerOption("offset", options.offset, { min: 0, max: 100000 }),
        });

        const result = await listContentMeta(ctx, endpoint, queries);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  meta
    .command("get")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .action(
      withCommandContext(async (ctx, endpoint: string, id: string) => {
        const result = await getContentMeta(ctx, endpoint, id);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  const status = content.command("status").description("Management API content status operations");

  status
    .command("set")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .requiredOption("--status <status>", "Target status: PUBLISH|DRAFT")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(async (ctx, endpoint: string, id: string, options: StatusSetOptions) => {
        const normalizedStatus = parseContentStatus(options.status);

        if (options.dryRun) {
          printSuccess(ctx, {
            dryRun: true,
            operation: "content.status.set",
            endpoint,
            id,
            status: normalizedStatus,
          });
          return;
        }

        const result = await patchContentStatus(ctx, endpoint, id, normalizedStatus);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  const createdBy = content
    .command("created-by")
    .description("Management API content creator operations");

  createdBy
    .command("set")
    .argument("<endpoint>", "API endpoint")
    .argument("<id>", "Content ID")
    .requiredOption("--member <memberId>", "Target member ID")
    .option("--dry-run", "show operation without sending request")
    .action(
      withCommandContext(
        async (ctx, endpoint: string, id: string, options: CreatedBySetOptions) => {
          const memberId = parseCreatedByMemberId(options.member);

          if (options.dryRun) {
            printSuccess(ctx, {
              dryRun: true,
              operation: "content.created-by.set",
              endpoint,
              id,
              memberId,
            });
            return;
          }

          const result = await patchContentCreatedBy(ctx, endpoint, id, memberId);
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

type ListContentQuery = Partial<{
  limit: number;
  offset: number;
  orders: string;
  q: string;
  filters: string;
  fields: string;
  ids: string;
  depth: number;
  draftKey: string;
}>;

const MAX_ALL_PAGES = 10_000;
const DEFAULT_MAX_ALL_ITEMS = 100_000;

type ListFetcher = (
  queries: ListContentQuery,
) => Promise<{ data: unknown; requestId: string | null }>;

export async function listContentAllWithFetcher(
  ctx: RuntimeContext,
  endpoint: string,
  queries: ListContentQuery,
  fetchList: ListFetcher,
): Promise<{ data: unknown; requestId: string | null }> {
  const maxItems = resolveMaxAllItems();
  const pageSize = queries.limit ?? 100;
  let offset = queries.offset ?? 0;
  const startOffset = offset;
  const mergedContents: unknown[] = [];
  let requestId: string | null = null;
  let totalCount: number | undefined;
  let completed = false;

  for (let i = 0; i < MAX_ALL_PAGES; i += 1) {
    const result = await fetchList({
      ...queries,
      limit: pageSize,
      offset,
    });
    requestId = result.requestId;
    const page = parseListShape(result.data);

    if (!page) {
      throw new CliError({
        code: "API_ERROR",
        message: "--all requires a list response containing `contents` and `totalCount`.",
        exitCode: EXIT_CODE.UNKNOWN,
      });
    }

    if (totalCount === undefined) {
      totalCount = page.totalCount;
    } else if (page.totalCount !== totalCount) {
      throw new CliError({
        code: "API_ERROR",
        message:
          "--all detected inconsistent `totalCount` between pages. Stop and rerun without --all.",
        exitCode: EXIT_CODE.UNKNOWN,
        details: ctx.verbose
          ? {
              endpoint,
              previousTotalCount: totalCount,
              currentTotalCount: page.totalCount,
              offset,
            }
          : undefined,
      });
    }

    mergedContents.push(...page.contents);

    if (mergedContents.length > maxItems) {
      throw new CliError({
        code: "API_ERROR",
        message: `--all exceeded safety limit (${maxItems} items). Narrow filters or disable --all.`,
        exitCode: EXIT_CODE.UNKNOWN,
        details: ctx.verbose
          ? {
              endpoint,
              mergedCount: mergedContents.length,
              limit: maxItems,
            }
          : undefined,
      });
    }

    if (mergedContents.length >= totalCount || page.contents.length === 0) {
      completed = true;
      break;
    }

    offset += page.contents.length;
  }

  if (!completed) {
    throw new CliError({
      code: "API_ERROR",
      message: `--all stopped after ${MAX_ALL_PAGES} pages (safety cap). Narrow filters or lower result size.`,
      exitCode: EXIT_CODE.UNKNOWN,
      details: ctx.verbose
        ? {
            endpoint,
            pages: MAX_ALL_PAGES,
          }
        : undefined,
    });
  }

  return {
    data: {
      contents: mergedContents,
      totalCount: totalCount ?? mergedContents.length,
      offset: startOffset,
      limit: pageSize,
    },
    requestId,
  };
}

function resolveMaxAllItems(): number {
  const raw = process.env.MICROCMS_CONTENT_ALL_MAX_ITEMS;
  if (!raw) {
    return DEFAULT_MAX_ALL_ITEMS;
  }

  if (!/^\d+$/.test(raw.trim())) {
    return DEFAULT_MAX_ALL_ITEMS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_ALL_ITEMS;
  }

  return parsed;
}

function parseListShape(data: unknown): {
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
    totalCount: candidate.totalCount,
  };
}

function parseContentStatus(value: string): "PUBLISH" | "DRAFT" {
  const normalized = value.trim().toUpperCase();
  if (normalized === "PUBLISH" || normalized === "DRAFT") {
    return normalized;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Invalid status: ${value}. Expected PUBLISH or DRAFT.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function parseCreatedByMemberId(value: string): string {
  const memberId = value.trim();
  if (memberId.length > 0) {
    return memberId;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: "Invalid member ID: value is empty.",
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function parseExportFormat(value: string | undefined): "json" | "csv" {
  const normalized = value?.trim().toLowerCase() ?? "json";
  if (normalized === "json" || normalized === "csv") {
    return normalized;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Invalid format: ${value ?? ""}. Expected json or csv.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function normalizeOutPath(value: string | undefined): string {
  const outPath = value?.trim() ?? "";
  if (outPath.length > 0) {
    return outPath;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: "Output path is required.",
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

async function listExportTargets(
  ctx: RuntimeContext,
  requestState: { requestId: string | null },
): Promise<{
  endpoints: string[];
  skipped: Array<{ endpoint: string; reason: "object_api" | "non_list_endpoint" }>;
}> {
  const listed = await listApis(ctx);
  requestState.requestId = listed.requestId ?? requestState.requestId;
  const endpoints = extractApiEndpoints(listed.data);

  if (endpoints.length === 0) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "No endpoints were found. Check API permissions.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const targets: string[] = [];
  const skipped: Array<{ endpoint: string; reason: "object_api" | "non_list_endpoint" }> = [];

  for (const endpoint of endpoints) {
    const info = await getApiInfo(ctx, endpoint);
    requestState.requestId = info.requestId ?? requestState.requestId;
    const endpointType = detectApiEndpointType(info.data);

    if (endpointType === "object") {
      skipped.push({ endpoint, reason: "object_api" });
      continue;
    }

    targets.push(endpoint);
  }

  return {
    endpoints: targets,
    skipped,
  };
}

async function exportEndpoint(
  ctx: RuntimeContext,
  endpoint: string,
  requestState: { requestId: string | null },
): Promise<{ contents: unknown[]; totalCount: number }> {
  const result = await listContentAllWithFetcher(ctx, endpoint, {}, (queries) =>
    listContent(ctx, endpoint, queries),
  );
  requestState.requestId = result.requestId ?? requestState.requestId;
  const page = parseListShape(result.data);

  if (page) {
    return page;
  }

  throw new CliError({
    code: "API_ERROR",
    message: "Export requires a list response containing `contents` and `totalCount`.",
    exitCode: EXIT_CODE.UNKNOWN,
  });
}

function resolveExportAllPath(
  baseOutPath: string,
  endpoint: string,
  format: "json" | "csv",
): string {
  const suffix = format === "csv" ? ".csv" : ".json";
  const sanitizedEndpoint = endpoint.replace(/[^A-Za-z0-9._-]/g, "_");
  const hasKnownExtension =
    format === "json"
      ? extname(baseOutPath).toLowerCase() === ".json"
      : extname(baseOutPath).toLowerCase() === ".csv";

  const directory = hasKnownExtension ? dirname(baseOutPath) : baseOutPath;
  return join(directory, `${sanitizedEndpoint}${suffix}`);
}

function renderExportFile(
  payload: {
    endpoint: string;
    totalCount: number;
    contents: unknown[];
  },
  format: "json" | "csv",
): string {
  if (format === "csv") {
    return renderCsv(payload.contents);
  }

  return `${JSON.stringify(
    {
      endpoint: payload.endpoint,
      totalCount: payload.totalCount,
      exportedAt: new Date().toISOString(),
      contents: payload.contents,
    },
    null,
    2,
  )}\n`;
}

async function writeExportFile(filePath: string, body: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body, "utf8");
}

type CsvScalar = string | number | boolean | null;

function renderCsv(items: unknown[]): string {
  const rows = items.map(toCsvRow);
  const columns = collectCsvColumns(rows);
  if (columns.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(columns.map((column) => escapeCsv(column)).join(","));
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(row[column])).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function toCsvRow(item: unknown): Record<string, CsvScalar | undefined> {
  if (!isPlainRecord(item)) {
    const scalar = toCsvScalar(item);
    return scalar === undefined ? {} : { value: scalar };
  }

  const row: Record<string, CsvScalar | undefined> = {};
  for (const [key, value] of Object.entries(item)) {
    const scalar = toCsvScalar(value);
    if (scalar !== undefined) {
      row[key] = scalar;
    }
  }

  return row;
}

function toCsvScalar(value: unknown): CsvScalar | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return undefined;
}

function collectCsvColumns(rows: Array<Record<string, CsvScalar | undefined>>): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      set.add(key);
    }
  }

  return [...set];
}

function escapeCsv(value: CsvScalar | undefined): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectApiEndpointType(data: unknown): "list" | "object" | "unknown" {
  if (!isPlainRecord(data)) {
    return "unknown";
  }

  const candidates = [data.apiType, data.type, data.apiTypeName];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = candidate.trim().toLowerCase();
    if (normalized === "list") {
      return "list";
    }
    if (normalized === "object") {
      return "object";
    }
  }

  return "unknown";
}

type ContentDiffEntry = {
  field: string;
  value?: unknown;
  before?: unknown;
  after?: unknown;
};

type ContentDiffPayload = {
  operation: "content.diff";
  endpoint: string;
  id: string;
  draftKey: string;
  hasDiff: boolean;
  added: ContentDiffEntry[];
  removed: ContentDiffEntry[];
  changed: ContentDiffEntry[];
};

const CONTENT_DIFF_IGNORED_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "revisedAt",
]);

function parseDiffContent(data: unknown, label: "published" | "draft"): Record<string, unknown> {
  if (isPlainRecord(data)) {
    return data;
  }

  throw new CliError({
    code: "API_ERROR",
    message: `content diff requires ${label} response to be a JSON object.`,
    exitCode: EXIT_CODE.UNKNOWN,
  });
}

function diffTopLevelContentFields(
  published: Record<string, unknown>,
  draft: Record<string, unknown>,
): {
  hasDiff: boolean;
  added: ContentDiffEntry[];
  removed: ContentDiffEntry[];
  changed: ContentDiffEntry[];
} {
  const publishedKeys = Object.keys(published).filter(
    (key) => !CONTENT_DIFF_IGNORED_FIELDS.has(key),
  );
  const draftKeys = Object.keys(draft).filter((key) => !CONTENT_DIFF_IGNORED_FIELDS.has(key));
  const keySet = new Set<string>([...publishedKeys, ...draftKeys]);
  const keys = [...keySet].sort((a, b) => a.localeCompare(b));

  const added: ContentDiffEntry[] = [];
  const removed: ContentDiffEntry[] = [];
  const changed: ContentDiffEntry[] = [];

  for (const key of keys) {
    const hasPublished = Object.prototype.hasOwnProperty.call(published, key);
    const hasDraft = Object.prototype.hasOwnProperty.call(draft, key);

    if (!hasPublished && hasDraft) {
      added.push({
        field: key,
        value: draft[key],
      });
      continue;
    }

    if (hasPublished && !hasDraft) {
      removed.push({
        field: key,
        value: published[key],
      });
      continue;
    }

    const before = published[key];
    const after = draft[key];
    if (!deepEqual(before, after)) {
      changed.push({
        field: key,
        before,
        after,
      });
    }
  }

  return {
    hasDiff: added.length > 0 || removed.length > 0 || changed.length > 0,
    added,
    removed,
    changed,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  if (isPlainRecord(a) && isPlainRecord(b)) {
    const aKeys = Object.keys(a).sort((x, y) => x.localeCompare(y));
    const bKeys = Object.keys(b).sort((x, y) => x.localeCompare(y));
    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) {
        return false;
      }
    }

    for (const key of aKeys) {
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function renderContentDiffPlain(payload: ContentDiffPayload): string {
  if (!payload.hasDiff) {
    return "No differences.";
  }

  const lines: string[] = [];
  for (const entry of payload.added) {
    lines.push(`+ ${entry.field}: ${formatDiffValue(entry.value)}`);
  }
  for (const entry of payload.removed) {
    lines.push(`- ${entry.field}: ${formatDiffValue(entry.value)}`);
  }
  for (const entry of payload.changed) {
    lines.push(
      `~ ${entry.field}: ${formatDiffValue(entry.before)} -> ${formatDiffValue(entry.after)}`,
    );
  }

  return lines.join("\n");
}

function renderContentDiffTable(payload: ContentDiffPayload): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const entry of payload.added) {
    rows.push({
      type: "added",
      field: entry.field,
      value: entry.value,
    });
  }
  for (const entry of payload.removed) {
    rows.push({
      type: "removed",
      field: entry.field,
      value: entry.value,
    });
  }
  for (const entry of payload.changed) {
    rows.push({
      type: "changed",
      field: entry.field,
      before: entry.before,
      after: entry.after,
    });
  }

  return rows;
}

function formatDiffValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseImportInterval(value: string | undefined): number {
  return parseIntervalOption(value);
}

function parseImportItems(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) {
    return input.map((item, index) => parseImportObject(item, index));
  }

  if (isPlainRecord(input)) {
    const topLevelContents = input.contents;
    if (Array.isArray(topLevelContents)) {
      return topLevelContents.map((item, index) => parseImportObject(item, index));
    }

    const data = input.data;
    if (isPlainRecord(data) && Array.isArray(data.contents)) {
      return data.contents.map((item, index) => parseImportObject(item, index));
    }

    return [assertObjectPayload(input)];
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: "Import file must be a JSON object/array with content items.",
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function parseImportObject(item: unknown, index: number): Record<string, unknown> {
  try {
    return assertObjectPayload(item);
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Import item at index ${index} must be a JSON object.`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }
}

function splitImportItem(item: Record<string, unknown>): {
  id?: string;
  payload: Record<string, unknown>;
} {
  const rawId = item.id;
  const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : undefined;
  const payload = { ...item };
  delete payload.id;
  return {
    id,
    payload,
  };
}

function extractIdFromResponse(data: unknown): string | null {
  if (isPlainRecord(data) && typeof data.id === "string" && data.id.trim().length > 0) {
    return data.id;
  }

  return null;
}

type BulkResultItem = {
  index: number;
  action: BulkOperation["action"];
  endpoint: string;
  id: string | null;
  status: "succeeded" | "failed" | "skipped";
  data?: unknown;
  error?: unknown;
};

type BulkValidationCheck = {
  index: number;
  action: "create" | "update";
  endpoint: string;
  id: string | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
};

function parseBulkInterval(value: string | undefined): number {
  return parseIntervalOption(value);
}

function formatBulkOperationLabel(operation: BulkOperation): string {
  const base = `${operation.action} ${operation.endpoint}`;
  if ("id" in operation && operation.id.trim().length > 0) {
    return `${base}/${operation.id}`;
  }

  return base;
}

function emitProgress(ctx: RuntimeContext, line: string): void {
  if (ctx.json) {
    return;
  }

  process.stderr.write(`${line}\n`);
}

async function executeBulkOperation(
  ctx: RuntimeContext,
  operation: BulkOperation,
): Promise<{ data: unknown; requestId: string | null }> {
  switch (operation.action) {
    case "create":
      return createContent(ctx, operation.endpoint, operation.payload);
    case "update":
      return updateContent(ctx, operation.endpoint, operation.id, operation.payload);
    case "delete":
      return deleteContent(ctx, operation.endpoint, operation.id);
    case "status":
      return patchContentStatus(ctx, operation.endpoint, operation.id, operation.status);
  }
}

function summarizeImportValidationFailure(
  invalidItems: Array<{
    index: number;
    id: string | null;
    errors: string[];
    warnings: string[];
  }>,
  includeWarnings: boolean,
): string {
  const first = invalidItems[0];
  const reasons = collectValidationReasons(first, includeWarnings);
  const idLabel = first.id ? ` (id: ${first.id})` : "";
  const reason = reasons[0] ?? "validation failed";
  return `item #${first.index}${idLabel}: ${reason}`;
}

function summarizeBulkValidationFailure(
  invalidItems: BulkValidationCheck[],
  includeWarnings: boolean,
): string {
  const first = invalidItems[0];
  const reasons = collectValidationReasons(first, includeWarnings);
  const idLabel = first.id ? `/${first.id}` : "";
  const reason = reasons[0] ?? "validation failed";
  return `op #${first.index} (${first.action} ${first.endpoint}${idLabel}): ${reason}`;
}

function collectValidationReasons(
  entry: { errors: string[]; warnings: string[] },
  includeWarnings: boolean,
): string[] {
  return includeWarnings ? [...entry.errors, ...entry.warnings] : entry.errors;
}
