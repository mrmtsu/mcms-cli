import { z } from "zod";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";

const RESERVED_FIELD_IDS = new Set([
  "id",
  "createdat",
  "updatedat",
  "publishedat",
  "revisedat",
  "fieldid",
]);

const fieldIdSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => !RESERVED_FIELD_IDS.has(value.toLowerCase()), {
    message: "reserved field ID",
  });

const apiFieldSchema = z
  .object({
    fieldId: fieldIdSchema,
    name: z.string().min(1).max(100),
    kind: z.string().min(1),
  })
  .passthrough();

const apiFieldsSchema = z
  .array(apiFieldSchema)
  .min(1)
  .superRefine((fields, context) => {
    addDuplicateFieldIdIssues(fields, context, "field");
  });

const fieldOrderByColumnSchema = z.array(z.array(fieldIdSchema).min(1)).min(1).max(2);

const customFieldSchema = z
  .object({
    fieldId: fieldIdSchema,
    name: z.string().min(1).max(300),
    fields: apiFieldsSchema,
    fieldOrderByColumn: fieldOrderByColumnSchema,
  })
  .passthrough()
  .superRefine((customField, context) => {
    const fieldIds = new Set(customField.fields.map((field) => field.fieldId));
    const orderedFieldIds = new Set<string>();

    for (const [columnIndex, column] of customField.fieldOrderByColumn.entries()) {
      for (const [fieldIndex, fieldId] of column.entries()) {
        if (!fieldIds.has(fieldId)) {
          context.addIssue({
            code: "custom",
            path: ["fieldOrderByColumn", columnIndex, fieldIndex],
            message: `unknown field ID: ${fieldId}`,
          });
          continue;
        }

        if (orderedFieldIds.has(fieldId)) {
          context.addIssue({
            code: "custom",
            path: ["fieldOrderByColumn", columnIndex, fieldIndex],
            message: `duplicate field ID: ${fieldId}`,
          });
          continue;
        }

        orderedFieldIds.add(fieldId);
      }
    }

    for (const [fieldIndex, field] of customField.fields.entries()) {
      if (!orderedFieldIds.has(field.fieldId)) {
        context.addIssue({
          code: "custom",
          path: ["fields", fieldIndex, "fieldId"],
          message: `field ID is missing from fieldOrderByColumn: ${field.fieldId}`,
        });
      }
    }
  });

const customFieldsSchema = z
  .array(customFieldSchema)
  .max(99)
  .superRefine((customFields, context) => {
    addDuplicateFieldIdIssues(customFields, context, "custom field");
  });

const apiCreatePayloadSchema = z
  .object({
    name: z.string().min(1).max(300),
    endpoint: z.string().regex(/^[a-z0-9_-]{3,32}$/),
    type: z.enum(["list", "object"]),
    apiFields: apiFieldsSchema,
    customFields: customFieldsSchema.optional(),
  })
  .strict();

export type ApiType = "list" | "object";

export type ApiCreatePayload = z.infer<typeof apiCreatePayloadSchema>;

export type ApiCreateOverrides = {
  name?: string;
  endpoint?: string;
  type?: ApiType;
};

export function parseApiCreatePayload(
  input: unknown,
  overrides: ApiCreateOverrides = {},
): ApiCreatePayload {
  const objectResult = z.record(z.string(), z.unknown()).safeParse(input);
  if (!objectResult.success) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Invalid API create payload",
      detailsVisibility: "always",
      details: {
        issues: objectResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const candidate: Record<string, unknown> = { ...objectResult.data };
  if (overrides.name !== undefined) {
    candidate.name = overrides.name;
  }
  if (overrides.endpoint !== undefined) {
    candidate.endpoint = overrides.endpoint;
  }
  if (overrides.type !== undefined) {
    candidate.type = overrides.type;
  }

  const parsed = apiCreatePayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Invalid API create payload",
      detailsVisibility: "always",
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return parsed.data;
}

function addDuplicateFieldIdIssues(
  fields: Array<{ fieldId: string }>,
  context: {
    addIssue: (issue: { code: "custom"; path: (string | number)[]; message: string }) => void;
  },
  label: string,
): void {
  const seen = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (seen.has(field.fieldId)) {
      context.addIssue({
        code: "custom",
        path: [index, "fieldId"],
        message: `duplicate ${label} ID: ${field.fieldId}`,
      });
      continue;
    }

    seen.add(field.fieldId);
  }
}
