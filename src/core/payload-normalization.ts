import { extractApiFields, isFieldMultiple, normalizeKind } from "./api-field-utils.js";

type ApiField = {
  fieldId?: string;
  kind?: string;
  multiple?: boolean;
  isMultiple?: boolean;
  multipleSelect?: boolean;
};

export function normalizePayloadForWrite(
  payload: Record<string, unknown>,
  schema: unknown,
): Record<string, unknown> {
  const fields = extractApiFields(schema) as ApiField[];
  if (fields.length === 0) {
    return payload;
  }

  let normalized: Record<string, unknown> | null = null;

  for (const field of fields) {
    if (typeof field.fieldId !== "string" || !(field.fieldId in payload)) {
      continue;
    }

    if (normalizeKind(field.kind) !== "select") {
      continue;
    }

    const nextValue = normalizeSelectValueForWrite(field, payload[field.fieldId]);
    if (nextValue === payload[field.fieldId]) {
      continue;
    }

    normalized ??= { ...payload };
    normalized[field.fieldId] = nextValue;
  }

  return normalized ?? payload;
}

function normalizeSelectValueForWrite(field: ApiField, value: unknown): unknown {
  if (Array.isArray(value)) {
    if (isFieldMultiple(field)) {
      return [...value];
    }

    if (value.length === 0) {
      return [];
    }

    return [value[0]];
  }

  if (value === undefined) {
    return value;
  }

  if (value === null || value === "") {
    return [];
  }

  return [value];
}
