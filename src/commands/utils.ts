import { Command } from "commander";
import { createRuntimeContext, type RuntimeContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";

export async function contextFromCommand(command: Command): Promise<RuntimeContext> {
  const options = command.optsWithGlobals();
  return createRuntimeContext(options);
}

type CommandAction<TArgs extends unknown[]> = (...args: [...TArgs, Command]) => Promise<void>;

export function withCommandContext<TArgs extends unknown[]>(
  handler: (ctx: RuntimeContext, ...args: TArgs) => Promise<void>,
): CommandAction<TArgs> {
  return async (...args: [...TArgs, Command]) => {
    const commandCandidate = args.at(-1);
    if (!isCommand(commandCandidate)) {
      throw new Error("Command context is unavailable");
    }

    const command = commandCandidate;
    const ctx = await contextFromCommand(command);
    const actionArgs = args.slice(0, -1) as TArgs;
    await handler(ctx, ...actionArgs);
  };
}

function isCommand(value: unknown): value is Command {
  return (
    value instanceof Command ||
    (typeof value === "object" &&
      value !== null &&
      "optsWithGlobals" in value &&
      typeof (value as { optsWithGlobals?: unknown }).optsWithGlobals === "function")
  );
}

export function parseIntegerOption(
  name: string,
  value: string | undefined,
  range?: { min?: number; max?: number },
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

export function parseIntervalOption(
  value: string | undefined,
  options?: { name?: string; min?: number; max?: number; defaultValue?: number },
): number {
  const name = options?.name ?? "interval";
  const min = options?.min ?? 0;
  const max = options?.max ?? 60_000;
  const defaultValue = options?.defaultValue ?? 0;
  return parseIntegerOption(name, value, { min, max }) ?? defaultValue;
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function invalidInteger(name: string, value: string, expected: string): CliError {
  return new CliError({
    code: "INVALID_INPUT",
    message: `Invalid ${name}: ${value}. Expected ${expected}.`,
    exitCode: EXIT_CODE.INVALID_INPUT,
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
