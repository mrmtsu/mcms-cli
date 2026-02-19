import { z } from "zod";

const payloadSchema = z.record(z.unknown());

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
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
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => issue.message),
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const fields = extractFields(apiSchema);
  const knownFields = new Map(
    fields
      .filter((field): field is ApiField & { fieldId: string } => typeof field.fieldId === "string" && field.fieldId.length > 0)
      .map((field) => [field.fieldId, field])
  );

  const requiredFields = fields.filter((field) => field.required && field.fieldId).map((field) => field.fieldId as string);
  for (const field of requiredFields) {
    if (!(field in parsed.data)) {
      errors.push(`Required field is missing: ${field}`);
    }
  }

  if (knownFields.size > 0) {
    for (const key of Object.keys(parsed.data)) {
      if (!knownFields.has(key)) {
        warnings.push(`Unknown field in payload: ${key}`);
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
      errors.push(`Field type mismatch: ${key} expected ${expectedType}`);
      continue;
    }

    const allowedValues = extractAllowedValues(field);
    if (!allowedValues) {
      continue;
    }

    if (typeof value === "string") {
      if (!allowedValues.has(value)) {
        errors.push(`Field value out of range: ${key} must be one of [${[...allowedValues].join(", ")}]`);
      }
      continue;
    }

    if (Array.isArray(value)) {
      const invalid = value.filter((item) => typeof item === "string" && !allowedValues.has(item));
      if (invalid.length > 0) {
        errors.push(`Field value out of range: ${key} has invalid values [${invalid.join(", ")}]`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
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

function normalizeKind(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_-]/g, "");
  return normalized.length > 0 ? normalized : null;
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

function extractAllowedValues(field: ApiField): Set<string> | null {
  const candidates = [field.selectItems, field.options];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const values = candidate
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (typeof item === "object" && item !== null) {
          const value = (item as { value?: unknown; id?: unknown }).value ?? (item as { id?: unknown }).id;
          return typeof value === "string" ? value : null;
        }

        return null;
      })
      .filter((value): value is string => value !== null && value.length > 0);

    if (values.length > 0) {
      return new Set(values);
    }
  }

  return null;
}

function extractFields(apiSchema: unknown): ApiField[] {
  if (typeof apiSchema !== "object" || apiSchema === null) {
    return [];
  }

  const schema = apiSchema as Record<string, unknown>;
  const candidates = [schema.apiFields, schema.fields, schema.customFields];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is ApiField => typeof item === "object" && item !== null);
    }
  }

  return [];
}
