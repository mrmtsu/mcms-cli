import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { Command } from "commander";
import {
  buildManagedPaths,
  createManagedManifest,
  createManagedManifestRecord,
  deleteManagedTombstone,
  detectApiEndpointType,
  discoverManagedEndpoints,
  ensureManagedDirectories,
  loadManagedEndpointState,
  MANAGED_JSON_FORMAT,
  normalizeManagedPayload,
  removeManagedManifestRecord,
  replaceManagedRecordFile,
  upsertManagedManifestRecord,
  writeManagedManifest,
  writeManagedRecord,
  writeManagedSchema,
  type ManagedEndpointState,
  type ManagedLocalRecord,
  type ManagedManifest,
  type ManagedManifestRecord,
  type ManagedTombstone,
} from "../core/content-managed.js";
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
import { withOperationConfirmation } from "../core/operation-risk.js";
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

type PullOptions = {
  out: string;
  all?: boolean;
  id?: string;
  ids?: string;
  format?: string;
};

type ManagedCommandOptions = {
  dir: string;
  id?: string;
  ids?: string;
  endpoints?: string;
  onlyChanged?: boolean;
};

type PushOptions = ManagedCommandOptions & {
  execute?: boolean;
  force?: boolean;
};

export function registerContentCommands(program: Command): void {
  const content = program.command("content").description("Content API operations");

  content
    .command("pull")
    .argument("[endpoint]", "API endpoint")
    .requiredOption("--out <dir>", "managed-json output directory")
    .option("--all", "pull all records for the endpoint, or all endpoints when endpoint is omitted")
    .option("--id <id>", "pull a single content id")
    .option("--ids <ids>", "pull comma-separated content ids")
    .option("--format <format>", "output format: managed-json", MANAGED_JSON_FORMAT)
    .action(
      withCommandContext(async (ctx, endpoint: string | undefined, options: PullOptions) => {
        const result = await runManagedPull(ctx, endpoint, options);
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  content
    .command("verify")
    .argument("[endpoint]", "API endpoint")
    .requiredOption("--dir <dir>", "managed-json directory")
    .option("--id <id>", "target a single content id or local file name")
    .option("--ids <ids>", "target comma-separated content ids or local file names")
    .option("--endpoints <endpoints>", "comma-separated endpoint names")
    .option("--only-changed", "verify only records whose hash differs from manifest")
    .action(
      withCommandContext(
        async (ctx, endpoint: string | undefined, options: ManagedCommandOptions) => {
          const result = await runManagedVerify(ctx, endpoint, options);
          if (result.exitCode !== EXIT_CODE.SUCCESS) {
            process.exitCode = result.exitCode;
          }
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );

  content
    .command("push")
    .argument("[endpoint]", "API endpoint")
    .requiredOption("--dir <dir>", "managed-json directory")
    .option("--id <id>", "target a single content id or local file name")
    .option("--ids <ids>", "target comma-separated content ids or local file names")
    .option("--endpoints <endpoints>", "comma-separated endpoint names")
    .option("--only-changed", "push only records whose hash differs from manifest")
    .option("--execute", "perform remote writes after successful verification")
    .option("--force", "override stale remote conflicts during execute")
    .action(
      withCommandContext(async (ctx, endpoint: string | undefined, options: PushOptions) => {
        const result = await runManagedPush(ctx, endpoint, options);
        if (result.exitCode !== EXIT_CODE.SUCCESS) {
          process.exitCode = result.exitCode;
        }
        printSuccess(ctx, result.data, result.requestId);
      }),
    );

  content
    .command("sync-status")
    .argument("[endpoint]", "API endpoint")
    .requiredOption("--dir <dir>", "managed-json directory")
    .option("--id <id>", "target a single content id or local file name")
    .option("--ids <ids>", "target comma-separated content ids or local file names")
    .option("--endpoints <endpoints>", "comma-separated endpoint names")
    .action(
      withCommandContext(
        async (ctx, endpoint: string | undefined, options: ManagedCommandOptions) => {
          const result = await runManagedSyncStatus(ctx, endpoint, options);
          if (result.exitCode !== EXIT_CODE.SUCCESS) {
            process.exitCode = result.exitCode;
          }
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );

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
            withOperationConfirmation("content.import", {
              dryRun: true,
              operation: "content.import",
              endpoint,
              file: options.file,
              total: items.length,
              upsert: Boolean(options.upsert),
              intervalMs,
              strictWarnings: Boolean(options.strictWarnings),
              checked: checks,
            }),
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
          withOperationConfirmation("content.import", {
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
          }),
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
            withOperationConfirmation("content.bulk", {
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
            }),
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
          withOperationConfirmation("content.bulk", {
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
          }),
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
            printSuccess(
              ctx,
              withOperationConfirmation("content.create", {
                dryRun: true,
                operation: "content.create",
                endpoint,
                payload,
              }),
            );
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
            printSuccess(
              ctx,
              withOperationConfirmation("content.update", {
                dryRun: true,
                operation: "content.update",
                endpoint,
                id,
                payload,
              }),
            );
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
            printSuccess(
              ctx,
              withOperationConfirmation("content.delete", {
                dryRun: true,
                operation: "content.delete",
                endpoint,
                id,
              }),
            );
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
          printSuccess(
            ctx,
            withOperationConfirmation("content.status.set", {
              dryRun: true,
              operation: "content.status.set",
              endpoint,
              id,
              status: normalizedStatus,
            }),
          );
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
            printSuccess(
              ctx,
              withOperationConfirmation("content.created-by.set", {
                dryRun: true,
                operation: "content.created-by.set",
                endpoint,
                id,
                memberId,
              }),
            );
            return;
          }

          const result = await patchContentCreatedBy(ctx, endpoint, id, memberId);
          printSuccess(ctx, result.data, result.requestId);
        },
      ),
    );
}

type ManagedRequestState = {
  requestId: string | null;
};

type ManagedPlanAction = "create" | "update" | "delete";

type ManagedPlanItem = {
  endpoint: string;
  action: ManagedPlanAction;
  selector: string;
  id: string;
  file: string;
  payload: Record<string, unknown> | null;
  localRecord: ManagedLocalRecord | null;
  tombstone: ManagedTombstone | null;
  manifestRecord: ManagedManifestRecord | null;
  valid: boolean;
  dryRunOk: boolean;
  conflict: boolean;
  errors: string[];
  warnings: string[];
};

type ManagedEndpointPlan = {
  endpoint: string;
  items: ManagedPlanItem[];
};

type ManagedPlanResult = {
  rootDir: string;
  requestId: string | null;
  endpoints: ManagedEndpointPlan[];
  states: Map<string, ManagedEndpointState>;
  schemas: Map<string, unknown>;
  hasConflicts: boolean;
  hasNonConflictFailures: boolean;
  exitCode: number;
};

type ManagedCommandResult = {
  data: unknown;
  requestId: string | null;
  exitCode: number;
};

async function runManagedPull(
  ctx: RuntimeContext,
  endpoint: string | undefined,
  options: PullOptions,
): Promise<ManagedCommandResult> {
  const format = parseManagedFormat(options.format);
  const outDir = normalizeOutPath(options.out);
  const requestState = { requestId: null as string | null };
  const selectorIds = parseManagedSelectors(options.id, options.ids);

  if (options.all && selectorIds.length > 0) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--all cannot be combined with --id or --ids.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (!endpoint && selectorIds.length > 0) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "--id/--ids require an endpoint.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const endpoints = endpoint
    ? [endpoint]
    : options.all
      ? await listManagedPullEndpoints(ctx, requestState)
      : [];

  if (endpoints.length === 0) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Endpoint is required unless --all is set.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const endpointResults: Array<{
    endpoint: string;
    count: number;
    manifestPath: string;
    schemaPath: string;
    fullSync: boolean;
  }> = [];

  for (const targetEndpoint of endpoints) {
    const apiInfo = await getApiInfo(ctx, targetEndpoint);
    requestState.requestId = apiInfo.requestId ?? requestState.requestId;
    assertManagedListApi(targetEndpoint, apiInfo.data);

    const paths = buildManagedPaths(outDir, targetEndpoint);
    await ensureManagedDirectories(paths);
    await writeManagedSchema(paths, apiInfo.data);

    const currentState = await loadManagedEndpointState(outDir, targetEndpoint);
    const pulledAt = new Date().toISOString();
    const fullSync = selectorIds.length === 0;
    const remoteRecords =
      selectorIds.length > 0
        ? await fetchManagedContentByIds(ctx, targetEndpoint, selectorIds, requestState)
        : await fetchAllManagedContent(ctx, targetEndpoint, requestState);
    const manifestEntries = new Map<string, ManagedManifestRecord>();

    if (!fullSync) {
      for (const record of currentState.manifest.records) {
        manifestEntries.set(record.id, record);
      }
    }

    for (const remoteRecord of remoteRecords) {
      const recordId = extractRequiredContentId(remoteRecord, targetEndpoint);
      const normalized = normalizeManagedPayload(apiInfo.data, remoteRecord);
      await writeManagedRecord(paths, `${recordId}.json`, normalized);
      manifestEntries.set(
        recordId,
        createManagedManifestRecord({
          id: recordId,
          fileName: `${recordId}.json`,
          payload: normalized,
          remoteUpdatedAt: extractRemoteTimestamp(remoteRecord, "updatedAt"),
          remotePublishedAt: extractRemoteTimestamp(remoteRecord, "publishedAt"),
        }),
      );
    }

    const manifest = createManagedManifest({
      endpoint: targetEndpoint,
      pulledAt,
      schemaPath: `schema/${targetEndpoint}.json`,
      records: [...manifestEntries.values()],
    });
    await writeManagedManifest(paths, manifest);

    endpointResults.push({
      endpoint: targetEndpoint,
      count: remoteRecords.length,
      manifestPath: paths.manifestPath,
      schemaPath: paths.schemaPath,
      fullSync,
    });
  }

  return {
    data: {
      operation: "content.pull",
      format,
      out: outDir,
      endpointCount: endpointResults.length,
      endpoints: endpointResults,
    },
    requestId: requestState.requestId,
    exitCode: EXIT_CODE.SUCCESS,
  };
}

async function runManagedVerify(
  ctx: RuntimeContext,
  endpoint: string | undefined,
  options: ManagedCommandOptions,
): Promise<ManagedCommandResult> {
  const plan = await buildManagedPlan(ctx, endpoint, options);
  return {
    data: renderManagedVerifyPayload("content.verify", options.dir, plan),
    requestId: plan.requestId,
    exitCode: plan.exitCode,
  };
}

async function runManagedPush(
  ctx: RuntimeContext,
  endpoint: string | undefined,
  options: PushOptions,
): Promise<ManagedCommandResult> {
  const plan = await buildManagedPlan(ctx, endpoint, options);
  const verification = renderManagedVerifyPayload("content.push", options.dir, plan);

  if (!options.execute) {
    return {
      data: {
        ...verification,
        execute: false,
      },
      requestId: plan.requestId,
      exitCode: plan.exitCode,
    };
  }

  if (plan.hasNonConflictFailures || (plan.hasConflicts && !options.force)) {
    return {
      data: {
        ...verification,
        execute: true,
        force: Boolean(options.force),
        blocked: true,
        execution: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
          results: [],
        },
      },
      requestId: plan.requestId,
      exitCode: plan.hasNonConflictFailures ? EXIT_CODE.INVALID_INPUT : EXIT_CODE.CONFLICT,
    };
  }

  const execution = await executeManagedPlan(ctx, plan, Boolean(options.force));
  return {
    data: {
      ...verification,
      execute: true,
      force: Boolean(options.force),
      blocked: false,
      execution: execution.data,
    },
    requestId: execution.requestId ?? plan.requestId,
    exitCode: execution.exitCode,
  };
}

async function runManagedSyncStatus(
  ctx: RuntimeContext,
  endpoint: string | undefined,
  options: ManagedCommandOptions,
): Promise<ManagedCommandResult> {
  const requestState = { requestId: null as string | null };
  const endpoints = await resolveManagedEndpoints(endpoint, options.dir, options.endpoints);
  const selectors = parseManagedSelectors(options.id, options.ids);
  const endpointResults: Array<{
    endpoint: string;
    counts: Record<string, number>;
    records: Array<Record<string, unknown>>;
  }> = [];

  for (const targetEndpoint of endpoints) {
    const apiInfo = await getApiInfo(ctx, targetEndpoint);
    requestState.requestId = apiInfo.requestId ?? requestState.requestId;
    assertManagedListApi(targetEndpoint, apiInfo.data);

    const state = await loadManagedEndpointState(options.dir, targetEndpoint);
    const records: Array<Record<string, unknown>> = [];

    for (const localRecord of state.localRecords) {
      if (!matchesManagedSelector(localRecord.id, localRecord.fileName, selectors)) {
        continue;
      }

      const status = await classifyManagedLocalRecordStatus(
        ctx,
        targetEndpoint,
        localRecord,
        requestState,
      );
      records.push({
        id: localRecord.id,
        file: localRecord.relativePath,
        status,
      });
    }

    for (const tombstone of state.tombstones) {
      if (!matchesManagedSelector(tombstone.id, tombstone.fileName, selectors)) {
        continue;
      }

      records.push({
        id: tombstone.id,
        file: tombstone.relativePath,
        status: "pending_delete",
      });
    }

    endpointResults.push({
      endpoint: targetEndpoint,
      counts: countManagedStatuses(records),
      records,
    });
  }

  return {
    data: {
      operation: "content.sync-status",
      dir: options.dir,
      endpointCount: endpointResults.length,
      endpoints: endpointResults,
    },
    requestId: requestState.requestId,
    exitCode: EXIT_CODE.SUCCESS,
  };
}

async function buildManagedPlan(
  ctx: RuntimeContext,
  endpoint: string | undefined,
  options: ManagedCommandOptions,
): Promise<ManagedPlanResult> {
  const requestState = { requestId: null as string | null };
  const endpoints = await resolveManagedEndpoints(endpoint, options.dir, options.endpoints);
  const selectors = parseManagedSelectors(options.id, options.ids);
  const states = new Map<string, ManagedEndpointState>();
  const schemas = new Map<string, unknown>();
  const endpointPlans: ManagedEndpointPlan[] = [];
  let hasConflicts = false;
  let hasNonConflictFailures = false;

  for (const targetEndpoint of endpoints) {
    const apiInfo = await getApiInfo(ctx, targetEndpoint);
    requestState.requestId = apiInfo.requestId ?? requestState.requestId;
    assertManagedListApi(targetEndpoint, apiInfo.data);
    schemas.set(targetEndpoint, apiInfo.data);

    const state = await loadManagedEndpointState(options.dir, targetEndpoint);
    states.set(targetEndpoint, state);
    const items = await buildManagedEndpointPlan(
      ctx,
      targetEndpoint,
      apiInfo.data,
      state,
      selectors,
      Boolean(options.onlyChanged),
      requestState,
    );
    if (items.some((item) => item.conflict)) {
      hasConflicts = true;
    }
    if (items.some((item) => !item.valid || !item.dryRunOk || item.errors.length > 0)) {
      hasNonConflictFailures = true;
    }
    endpointPlans.push({
      endpoint: targetEndpoint,
      items,
    });
  }

  return {
    rootDir: options.dir,
    requestId: requestState.requestId,
    endpoints: endpointPlans,
    states,
    schemas,
    hasConflicts,
    hasNonConflictFailures,
    exitCode: hasNonConflictFailures
      ? EXIT_CODE.INVALID_INPUT
      : hasConflicts
        ? EXIT_CODE.CONFLICT
        : EXIT_CODE.SUCCESS,
  };
}

async function buildManagedEndpointPlan(
  ctx: RuntimeContext,
  endpoint: string,
  schema: unknown,
  state: ManagedEndpointState,
  selectors: string[],
  onlyChanged: boolean,
  requestState: ManagedRequestState,
): Promise<ManagedPlanItem[]> {
  const items: ManagedPlanItem[] = [];
  const localRecordMap = new Map(state.localRecords.map((record) => [record.id, record]));

  for (const localRecord of state.localRecords) {
    if (!matchesManagedSelector(localRecord.id, localRecord.fileName, selectors)) {
      continue;
    }
    if (
      onlyChanged &&
      localRecord.manifestRecord &&
      localRecord.manifestRecord.sha256 === localRecord.sha256
    ) {
      continue;
    }
    items.push(await verifyManagedRecord(ctx, endpoint, schema, localRecord, requestState));
  }

  for (const tombstone of state.tombstones) {
    if (!matchesManagedSelector(tombstone.id, tombstone.fileName, selectors)) {
      continue;
    }
    items.push(
      await verifyManagedDelete(
        ctx,
        endpoint,
        tombstone,
        state.manifest,
        localRecordMap,
        requestState,
      ),
    );
  }

  return items.sort((left, right) => {
    if (left.action !== right.action) {
      return left.action.localeCompare(right.action);
    }
    return left.file.localeCompare(right.file);
  });
}

async function verifyManagedRecord(
  ctx: RuntimeContext,
  endpoint: string,
  schema: unknown,
  localRecord: ManagedLocalRecord,
  requestState: ManagedRequestState,
): Promise<ManagedPlanItem> {
  const validation = validatePayload(localRecord.payload, schema);
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  let dryRunOk = validation.valid;
  let conflict = false;

  if (localRecord.manifestRecord) {
    const remoteResult = await getManagedRemoteState(
      ctx,
      endpoint,
      localRecord.manifestRecord.id,
      requestState,
    );
    if (remoteResult.kind === "missing") {
      errors.push(`Remote content not found: ${localRecord.manifestRecord.id}`);
      dryRunOk = false;
    } else if (remoteResult.kind === "ok") {
      if (localRecord.manifestRecord.remoteUpdatedAt !== remoteResult.updatedAt) {
        conflict = true;
      }
    }
  }

  return {
    endpoint,
    action: localRecord.manifestRecord ? "update" : "create",
    selector: localRecord.id,
    id: localRecord.manifestRecord?.id ?? localRecord.id,
    file: localRecord.relativePath,
    payload: localRecord.payload,
    localRecord,
    tombstone: null,
    manifestRecord: localRecord.manifestRecord,
    valid: validation.valid,
    dryRunOk,
    conflict,
    errors,
    warnings,
  };
}

async function verifyManagedDelete(
  ctx: RuntimeContext,
  endpoint: string,
  tombstone: ManagedTombstone,
  manifest: ManagedManifest,
  localRecordMap: Map<string, ManagedLocalRecord>,
  requestState: ManagedRequestState,
): Promise<ManagedPlanItem> {
  const errors: string[] = [];
  const manifestRecord = manifest.records.find((record) => record.id === tombstone.id) ?? null;
  if (localRecordMap.has(tombstone.id)) {
    errors.push(`Delete tombstone conflicts with existing record file: ${tombstone.id}`);
  }
  if (!manifestRecord) {
    errors.push(`Delete tombstone requires manifest entry: ${tombstone.id}`);
  }

  let dryRunOk = errors.length === 0;
  let conflict = false;
  if (manifestRecord) {
    const remoteResult = await getManagedRemoteState(ctx, endpoint, tombstone.id, requestState);
    if (remoteResult.kind === "missing") {
      errors.push(`Remote content not found: ${tombstone.id}`);
      dryRunOk = false;
    } else if (remoteResult.kind === "ok") {
      if (manifestRecord.remoteUpdatedAt !== remoteResult.updatedAt) {
        conflict = true;
      }
    }
  }

  return {
    endpoint,
    action: "delete",
    selector: tombstone.id,
    id: tombstone.id,
    file: tombstone.relativePath,
    payload: null,
    localRecord: null,
    tombstone,
    manifestRecord,
    valid: errors.length === 0,
    dryRunOk,
    conflict,
    errors,
    warnings: [],
  };
}

async function executeManagedPlan(
  ctx: RuntimeContext,
  plan: ManagedPlanResult,
  force: boolean,
): Promise<{ data: Record<string, unknown>; requestId: string | null; exitCode: number }> {
  const requestState = { requestId: plan.requestId };
  const results: Array<Record<string, unknown>> = [];
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  const ordered = plan.endpoints.flatMap((endpointPlan) => endpointPlan.items);
  const executionOrder: ManagedPlanAction[] = ["create", "update", "delete"];

  for (const action of executionOrder) {
    for (const item of ordered.filter((candidate) => candidate.action === action)) {
      if (!item.valid || !item.dryRunOk || item.errors.length > 0) {
        continue;
      }
      if (item.conflict && !force) {
        continue;
      }

      attempted += 1;
      try {
        const result =
          action === "create"
            ? await executeManagedCreate(ctx, plan, item, requestState)
            : action === "update"
              ? await executeManagedUpdate(ctx, plan, item, requestState)
              : await executeManagedDelete(ctx, plan, item, requestState);
        succeeded += 1;
        results.push(result);
      } catch (error) {
        const normalized = normalizeError(error);
        failed += 1;
        results.push({
          endpoint: item.endpoint,
          action: item.action,
          id: item.id,
          file: item.file,
          status: "failed",
          error: normalized.toJson({ includeDetails: ctx.verbose }),
        });
        return {
          data: {
            attempted,
            succeeded,
            failed,
            results,
          },
          requestId: requestState.requestId,
          exitCode: normalized.exitCode,
        };
      }
    }
  }

  return {
    data: {
      attempted,
      succeeded,
      failed,
      results,
    },
    requestId: requestState.requestId,
    exitCode: EXIT_CODE.SUCCESS,
  };
}

async function executeManagedCreate(
  ctx: RuntimeContext,
  plan: ManagedPlanResult,
  item: ManagedPlanItem,
  requestState: ManagedRequestState,
): Promise<Record<string, unknown>> {
  if (!item.localRecord || !item.payload) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Create execution requires a local record payload.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const created = await createContent(ctx, item.endpoint, item.payload);
  requestState.requestId = created.requestId ?? requestState.requestId;
  const createdId = extractIdFromResponse(created.data);
  if (!createdId) {
    throw new CliError({
      code: "API_ERROR",
      message: `Create response did not include an id for endpoint: ${item.endpoint}`,
      exitCode: EXIT_CODE.UNKNOWN,
    });
  }

  const fresh = await getContent(ctx, item.endpoint, createdId);
  requestState.requestId = fresh.requestId ?? requestState.requestId;
  const schema = plan.schemas.get(item.endpoint);
  const state = getManagedState(plan.states, item.endpoint);
  const freshRecord = parseManagedContentObject(fresh.data, item.endpoint, createdId);
  const normalized = normalizeManagedPayload(schema, freshRecord);
  await replaceManagedRecordFile(
    state.paths,
    item.localRecord.fileName,
    `${createdId}.json`,
    normalized,
  );

  const manifestRecord = createManagedManifestRecord({
    id: createdId,
    fileName: `${createdId}.json`,
    payload: normalized,
    remoteUpdatedAt: extractRemoteTimestamp(freshRecord, "updatedAt"),
    remotePublishedAt: extractRemoteTimestamp(freshRecord, "publishedAt"),
  });
  state.manifest = upsertManagedManifestRecord(state.manifest, manifestRecord);
  state.manifest.pulledAt = new Date().toISOString();
  await writeManagedManifest(state.paths, state.manifest);

  return {
    endpoint: item.endpoint,
    action: "create",
    id: createdId,
    source: item.localRecord.relativePath,
    status: "succeeded",
  };
}

async function executeManagedUpdate(
  ctx: RuntimeContext,
  plan: ManagedPlanResult,
  item: ManagedPlanItem,
  requestState: ManagedRequestState,
): Promise<Record<string, unknown>> {
  if (!item.localRecord || !item.payload || !item.manifestRecord) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Update execution requires a local record payload and manifest record.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const updated = await updateContent(ctx, item.endpoint, item.manifestRecord.id, item.payload);
  requestState.requestId = updated.requestId ?? requestState.requestId;
  const fresh = await getContent(ctx, item.endpoint, item.manifestRecord.id);
  requestState.requestId = fresh.requestId ?? requestState.requestId;
  const schema = plan.schemas.get(item.endpoint);
  const state = getManagedState(plan.states, item.endpoint);
  const freshRecord = parseManagedContentObject(fresh.data, item.endpoint, item.manifestRecord.id);
  const normalized = normalizeManagedPayload(schema, freshRecord);
  await replaceManagedRecordFile(
    state.paths,
    item.localRecord.fileName,
    `${item.manifestRecord.id}.json`,
    normalized,
  );

  const manifestRecord = createManagedManifestRecord({
    id: item.manifestRecord.id,
    fileName: `${item.manifestRecord.id}.json`,
    payload: normalized,
    remoteUpdatedAt: extractRemoteTimestamp(freshRecord, "updatedAt"),
    remotePublishedAt: extractRemoteTimestamp(freshRecord, "publishedAt"),
  });
  state.manifest = upsertManagedManifestRecord(state.manifest, manifestRecord);
  state.manifest.pulledAt = new Date().toISOString();
  await writeManagedManifest(state.paths, state.manifest);

  return {
    endpoint: item.endpoint,
    action: "update",
    id: item.manifestRecord.id,
    source: item.localRecord.relativePath,
    status: "succeeded",
  };
}

async function executeManagedDelete(
  ctx: RuntimeContext,
  plan: ManagedPlanResult,
  item: ManagedPlanItem,
  requestState: ManagedRequestState,
): Promise<Record<string, unknown>> {
  if (!item.tombstone || !item.manifestRecord) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Delete execution requires a tombstone and manifest record.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const deleted = await deleteContent(ctx, item.endpoint, item.manifestRecord.id);
  requestState.requestId = deleted.requestId ?? requestState.requestId;
  const state = getManagedState(plan.states, item.endpoint);
  state.manifest = removeManagedManifestRecord(state.manifest, item.manifestRecord.id);
  state.manifest.pulledAt = new Date().toISOString();
  await writeManagedManifest(state.paths, state.manifest);
  await deleteManagedTombstone(state.paths, item.tombstone.fileName);

  return {
    endpoint: item.endpoint,
    action: "delete",
    id: item.manifestRecord.id,
    source: item.tombstone.relativePath,
    status: "succeeded",
  };
}

function renderManagedVerifyPayload(
  operation: "content.verify" | "content.push",
  dir: string,
  plan: ManagedPlanResult,
): Record<string, unknown> {
  const endpoints = plan.endpoints.map((endpointPlan) => {
    const counts = {
      create: endpointPlan.items.filter((item) => item.action === "create").length,
      update: endpointPlan.items.filter((item) => item.action === "update").length,
      delete: endpointPlan.items.filter((item) => item.action === "delete").length,
      conflicts: endpointPlan.items.filter((item) => item.conflict).length,
      failed: endpointPlan.items.filter(
        (item) => !item.valid || !item.dryRunOk || item.errors.length > 0 || item.conflict,
      ).length,
    };

    return {
      endpoint: endpointPlan.endpoint,
      counts,
      records: endpointPlan.items.map((item) => ({
        id: item.id,
        file: item.file,
        action: item.action,
        valid: item.valid,
        dryRunOk: item.dryRunOk,
        conflict: item.conflict,
        errors: item.errors,
        warnings: item.warnings,
      })),
    };
  });

  return {
    operation,
    dir,
    endpointCount: endpoints.length,
    totalRecords: endpoints.reduce((sum, endpointEntry) => sum + endpointEntry.records.length, 0),
    hasFailures: plan.exitCode !== EXIT_CODE.SUCCESS,
    endpoints,
  };
}

async function listManagedPullEndpoints(
  ctx: RuntimeContext,
  requestState: ManagedRequestState,
): Promise<string[]> {
  const listed = await listApis(ctx);
  requestState.requestId = listed.requestId ?? requestState.requestId;
  const endpoints = extractApiEndpoints(listed.data);
  const targets: string[] = [];

  for (const endpoint of endpoints) {
    const info = await getApiInfo(ctx, endpoint);
    requestState.requestId = info.requestId ?? requestState.requestId;
    if (detectApiEndpointType(info.data) === "object") {
      continue;
    }
    targets.push(endpoint);
  }

  return targets;
}

async function fetchAllManagedContent(
  ctx: RuntimeContext,
  endpoint: string,
  requestState: ManagedRequestState,
): Promise<Record<string, unknown>[]> {
  const result = await listContentAllWithFetcher(ctx, endpoint, {}, (queries) =>
    listContent(ctx, endpoint, queries),
  );
  requestState.requestId = result.requestId ?? requestState.requestId;
  const page = parseListShape(result.data);
  if (!page) {
    throw new CliError({
      code: "API_ERROR",
      message: "content pull requires a list response containing `contents` and `totalCount`.",
      exitCode: EXIT_CODE.UNKNOWN,
    });
  }

  return page.contents.map((item, index) =>
    parseManagedContentObject(item, endpoint, `list-index-${index}`),
  );
}

async function fetchManagedContentByIds(
  ctx: RuntimeContext,
  endpoint: string,
  ids: string[],
  requestState: ManagedRequestState,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  for (const id of ids) {
    const result = await getContent(ctx, endpoint, id);
    requestState.requestId = result.requestId ?? requestState.requestId;
    records.push(parseManagedContentObject(result.data, endpoint, id));
  }

  return records;
}

async function resolveManagedEndpoints(
  endpoint: string | undefined,
  dir: string,
  endpointsOption: string | undefined,
): Promise<string[]> {
  if (endpoint && endpointsOption) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Do not pass [endpoint] together with --endpoints.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (endpoint) {
    return [endpoint];
  }

  const parsed = parseCsvOption(endpointsOption);
  if (parsed.length > 0) {
    return parsed;
  }

  const discovered = await discoverManagedEndpoints(dir);
  if (discovered.length === 0) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `No managed endpoints were found in: ${dir}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return discovered;
}

async function classifyManagedLocalRecordStatus(
  ctx: RuntimeContext,
  endpoint: string,
  localRecord: ManagedLocalRecord,
  requestState: ManagedRequestState,
): Promise<string> {
  if (localRecord.manifestRecord) {
    const remoteResult = await getManagedRemoteState(
      ctx,
      endpoint,
      localRecord.manifestRecord.id,
      requestState,
    );
    if (remoteResult.kind === "missing") {
      return "remote_missing";
    }

    return localRecord.manifestRecord.remoteUpdatedAt === remoteResult.updatedAt
      ? "in_sync"
      : "stale_remote";
  }

  const remoteResult = await getManagedRemoteState(ctx, endpoint, localRecord.id, requestState);
  return remoteResult.kind === "ok" ? "manifest_missing" : "local_only";
}

async function getManagedRemoteState(
  ctx: RuntimeContext,
  endpoint: string,
  id: string,
  requestState: ManagedRequestState,
): Promise<
  { kind: "ok"; updatedAt: string | null; publishedAt: string | null } | { kind: "missing" }
> {
  try {
    const result = await getContent(ctx, endpoint, id);
    requestState.requestId = result.requestId ?? requestState.requestId;
    const content = parseManagedContentObject(result.data, endpoint, id);
    return {
      kind: "ok",
      updatedAt: extractRemoteTimestamp(content, "updatedAt"),
      publishedAt: extractRemoteTimestamp(content, "publishedAt"),
    };
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === "NOT_FOUND") {
      return { kind: "missing" };
    }
    throw normalized;
  }
}

function assertManagedListApi(endpoint: string, data: unknown): void {
  if (detectApiEndpointType(data) === "object") {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `content-as-code v1 supports list APIs only: ${endpoint}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }
}

function parseManagedFormat(value: string | undefined): string {
  const format = value?.trim().toLowerCase() ?? MANAGED_JSON_FORMAT;
  if (format === MANAGED_JSON_FORMAT) {
    return format;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Invalid format: ${value ?? ""}. Expected ${MANAGED_JSON_FORMAT}.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function parseManagedSelectors(id: string | undefined, ids: string | undefined): string[] {
  if (id && ids) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Do not pass --id together with --ids.",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  if (id) {
    const value = id.trim();
    if (value.length === 0) {
      throw new CliError({
        code: "INVALID_INPUT",
        message: "--id must not be empty.",
        exitCode: EXIT_CODE.INVALID_INPUT,
      });
    }
    return [value];
  }

  return parseCsvOption(ids);
}

function parseCsvOption(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return [...new Set(entries)];
}

function matchesManagedSelector(id: string, fileName: string, selectors: string[]): boolean {
  if (selectors.length === 0) {
    return true;
  }

  const baseName = fileName.replace(/\.json$/u, "");
  return selectors.includes(id) || selectors.includes(fileName) || selectors.includes(baseName);
}

function parseManagedContentObject(
  data: unknown,
  endpoint: string,
  idHint: string,
): Record<string, unknown> {
  if (isPlainRecord(data)) {
    return data;
  }

  throw new CliError({
    code: "API_ERROR",
    message: `Managed content requires a JSON object response: ${endpoint}/${idHint}`,
    exitCode: EXIT_CODE.UNKNOWN,
  });
}

function extractRequiredContentId(data: Record<string, unknown>, endpoint: string): string {
  const id = extractIdFromResponse(data);
  if (id) {
    return id;
  }

  throw new CliError({
    code: "API_ERROR",
    message: `Content response did not include id for endpoint: ${endpoint}`,
    exitCode: EXIT_CODE.UNKNOWN,
  });
}

function extractRemoteTimestamp(
  data: Record<string, unknown>,
  field: "updatedAt" | "publishedAt",
): string | null {
  const value = data[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getManagedState(
  states: Map<string, ManagedEndpointState>,
  endpoint: string,
): ManagedEndpointState {
  const state = states.get(endpoint);
  if (state) {
    return state;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Managed endpoint state is unavailable: ${endpoint}`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

function countManagedStatuses(records: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {
    in_sync: 0,
    stale_remote: 0,
    local_only: 0,
    pending_delete: 0,
    remote_missing: 0,
    manifest_missing: 0,
  };

  for (const record of records) {
    const status = record.status;
    if (typeof status === "string" && status in counts) {
      counts[status] += 1;
    }
  }

  return counts;
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
