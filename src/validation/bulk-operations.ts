import { z } from "zod";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";

const payloadSchema = z.record(z.string(), z.unknown());

const createOperationSchema = z
  .object({
    action: z.literal("create"),
    endpoint: z.string().min(1),
    payload: payloadSchema,
  })
  .strict();

const updateOperationSchema = z
  .object({
    action: z.literal("update"),
    endpoint: z.string().min(1),
    id: z.string().min(1),
    payload: payloadSchema,
  })
  .strict();

const deleteOperationSchema = z
  .object({
    action: z.literal("delete"),
    endpoint: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

const statusOperationSchema = z
  .object({
    action: z.literal("status"),
    endpoint: z.string().min(1),
    id: z.string().min(1),
    status: z.enum(["PUBLISH", "DRAFT"]),
  })
  .strict();

const operationSchema = z.discriminatedUnion("action", [
  createOperationSchema,
  updateOperationSchema,
  deleteOperationSchema,
  statusOperationSchema,
]);

const operationFileSchema = z
  .object({
    operations: z.array(operationSchema).min(1),
  })
  .strict();

export type BulkOperation = z.infer<typeof operationSchema>;

export function parseBulkOperations(input: unknown): BulkOperation[] {
  const parsed = operationFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Invalid bulk operation file",
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  return parsed.data.operations;
}
