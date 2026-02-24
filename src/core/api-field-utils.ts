export type ApiFieldRecord = Record<string, unknown>;

export function extractApiFields(data: unknown): ApiFieldRecord[] {
  if (typeof data !== "object" || data === null) {
    return [];
  }

  const asRecord = data as Record<string, unknown>;
  const candidates = [asRecord.apiFields, asRecord.fields, asRecord.customFields];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is ApiFieldRecord => typeof item === "object" && item !== null,
      );
    }
  }

  return [];
}

export function normalizeKind(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function extractAllowedValues(field: {
  selectItems?: unknown;
  options?: unknown;
}): string[] {
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
          const value =
            (item as { value?: unknown; id?: unknown }).value ?? (item as { id?: unknown }).id;
          return normalizeString(value);
        }

        return null;
      })
      .filter((value): value is string => value !== null);

    if (values.length > 0) {
      return [...new Set(values)];
    }
  }

  return [];
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
