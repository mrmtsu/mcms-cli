import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { extractApiFields, isFieldMultiple, normalizeKind } from "./api-field-utils.js";
import { CliError } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";
import { assertObjectPayload, readJsonFile } from "./io.js";

type ApiField = {
  fieldId?: string;
  kind?: string;
  multiple?: boolean;
  isMultiple?: boolean;
  multipleSelect?: boolean;
};

type JsonObject = Record<string, unknown>;

export const MANAGED_JSON_FORMAT = "managed-json";
export const MANAGED_JSON_FORMAT_VERSION = "managed-json/v1";

const SYSTEM_FIELDS = new Set(["id", "createdAt", "updatedAt", "publishedAt", "revisedAt"]);

export type ManagedManifestRecord = {
  id: string;
  file: string;
  sha256: string;
  remoteUpdatedAt: string | null;
  remotePublishedAt: string | null;
};

export type ManagedManifest = {
  formatVersion: string;
  endpoint: string;
  pulledAt: string | null;
  schemaPath: string;
  totalCount: number;
  records: ManagedManifestRecord[];
};

export type ManagedPaths = {
  rootDir: string;
  endpoint: string;
  schemaDir: string;
  schemaPath: string;
  endpointDir: string;
  recordsDir: string;
  deletionsDir: string;
  manifestPath: string;
};

export type ManagedLocalRecord = {
  id: string;
  fileName: string;
  filePath: string;
  relativePath: string;
  payload: JsonObject;
  sha256: string;
  manifestRecord: ManagedManifestRecord | null;
};

export type ManagedTombstone = {
  id: string;
  fileName: string;
  filePath: string;
  relativePath: string;
};

export type ManagedEndpointState = {
  endpoint: string;
  paths: ManagedPaths;
  manifest: ManagedManifest;
  localRecords: ManagedLocalRecord[];
  tombstones: ManagedTombstone[];
};

export function detectApiEndpointType(data: unknown): "list" | "object" | "unknown" {
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

export function normalizeManagedPayload(schema: unknown, record: unknown): JsonObject {
  const recordObject = assertJsonObject(record, "Record must be a JSON object");
  const apiFields = extractApiFields(schema) as ApiField[];
  const schemaFieldIds = new Set(
    apiFields
      .map((field) => field.fieldId)
      .filter((fieldId): fieldId is string => typeof fieldId === "string" && fieldId.length > 0),
  );
  const payload: JsonObject = {};

  for (const field of apiFields) {
    if (typeof field.fieldId !== "string" || field.fieldId.length === 0) {
      continue;
    }

    if (!(field.fieldId in recordObject)) {
      continue;
    }

    const value = recordObject[field.fieldId];
    if (value === undefined) {
      continue;
    }

    switch (normalizeKind(field.kind)) {
      case "relation":
        payload[field.fieldId] = normalizeRelationValue(value);
        break;
      case "relationlist":
        payload[field.fieldId] = normalizeRelationListValue(value);
        break;
      case "media":
        payload[field.fieldId] = normalizeMediaValue(value);
        break;
      case "select":
        normalizeSelectValue(payload, field, value);
        break;
      default:
        payload[field.fieldId] = value;
        break;
    }
  }

  for (const [key, value] of Object.entries(recordObject)) {
    if (
      SYSTEM_FIELDS.has(key) ||
      schemaFieldIds.has(key) ||
      key in payload ||
      value === undefined
    ) {
      continue;
    }

    payload[key] = value;
  }

  return payload;
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}

export function renderJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildManagedPaths(rootDir: string, endpoint: string): ManagedPaths {
  const schemaDir = join(rootDir, "schema");
  const endpointDir = join(rootDir, endpoint);
  return {
    rootDir,
    endpoint,
    schemaDir,
    schemaPath: join(schemaDir, `${endpoint}.json`),
    endpointDir,
    recordsDir: join(endpointDir, "records"),
    deletionsDir: join(endpointDir, "deletions"),
    manifestPath: join(endpointDir, "_manifest.json"),
  };
}

export async function ensureManagedDirectories(paths: ManagedPaths): Promise<void> {
  await mkdir(paths.schemaDir, { recursive: true });
  await mkdir(paths.recordsDir, { recursive: true });
  await mkdir(paths.deletionsDir, { recursive: true });
}

export async function loadManagedEndpointState(
  rootDir: string,
  endpoint: string,
): Promise<ManagedEndpointState> {
  const paths = buildManagedPaths(rootDir, endpoint);
  const manifest = await readManagedManifest(paths);
  const manifestMap = new Map(manifest.records.map((record) => [record.id, record]));
  const localRecords = await readManagedRecords(paths, manifestMap);
  const tombstones = await readManagedTombstones(paths);

  return {
    endpoint,
    paths,
    manifest,
    localRecords,
    tombstones,
  };
}

export async function writeManagedSchema(paths: ManagedPaths, schema: unknown): Promise<void> {
  await ensureManagedDirectories(paths);
  await writeJsonFile(paths.schemaPath, schema);
}

export async function writeManagedRecord(
  paths: ManagedPaths,
  fileName: string,
  payload: JsonObject,
): Promise<void> {
  await ensureManagedDirectories(paths);
  await writeJsonFile(join(paths.recordsDir, fileName), payload);
}

export async function writeManagedManifest(
  paths: ManagedPaths,
  manifest: ManagedManifest,
): Promise<void> {
  await ensureManagedDirectories(paths);
  await writeJsonFile(paths.manifestPath, manifest);
}

export async function replaceManagedRecordFile(
  paths: ManagedPaths,
  currentFileName: string,
  nextFileName: string,
  payload: JsonObject,
): Promise<void> {
  await ensureManagedDirectories(paths);
  const currentPath = join(paths.recordsDir, currentFileName);
  const nextPath = join(paths.recordsDir, nextFileName);
  if (currentFileName !== nextFileName) {
    await rename(currentPath, nextPath);
  }
  await writeJsonFile(nextPath, payload);
}

export async function deleteManagedTombstone(
  paths: ManagedPaths,
  tombstoneFileName: string,
): Promise<void> {
  await rm(join(paths.deletionsDir, tombstoneFileName), { force: true });
}

export async function discoverManagedEndpoints(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const endpoints = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "schema")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return endpoints;
}

export function createManagedManifest(params: {
  endpoint: string;
  schemaPath: string;
  pulledAt: string | null;
  records: ManagedManifestRecord[];
}): ManagedManifest {
  return {
    formatVersion: MANAGED_JSON_FORMAT_VERSION,
    endpoint: params.endpoint,
    pulledAt: params.pulledAt,
    schemaPath: params.schemaPath,
    totalCount: params.records.length,
    records: [...params.records].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function createManagedManifestRecord(params: {
  id: string;
  fileName: string;
  payload: JsonObject;
  remoteUpdatedAt?: string | null;
  remotePublishedAt?: string | null;
}): ManagedManifestRecord {
  return {
    id: params.id,
    file: `records/${params.fileName}`,
    sha256: sha256Json(params.payload),
    remoteUpdatedAt: params.remoteUpdatedAt ?? null,
    remotePublishedAt: params.remotePublishedAt ?? null,
  };
}

export function upsertManagedManifestRecord(
  manifest: ManagedManifest,
  nextRecord: ManagedManifestRecord,
): ManagedManifest {
  const records = manifest.records.filter((record) => record.id !== nextRecord.id);
  records.push(nextRecord);
  records.sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...manifest,
    totalCount: records.length,
    records,
  };
}

export function removeManagedManifestRecord(
  manifest: ManagedManifest,
  recordId: string,
): ManagedManifest {
  const records = manifest.records.filter((record) => record.id !== recordId);
  return {
    ...manifest,
    totalCount: records.length,
    records,
  };
}

function normalizeRelationValue(value: unknown): unknown {
  if (isPlainRecord(value)) {
    return value.id ?? value;
  }

  return value;
}

function normalizeRelationListValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (isPlainRecord(item)) {
        return typeof item.id === "string" ? item.id : null;
      }

      return typeof item === "string" ? item : null;
    })
    .filter((item): item is string => item !== null);
}

function normalizeMediaValue(value: unknown): unknown {
  if (isPlainRecord(value)) {
    return value.url ?? value;
  }

  return value;
}

function normalizeSelectValue(payload: JsonObject, field: ApiField, value: unknown): void {
  const fieldId = field.fieldId;
  if (!fieldId) {
    return;
  }

  const multiple = isFieldMultiple(field);
  if (multiple) {
    payload[fieldId] = Array.isArray(value) ? value : value == null ? [] : [value];
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      payload[fieldId] = value[0];
    }
    return;
  }

  if (value !== null && value !== "") {
    payload[fieldId] = value;
  }
}

async function readManagedManifest(paths: ManagedPaths): Promise<ManagedManifest> {
  try {
    const raw = await readJsonFile(paths.manifestPath);
    const parsed = assertJsonObject(raw, "Managed manifest must be a JSON object");
    const records = Array.isArray(parsed.records)
      ? parsed.records
          .map((record) => normalizeManifestRecord(record))
          .filter((record): record is ManagedManifestRecord => record !== null)
      : [];
    return {
      formatVersion:
        typeof parsed.formatVersion === "string"
          ? parsed.formatVersion
          : MANAGED_JSON_FORMAT_VERSION,
      endpoint: typeof parsed.endpoint === "string" ? parsed.endpoint : paths.endpoint,
      pulledAt: typeof parsed.pulledAt === "string" ? parsed.pulledAt : null,
      schemaPath:
        typeof parsed.schemaPath === "string"
          ? parsed.schemaPath
          : join("schema", `${paths.endpoint}.json`),
      totalCount: typeof parsed.totalCount === "number" ? parsed.totalCount : records.length,
      records,
    };
  } catch (error) {
    if (error instanceof CliError && error.message.startsWith("Could not read file:")) {
      return createManagedManifest({
        endpoint: paths.endpoint,
        pulledAt: null,
        schemaPath: join("schema", `${paths.endpoint}.json`),
        records: [],
      });
    }
    throw error;
  }
}

async function readManagedRecords(
  paths: ManagedPaths,
  manifestMap: Map<string, ManagedManifestRecord>,
): Promise<ManagedLocalRecord[]> {
  const entries = await readdir(paths.recordsDir, { withFileTypes: true }).catch(() => []);
  const records: ManagedLocalRecord[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = join(paths.recordsDir, entry.name);
    const payload = assertObjectPayload(await readJsonFile(filePath));
    const id = entry.name.replace(/\.json$/u, "");
    records.push({
      id,
      fileName: entry.name,
      filePath,
      relativePath: `records/${entry.name}`,
      payload,
      sha256: sha256Json(payload),
      manifestRecord: manifestMap.get(id) ?? null,
    });
  }

  records.sort((left, right) => left.fileName.localeCompare(right.fileName));
  return records;
}

async function readManagedTombstones(paths: ManagedPaths): Promise<ManagedTombstone[]> {
  const entries = await readdir(paths.deletionsDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => ({
      id: entry.name.replace(/\.json$/u, ""),
      fileName: entry.name,
      filePath: join(paths.deletionsDir, entry.name),
      relativePath: `deletions/${entry.name}`,
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

function normalizeManifestRecord(value: unknown): ManagedManifestRecord | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  if (typeof value.id !== "string" || value.id.length === 0) {
    return null;
  }

  return {
    id: value.id,
    file: typeof value.file === "string" ? value.file : `records/${value.id}.json`,
    sha256: typeof value.sha256 === "string" ? value.sha256 : "",
    remoteUpdatedAt: typeof value.remoteUpdatedAt === "string" ? value.remoteUpdatedAt : null,
    remotePublishedAt: typeof value.remotePublishedAt === "string" ? value.remotePublishedAt : null,
  };
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderJsonFile(value), "utf8");
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (isPlainRecord(value)) {
    const entries = Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function assertJsonObject(value: unknown, message: string): JsonObject {
  if (!isPlainRecord(value)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return value;
}

function isPlainRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
