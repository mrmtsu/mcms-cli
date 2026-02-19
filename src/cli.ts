#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";
import { registerApiCommands } from "./commands/api.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCompletionCommands } from "./commands/completion.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerContentCommands } from "./commands/content.js";
import { registerMediaCommands } from "./commands/media.js";
import { registerSchemaCommands } from "./commands/schema.js";
import { registerTypesCommands } from "./commands/types.js";
import { registerValidateCommand } from "./commands/validate.js";
import type { RuntimeContext } from "./core/context.js";
import { CliError, normalizeError } from "./core/errors.js";
import { EXIT_CODE } from "./core/exit-codes.js";
import { printError } from "./core/output.js";

type PackageJson = {
  version?: unknown;
};

const VERSION = resolveVersion();

function resolveVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as PackageJson;
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // fallback for non-standard runtime layouts
  }

  return "0.1.0";
}

async function main(argv: string[]): Promise<void> {
  const isJsonMode = argv.includes("--json");
  const program = new Command();

  program
    .name("microcms")
    .description("AI/CI friendly microCMS CLI")
    .version(VERSION)
    .option("--json", "machine-readable JSON output")
    .option("--plain", "human output mode (line-oriented)")
    .option("--table", "human output mode (table)")
    .option("--select <fields>", "comma-separated field names for --table output")
    .option("--profile <name>", "profile name to resolve service domain / keychain key")
    .option("--service-domain <serviceDomain>", "microCMS service domain")
    .option("--api-key <apiKey>", "microCMS API key (less secure: may leak via shell history/process list)")
    .option("--api-key-stdin", "read microCMS API key from stdin")
    .option("--timeout <ms>", "request timeout in milliseconds", "10000")
    .option("--retry <count>", "retry count for retryable failures (0-10)", "2")
    .option("--retry-max-delay <ms>", "max retry delay in milliseconds (100-120000)", "3000")
    .option("--verbose", "verbose error output")
    .option("--no-color", "disable colorized output")
    .showHelpAfterError();

  program.configureOutput({
    writeOut: (text) => {
      if (!isJsonMode) {
        process.stdout.write(text);
      }
    },
    writeErr: (text) => {
      if (!isJsonMode) {
        process.stderr.write(text);
      }
    }
  });

  registerAuthCommands(program);
  registerApiCommands(program);
  registerConfigCommands(program);
  registerCompletionCommands(program);
  registerContentCommands(program);
  registerMediaCommands(program);
  registerSchemaCommands(program);
  registerTypesCommands(program);
  registerValidateCommand(program);

  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && (error.code === "commander.helpDisplayed" || error.exitCode === 0)) {
      process.exit(EXIT_CODE.SUCCESS);
      return;
    }

    const fallbackContext = createFallbackContext(argv);

    const normalized = normalizeCommander(error) ?? normalizeError(error);
    printError(fallbackContext, normalized);
    process.exit(normalized.exitCode);
  }
}

function createFallbackContext(argv: string[]): RuntimeContext {
  const json = argv.includes("--json");
  const plain = argv.includes("--plain");
  const table = argv.includes("--table");
  const selectFields = parseSelectFieldsFromArgv(argv);

  const outputMode = table ? "table" : plain ? "plain" : "inspect";

  return {
    json,
    verbose: argv.includes("--verbose"),
    color: !argv.includes("--no-color"),
    timeoutMs: 10_000,
    retry: 2,
    retryMaxDelayMs: 3_000,
    outputMode,
    selectFields,
    profile: undefined,
    profileSource: "none",
    serviceDomain: undefined,
    serviceDomainSource: "none",
    apiKey: undefined,
    apiKeySource: "none",
    apiKeySourceDetail: "none"
  };
}

function parseSelectFieldsFromArgv(argv: string[]): string[] | undefined {
  const selectIndex = argv.indexOf("--select");
  if (selectIndex === -1) {
    return undefined;
  }

  const raw = argv.at(selectIndex + 1);
  if (!raw || raw.startsWith("--")) {
    return undefined;
  }

  const fields = raw
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field.length > 0);

  return fields.length > 0 ? fields : undefined;
}

function normalizeCommander(error: unknown): CliError | null {
  if (!(error instanceof CommanderError)) {
    return null;
  }

  if (error.exitCode === 0) {
    return null;
  }

  return new CliError({
    code: "INVALID_INPUT",
    message: error.message,
    exitCode: EXIT_CODE.INVALID_INPUT,
    details: {
      commanderCode: error.code
    }
  });
}

void main(process.argv.slice(2));
