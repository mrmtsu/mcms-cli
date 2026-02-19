import type { Command } from "commander";
import { createRuntimeContext, type RuntimeContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";

export async function contextFromCommand(command: Command): Promise<RuntimeContext> {
  const options = command.optsWithGlobals();
  return createRuntimeContext(options);
}

export function getActionCommand(args: unknown[]): Command {
  const command = args.at(-1);
  if (
    command &&
    typeof command === "object" &&
    "optsWithGlobals" in command &&
    typeof (command as { optsWithGlobals?: unknown }).optsWithGlobals === "function"
  ) {
    return command as Command;
  }

  throw new Error("Command context is unavailable");
}

export function parseIntegerOption(
  name: string,
  value: string | undefined,
  range?: { min?: number; max?: number }
): number | undefined {
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw invalidInteger(name, value, describeRange(range));
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw invalidInteger(name, value, describeRange(range));
  }

  if (range?.min !== undefined && parsed < range.min) {
    throw invalidInteger(name, value, describeRange(range));
  }

  if (range?.max !== undefined && parsed > range.max) {
    throw invalidInteger(name, value, describeRange(range));
  }

  return parsed;
}

function invalidInteger(name: string, value: string, expected: string): CliError {
  return new CliError({
    code: "INVALID_INPUT",
    message: `Invalid ${name}: ${value}. Expected ${expected}.`,
    exitCode: EXIT_CODE.INVALID_INPUT
  });
}

function describeRange(range?: { min?: number; max?: number }): string {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return "integer";
  }

  if (range.min !== undefined && range.max !== undefined) {
    return `integer in range ${range.min}-${range.max}`;
  }

  if (range.min !== undefined) {
    return `integer >= ${range.min}`;
  }

  return `integer <= ${range.max}`;
}
