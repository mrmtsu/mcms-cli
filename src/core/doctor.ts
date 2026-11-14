import { extractAllowedValues, normalizeKind, type ApiFieldRecord } from "./api-field-utils.js";

export type DoctorSeverity = "error" | "warning" | "info";

export type DoctorFinding = {
  check: string;
  severity: DoctorSeverity;
  field?: string;
  count: number;
  examples: { id: string; detail: string }[];
};

export type DoctorStaleRule = {
  field: string;
  equals: string;
  days: number;
  since?: string;
};

export type DoctorEndpointRules = {
  requireFields?: string[];
  unique?: string[];
  stale?: DoctorStaleRule[];
};

export type DoctorRules = {
  endpoints: Record<string, DoctorEndpointRules>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldIdOf(field: ApiFieldRecord): string | null {
  return typeof field.fieldId === "string" && field.fieldId.length > 0 ? field.fieldId : null;
}

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/** Normalize a select-like value (scalar or array) into a list of strings. */
export function selectValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string | number => typeof item === "string" || typeof item === "number",
      )
      .map((item) => String(item));
  }
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  return [];
}

/** Extract referenced content ids from a relation field value. */
export function referencedIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => referencedIds(item));
  }
  if (isRecord(value)) {
    return typeof value.id === "string" ? [value.id] : [];
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [];
}

export type RelationField = { fieldId: string; target: string };

export function relationFieldsOf(fields: ApiFieldRecord[]): RelationField[] {
  const relations: RelationField[] = [];
  for (const field of fields) {
    const fieldId = fieldIdOf(field);
    if (!fieldId || normalizeKind(field.kind) !== "relation") {
      continue;
    }
    const target =
      typeof field.referencedApiEndpoint === "string" ? field.referencedApiEndpoint : null;
    if (target) {
      relations.push({ fieldId, target });
    }
  }
  return relations;
}

/**
 * Field ids worth fetching for doctor checks. Relation fields are requested
 * as `<fieldId>.id` so referenced contents are not expanded in full.
 */
export function collectDoctorFieldIds(
  fields: ApiFieldRecord[],
  rules?: DoctorEndpointRules,
): string[] {
  const ids = new Set<string>(["id", "createdAt", "updatedAt"]);
  const relations = new Set(relationFieldsOf(fields).map((rel) => rel.fieldId));

  const add = (fieldId: string) => {
    ids.add(relations.has(fieldId) ? `${fieldId}.id` : fieldId);
  };

  for (const field of fields) {
    const fieldId = fieldIdOf(field);
    if (!fieldId) {
      continue;
    }
    const kind = normalizeKind(field.kind);
    if (
      field.required === true ||
      field.isUnique === true ||
      kind === "select" ||
      kind === "relation"
    ) {
      add(fieldId);
    }
  }

  for (const fieldId of rules?.requireFields ?? []) {
    add(fieldId);
  }
  for (const fieldId of rules?.unique ?? []) {
    add(fieldId);
  }
  for (const stale of rules?.stale ?? []) {
    add(stale.field);
    ids.add(stale.since ?? "updatedAt");
  }

  return [...ids];
}

export function parseDoctorRules(raw: unknown): DoctorRules {
  if (!isRecord(raw)) {
    throw new Error("Doctor rules file must be a JSON object.");
  }
  const rawEndpoints = raw.endpoints ?? {};
  if (!isRecord(rawEndpoints)) {
    throw new Error("Doctor rules `endpoints` must be an object keyed by endpoint.");
  }

  const endpoints: Record<string, DoctorEndpointRules> = {};
  for (const [endpoint, value] of Object.entries(rawEndpoints)) {
    if (!isRecord(value)) {
      throw new Error(`Doctor rules for endpoint "${endpoint}" must be an object.`);
    }
    const parsed: DoctorEndpointRules = {};

    if (value.requireFields !== undefined) {
      parsed.requireFields = parseStringArray(
        value.requireFields,
        `endpoints.${endpoint}.requireFields`,
      );
    }
    if (value.unique !== undefined) {
      parsed.unique = parseStringArray(value.unique, `endpoints.${endpoint}.unique`);
    }
    if (value.stale !== undefined) {
      if (!Array.isArray(value.stale)) {
        throw new Error(`Doctor rules endpoints.${endpoint}.stale must be an array.`);
      }
      parsed.stale = value.stale.map((entry, index) => {
        const where = `endpoints.${endpoint}.stale[${index}]`;
        if (!isRecord(entry)) {
          throw new Error(`Doctor rules ${where} must be an object.`);
        }
        if (typeof entry.field !== "string" || typeof entry.equals !== "string") {
          throw new Error(`Doctor rules ${where} requires string "field" and "equals".`);
        }
        if (typeof entry.days !== "number" || !Number.isFinite(entry.days) || entry.days < 0) {
          throw new Error(`Doctor rules ${where} requires a non-negative number "days".`);
        }
        if (entry.since !== undefined && typeof entry.since !== "string") {
          throw new Error(`Doctor rules ${where}.since must be a string when present.`);
        }
        return {
          field: entry.field,
          equals: entry.equals,
          days: entry.days,
          ...(typeof entry.since === "string" ? { since: entry.since } : {}),
        };
      });
    }

    endpoints[endpoint] = parsed;
  }

  return { endpoints };
}

function parseStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Doctor rules ${where} must be an array of strings.`);
  }
  return [...value];
}

type FindingAccumulator = {
  check: string;
  severity: DoctorSeverity;
  field?: string;
  ids: { id: string; detail: string }[];
};

export type DoctorCheckContext = {
  fields: ApiFieldRecord[];
  records: Record<string, unknown>[];
  rules?: DoctorEndpointRules;
  /** Id sets of relation target endpoints, keyed by endpoint. */
  relationTargets?: Map<string, Set<string>>;
  /** Ids of this endpoint that are referenced from any checked endpoint. */
  referencedIds?: Set<string>;
  /** Whether any checked schema has a relation field pointing at this endpoint. */
  hasIncomingRelations?: boolean;
  now?: Date;
  maxExamples?: number;
};

export function runDoctorChecks(context: DoctorCheckContext): DoctorFinding[] {
  const maxExamples = context.maxExamples ?? 5;
  const now = context.now ?? new Date();
  const accumulators = new Map<string, FindingAccumulator>();

  const add = (
    check: string,
    severity: DoctorSeverity,
    field: string | undefined,
    record: Record<string, unknown>,
    detail: string,
  ) => {
    const key = `${check}:${field ?? ""}`;
    let acc = accumulators.get(key);
    if (!acc) {
      acc = { check, severity, ...(field ? { field } : {}), ids: [] };
      accumulators.set(key, acc);
    }
    acc.ids.push({ id: typeof record.id === "string" ? record.id : "(no id)", detail });
  };

  const records = context.records;
  const rules = context.rules ?? {};

  for (const field of context.fields) {
    const fieldId = fieldIdOf(field);
    if (!fieldId) {
      continue;
    }
    const kind = normalizeKind(field.kind);

    if (field.required === true) {
      for (const record of records) {
        if (isEmptyValue(record[fieldId])) {
          add("required-empty", "warning", fieldId, record, "required field is empty");
        }
      }
    }

    if (kind === "select") {
      const allowed = extractAllowedValues(field);
      if (allowed.length > 0) {
        const allowedSet = new Set(allowed);
        for (const record of records) {
          const invalid = selectValues(record[fieldId]).filter((value) => !allowedSet.has(value));
          if (invalid.length > 0) {
            add(
              "select-invalid",
              "error",
              fieldId,
              record,
              `value(s) not in schema options: ${invalid.join(", ")}`,
            );
          }
        }
      }
    }

    if (kind === "relation") {
      const target =
        typeof field.referencedApiEndpoint === "string" ? field.referencedApiEndpoint : null;
      const targetIds = target ? context.relationTargets?.get(target) : undefined;
      if (target && targetIds) {
        for (const record of records) {
          const broken = referencedIds(record[fieldId]).filter((id) => !targetIds.has(id));
          if (broken.length > 0) {
            add(
              "relation-broken",
              "error",
              fieldId,
              record,
              `referenced ${target} id(s) not found: ${broken.join(", ")}`,
            );
          }
        }
      }
    }

    if (field.isUnique === true) {
      addUniqueFindings(add, records, fieldId, "schema isUnique");
    }
  }

  for (const fieldId of rules.unique ?? []) {
    addUniqueFindings(add, records, fieldId, "rules.unique");
  }

  for (const fieldId of rules.requireFields ?? []) {
    for (const record of records) {
      if (isEmptyValue(record[fieldId])) {
        add(
          "rule-required-empty",
          "warning",
          fieldId,
          record,
          "field required by doctor rules is empty",
        );
      }
    }
  }

  for (const stale of rules.stale ?? []) {
    const sinceField = stale.since ?? "updatedAt";
    for (const record of records) {
      if (!selectValues(record[stale.field]).includes(stale.equals)) {
        continue;
      }
      const timestamp = record[sinceField];
      if (typeof timestamp !== "string") {
        continue;
      }
      const ageMs = now.getTime() - Date.parse(timestamp);
      if (Number.isFinite(ageMs) && ageMs > stale.days * 24 * 60 * 60 * 1000) {
        add(
          "stale",
          "warning",
          stale.field,
          record,
          `${stale.field}=${stale.equals} for more than ${stale.days} day(s) (${sinceField}: ${timestamp})`,
        );
      }
    }
  }

  if (context.hasIncomingRelations && context.referencedIds) {
    for (const record of records) {
      if (typeof record.id === "string" && !context.referencedIds.has(record.id)) {
        add("orphan", "info", undefined, record, "not referenced by any checked endpoint");
      }
    }
  }

  return [...accumulators.values()].map((acc) => ({
    check: acc.check,
    severity: acc.severity,
    ...(acc.field ? { field: acc.field } : {}),
    count: acc.ids.length,
    examples: acc.ids.slice(0, maxExamples),
  }));
}

function addUniqueFindings(
  add: (
    check: string,
    severity: DoctorSeverity,
    field: string | undefined,
    record: Record<string, unknown>,
    detail: string,
  ) => void,
  records: Record<string, unknown>[],
  fieldId: string,
  source: string,
): void {
  const seen = new Map<string, string>();
  for (const record of records) {
    const value = record[fieldId];
    if (isEmptyValue(value)) {
      continue;
    }
    const key = JSON.stringify(value);
    const firstId = seen.get(key);
    if (firstId !== undefined) {
      add(
        "unique-duplicate",
        "error",
        fieldId,
        record,
        `duplicates ${firstId} (${source}): ${key}`,
      );
    } else {
      seen.set(key, typeof record.id === "string" ? record.id : "(no id)");
    }
  }
}
