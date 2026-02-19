import { inspect } from "node:util";
import type { RuntimeContext } from "./context.js";
import type { CliError } from "./errors.js";

const OUTPUT_VERSION = "0.x";

type SuccessEnvelope = {
  ok: true;
  data: unknown;
  meta: {
    requestId: string | null;
    version: string;
  };
};

type ErrorEnvelope = {
  ok: false;
  error: ReturnType<CliError["toJson"]>;
  meta: {
    requestId: string | null;
    version: string;
  };
};

type Row = Record<string, unknown>;

export function printSuccess(ctx: RuntimeContext, data: unknown, requestId: string | null = null): void {
  const payload: SuccessEnvelope = {
    ok: true,
    data,
    meta: {
      requestId,
      version: OUTPUT_VERSION
    }
  };

  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  if (ctx.outputMode === "plain") {
    process.stdout.write(`${renderPlain(data, ctx.selectFields)}\n`);
    return;
  }

  if (ctx.outputMode === "table") {
    process.stdout.write(`${renderTable(data, ctx.selectFields)}\n`);
    return;
  }

  if (typeof data === "string") {
    process.stdout.write(`${data}\n`);
    return;
  }

  process.stdout.write(`${inspect(data, { colors: ctx.color, depth: 6 })}\n`);
}

export function printError(ctx: RuntimeContext, error: CliError, requestId: string | null = null): void {
  const payload: ErrorEnvelope = {
    ok: false,
    error: error.toJson({ includeDetails: ctx.verbose }),
    meta: {
      requestId,
      version: OUTPUT_VERSION
    }
  };

  if (ctx.json) {
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  process.stderr.write(`[${error.code}] ${error.message}\n`);
  if (ctx.verbose && error.details) {
    process.stderr.write(`${inspect(error.details, { colors: ctx.color, depth: 6 })}\n`);
  }
}

function renderPlain(data: unknown, selectFields?: string[]): string {
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "(empty)";
    }

    return data.map((item) => renderPlainItem(item, selectFields)).join("\n");
  }

  const objectWithContents = getObjectWithContents(data);
  if (objectWithContents) {
    if (objectWithContents.contents.length === 0) {
      return "(empty)";
    }

    return objectWithContents.contents.map((item) => renderPlainItem(item, selectFields)).join("\n");
  }

  return renderPlainItem(data, selectFields);
}

function renderPlainItem(item: unknown, selectFields?: string[]): string {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return formatScalar(item);
  }

  const projected = projectRow(item as Row, selectFields);
  const keys = Object.keys(projected);
  if (keys.length === 0) {
    return "{}";
  }

  return keys.map((key) => `${key}=${formatScalar(projected[key])}`).join("\t");
}

function renderTable(data: unknown, selectFields?: string[]): string {
  const rows = extractRows(data).map((row) => projectRow(row, selectFields));

  if (rows.length === 0) {
    return "(no rows)";
  }

  const columns = selectFields && selectFields.length > 0 ? selectFields : collectColumns(rows);
  if (columns.length === 0) {
    return "(no columns)";
  }

  const widths = columns.map((column) => {
    const cellMax = Math.max(...rows.map((row) => formatScalar(row[column]).length));
    return Math.max(column.length, cellMax);
  });

  const header = formatTableRow(columns, widths);
  const separator = widths.map((width) => "-".repeat(width)).join("-+-");
  const body = rows.map((row) => formatTableRow(columns.map((column) => formatScalar(row[column])), widths));

  return [header, separator, ...body].join("\n");
}

function extractRows(data: unknown): Row[] {
  if (Array.isArray(data)) {
    return data.map(normalizeRow);
  }

  const objectWithContents = getObjectWithContents(data);
  if (objectWithContents) {
    return objectWithContents.contents.map(normalizeRow);
  }

  if (typeof data === "object" && data !== null) {
    return [data as Row];
  }

  return [{ value: data }];
}

function normalizeRow(item: unknown): Row {
  if (typeof item === "object" && item !== null && !Array.isArray(item)) {
    return item as Row;
  }

  return { value: item };
}

function getObjectWithContents(data: unknown): { contents: unknown[] } | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const maybeContents = (data as { contents?: unknown }).contents;
  if (!Array.isArray(maybeContents)) {
    return null;
  }

  return {
    contents: maybeContents
  };
}

function collectColumns(rows: Row[]): string[] {
  const columns: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }

  return columns;
}

function projectRow(row: Row, selectFields?: string[]): Row {
  if (!selectFields || selectFields.length === 0) {
    return row;
  }

  const projected: Row = {};
  for (const field of selectFields) {
    projected[field] = getValueByPath(row, field);
  }

  return projected;
}

function getValueByPath(row: Row, path: string): unknown {
  const keys = path.split(".").filter((part) => part.length > 0);
  let current: unknown = row;

  for (const key of keys) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function formatTableRow(values: string[] | unknown[], widths: number[]): string {
  return values
    .map((value, index) => {
      const rendered = typeof value === "string" ? value : formatScalar(value);
      return rendered.padEnd(widths[index], " ");
    })
    .join(" | ");
}

function formatScalar(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return JSON.stringify(value);
}
