import { z } from "zod";
import { extractAllowedValues, extractApiFields, normalizeKind } from "../core/api-field-utils.js";

const payloadSchema = z.record(z.string(), z.unknown());

export type ValidationIssueCode =
  | "INVALID_PAYLOAD_SHAPE"
  | "REQUIRED_FIELD_MISSING"
  | "UNKNOWN_FIELD"
  | "FIELD_TYPE_MISMATCH"
  | "FIELD_VALUE_OUT_OF_RANGE";

export type ValidationIssue = {
  level: "error" | "warning";
  code: ValidationIssueCode;
  path: string;
  reason: string;
  field?: string;
  expected?: unknown;
  actual?: unknown;
  allowedValues?: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
};

type ApiField = {
  fieldId?: string;
  required?: boolean;
  kind?: string;
  type?: string;
  fieldType?: string;
  inputType?: string;
  multiple?: boolean;
  isMultiple?: boolean;
  selectItems?: unknown;
  options?: unknown;
};

type ExpectedValueType = "string" | "number" | "boolean" | "array" | "object";

export function validatePayload(payload: unknown, apiSchema?: unknown): ValidationResult {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
      level: "error",
      code: "INVALID_PAYLOAD_SHAPE",
      path: formatIssuePath(issue.path),
      reason: issue.message,
      field: extractFieldFromPath(issue.path),
      actual: describeValueType(payload),
      expected: "object",
    }));

    return {
      valid: false,
      errors,
      warnings: [],
      issues,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: ValidationIssue[] = [];

  const fields = extractApiFields(apiSchema) as ApiField[];
  const knownFields = new Map(
    fields
      .filter(
        (field): field is ApiField & { fieldId: string } =>
          typeof field.fieldId === "string" && field.fieldId.length > 0,
      )
      .map((field) => [field.fieldId, field]),
  );

  const requiredFields = fields
    .filter((field) => field.required && field.fieldId)
    .map((field) => field.fieldId as string);
  for (const field of requiredFields) {
    if (!(field in parsed.data)) {
      const message = `Required field is missing: ${field}`;
      errors.push(message);
      issues.push({
        level: "error",
        code: "REQUIRED_FIELD_MISSING",
        path: formatIssuePath([field]),
        field,
        reason: message,
        expected: "present",
        actual: "missing",
      });
    }
  }

  if (knownFields.size > 0) {
    for (const key of Object.keys(parsed.data)) {
      if (!knownFields.has(key)) {
        const message = `Unknown field in payload: ${key}`;
        warnings.push(message);
        issues.push({
          level: "warning",
          code: "UNKNOWN_FIELD",
          path: formatIssuePath([key]),
          field: key,
          reason: message,
          expected: "known field",
          actual: "unknown field",
        });
      }
    }
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    const field = knownFields.get(key);
    if (!field) {
      continue;
    }

    const expectedType = inferExpectedType(field);
    if (expectedType && !matchesExpectedType(value, expectedType)) {
      const actualType = describeValueType(value);
      const message = `Field type mismatch: ${key} expected ${expectedType} (actual ${actualType})`;
      errors.push(message);
      issues.push({
        level: "error",
        code: "FIELD_TYPE_MISMATCH",
        path: formatIssuePath([key]),
        field: key,
        reason: message,
        expected: expectedType,
        actual: actualType,
      });
      continue;
    }

    const allowedValues = toAllowedValueSet(field);
    if (!allowedValues) {
      continue;
    }

    if (typeof value === "string") {
      if (!allowedValues.has(value)) {
        const allowedValuesList = [...allowedValues];
        const message = `Field value out of range: ${key} must be one of [${allowedValuesList.join(", ")}]`;
        errors.push(message);
        issues.push({
          level: "error",
          code: "FIELD_VALUE_OUT_OF_RANGE",
          path: formatIssuePath([key]),
          field: key,
          reason: message,
          expected: "value in allowed set",
          actual: value,
          allowedValues: allowedValuesList,
        });
      }
      continue;
    }

    if (Array.isArray(value)) {
      const invalid = value.filter((item) => typeof item === "string" && !allowedValues.has(item));
      if (invalid.length > 0) {
        const allowedValuesList = [...allowedValues];
        const message = `Field value out of range: ${key} has invalid values [${invalid.join(", ")}]`;
        errors.push(message);
        issues.push({
          level: "error",
          code: "FIELD_VALUE_OUT_OF_RANGE",
          path: formatIssuePath([key]),
          field: key,
          reason: message,
          expected: "all items in allowed set",
          actual: invalid,
          allowedValues: allowedValuesList,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  };
}

function inferExpectedType(field: ApiField): ExpectedValueType | null {
  const explicit = [field.type, field.fieldType, field.inputType]
    .map((value) => normalizeTypeHint(value))
    .find((value): value is ExpectedValueType => value !== null);
  if (explicit) {
    return explicit;
  }

  const kind = normalizeKind(field.kind);
  if (!kind) {
    return null;
  }

  switch (kind) {
    case "number":
    case "int":
    case "integer":
    case "float":
    case "double":
    case "decimal":
      return "number";
    case "boolean":
    case "switch":
    case "checkbox":
      return "boolean";
    case "repeater":
    case "array":
    case "list":
      return "array";
    case "group":
    case "object":
      return "object";
    case "text":
    case "textarea":
    case "richtext":
    case "richeditor":
    case "wysiwyg":
    case "date":
    case "datetime":
    case "time":
    case "slug":
    case "url":
    case "select":
    case "radio":
      return "string";
    case "relation":
      return field.multiple || field.isMultiple ? "array" : null;
    default:
      // Unknown kinds are skipped to avoid false-positive type errors.
      return null;
  }
}

function normalizeTypeHint(value: unknown): ExpectedValueType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeKind(value);
  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case "string":
    case "text":
      return "string";
    case "number":
    case "int":
    case "integer":
    case "float":
    case "double":
    case "decimal":
      return "number";
    case "boolean":
    case "bool":
      return "boolean";
    case "array":
    case "list":
      return "array";
    case "object":
    case "group":
      return "object";
    default:
      return null;
  }
}

function matchesExpectedType(value: unknown, expected: ExpectedValueType): boolean {
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

function toAllowedValueSet(field: ApiField): Set<string> | null {
  const values = extractAllowedValues(field);
  if (values.length === 0) {
    return null;
  }

  return new Set(values);
}

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) {
    return "$";
  }

  let result = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`;
      continue;
    }

    if (typeof segment === "string") {
      result += `.${segment}`;
      continue;
    }

    result += `.${String(segment)}`;
  }

  return result;
}

function extractFieldFromPath(path: ReadonlyArray<PropertyKey>): string | undefined {
  const first = path.find((segment): segment is string => typeof segment === "string");
  return first;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return "non-finite number";
  }

  return typeof value;
}
