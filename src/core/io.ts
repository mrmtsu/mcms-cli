import { readFile } from "node:fs/promises";
import { CliError } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";

export async function readJsonFile(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Could not read file: ${path}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: { path },
    });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Invalid JSON file: ${path}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: { path },
    });
  }
}

export function assertObjectPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Payload must be a JSON object",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return payload as Record<string, unknown>;
}
