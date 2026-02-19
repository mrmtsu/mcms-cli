import { Command } from "commander";
import { canUseKeychain, saveApiKey, saveApiKeyForProfile } from "../core/auth-store.js";
import { createRuntimeContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { readConfig, writeConfig } from "../core/config.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication settings");

  auth
    .command("login")
    .description("Save API key in keychain (OAuth is not supported in MVP)")
    .option("--profile <name>", "profile name")
    .option("--service-domain <serviceDomain>", "microCMS service domain")
    .option("--api-key <apiKey>", "microCMS API key (less secure: may leak via shell history/process list)")
    .option("--api-key-stdin", "read API key from stdin")
    .option("--prompt", "prompt API key from TTY without echo")
    .action(
      async (
        options: { profile?: string; serviceDomain?: string; apiKey?: string; apiKeyStdin?: boolean; prompt?: boolean },
        command: Command
      ) => {
      const globals = command.optsWithGlobals() as Record<string, unknown>;
      const apiKeyOption = typeof globals.apiKey === "string" ? globals.apiKey : options.apiKey;
      const apiKeyStdin = Boolean(options.apiKeyStdin || globals.apiKeyStdin);
      const apiKeyPrompt = Boolean(options.prompt);

      if (apiKeyPrompt && (Boolean(apiKeyOption) || apiKeyStdin)) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: "Use --prompt alone. It conflicts with --api-key and --api-key-stdin.",
          exitCode: EXIT_CODE.INVALID_INPUT
        });
      }

      const ctx = await createRuntimeContext({
        profile: options.profile ?? (globals.profile as string | undefined),
        serviceDomain: options.serviceDomain ?? (globals.serviceDomain as string | undefined),
        apiKey: apiKeyOption,
        apiKeyStdin,
        apiKeyPrompt,
        json: Boolean(globals.json),
        plain: Boolean(globals.plain),
        table: Boolean(globals.table),
        select: globals.select as string | undefined,
        verbose: Boolean(globals.verbose),
        color: globals.color as boolean | undefined,
        timeout: globals.timeout as string | number | undefined,
        retry: globals.retry as string | number | undefined,
        retryMaxDelay: globals.retryMaxDelay as string | number | undefined
      });

      if (!ctx.serviceDomain) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: "service domain is required for auth login",
          exitCode: EXIT_CODE.INVALID_INPUT
        });
      }

      if (!ctx.apiKey) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: "API key is required for auth login",
          exitCode: EXIT_CODE.INVALID_INPUT
        });
      }

      const config = await readConfig();
      const profileOption = options.profile ?? command.optsWithGlobals().profile;
      const profile = profileOption ? normalizeProfileName(profileOption) : undefined;
      const nextProfiles = { ...(config.profiles ?? {}) };

      if (profile) {
        nextProfiles[profile] = { serviceDomain: ctx.serviceDomain };
      }

      await writeConfig({
        ...config,
        serviceDomain: profile ? config.serviceDomain : ctx.serviceDomain,
        profiles: Object.keys(nextProfiles).length > 0 ? nextProfiles : config.profiles,
        defaultProfile: config.defaultProfile
      });

      const saveResult = profile
        ? await saveApiKeyForProfile(profile, ctx.apiKey)
        : await saveApiKey(ctx.serviceDomain, ctx.apiKey);
      const keychainAvailable = await canUseKeychain();

      printSuccess(ctx, {
        profile: profile ?? null,
        serviceDomain: ctx.serviceDomain,
        apiKeyStored: saveResult.stored,
        keychainAvailable,
        fallbackToEnv: !saveResult.stored,
        reason: saveResult.reason ?? null
      });
    });

  auth
    .command("status")
    .description("Show auth resolution status")
    .action(async (...actionArgs: unknown[]) => {
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const keychainAvailable = await canUseKeychain();

      printSuccess(ctx, {
        profile: ctx.profile ?? null,
        serviceDomain: ctx.serviceDomain ?? null,
        apiKeyAvailable: Boolean(ctx.apiKey),
        apiKeySource: ctx.apiKeySource,
        apiKeySourceDetail: ctx.apiKeySourceDetail,
        keychainAvailable
      });
    });

  const profile = auth.command("profile").description("Manage named auth profiles");

  profile
    .command("list")
    .description("List configured profiles")
    .action(async (...actionArgs: unknown[]) => {
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const config = await readConfig();
      const defaultProfile = config.defaultProfile ?? null;
      const profiles = Object.entries(config.profiles ?? {}).map(([name, value]) => ({
        name,
        serviceDomain: value.serviceDomain,
        isDefault: defaultProfile === name
      }));

      printSuccess(ctx, {
        defaultProfile,
        profiles
      });
    });

  profile
    .command("add")
    .argument("<name>", "profile name")
    .option("--service-domain <serviceDomain>", "microCMS service domain")
    .option("--set-default", "set this profile as default")
    .description("Add or update a profile")
    .action(async (...actionArgs: unknown[]) => {
      const name = actionArgs[0] as string;
      const options = actionArgs[1] as { serviceDomain?: string; setDefault?: boolean };
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const profileName = normalizeProfileName(name);
      const serviceDomain = normalizeServiceDomain(options.serviceDomain ?? command.optsWithGlobals().serviceDomain);

      const config = await readConfig();
      const profiles = { ...(config.profiles ?? {}) };
      profiles[profileName] = { serviceDomain };

      await writeConfig({
        ...config,
        profiles,
        defaultProfile: options.setDefault ? profileName : config.defaultProfile
      });

      printSuccess(ctx, {
        profile: profileName,
        serviceDomain,
        defaultProfile: options.setDefault ? profileName : config.defaultProfile ?? null
      });
    });

  profile
    .command("use")
    .argument("<name>", "profile name")
    .description("Set default profile")
    .action(async (...actionArgs: unknown[]) => {
      const name = actionArgs[0] as string;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const profileName = normalizeProfileName(name);
      const config = await readConfig();

      if (!config.profiles?.[profileName]) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: `Profile not found: ${profileName}`,
          exitCode: EXIT_CODE.INVALID_INPUT
        });
      }

      await writeConfig({
        ...config,
        defaultProfile: profileName
      });

      printSuccess(ctx, {
        defaultProfile: profileName
      });
    });

  profile
    .command("remove")
    .argument("<name>", "profile name")
    .description("Remove profile from config")
    .action(async (...actionArgs: unknown[]) => {
      const name = actionArgs[0] as string;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const profileName = normalizeProfileName(name);
      const config = await readConfig();
      const profiles = { ...(config.profiles ?? {}) };

      if (!profiles[profileName]) {
        throw new CliError({
          code: "INVALID_INPUT",
          message: `Profile not found: ${profileName}`,
          exitCode: EXIT_CODE.INVALID_INPUT
        });
      }

      delete profiles[profileName];

      await writeConfig({
        ...config,
        profiles: Object.keys(profiles).length > 0 ? profiles : undefined,
        defaultProfile: config.defaultProfile === profileName ? undefined : config.defaultProfile
      });

      printSuccess(ctx, {
        removed: profileName
      });
    });
}

function normalizeProfileName(value: string | undefined): string {
  const name = value?.trim();
  if (!name) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Profile name is required",
      exitCode: EXIT_CODE.INVALID_INPUT
    });
  }

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/.test(name)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Invalid profile name format. Use letters, numbers, dot, underscore, hyphen (1-64 chars).",
      exitCode: EXIT_CODE.INVALID_INPUT
    });
  }

  return name;
}

function normalizeServiceDomain(value: string | undefined): string {
  if (!value) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "service domain is required",
      exitCode: EXIT_CODE.INVALID_INPUT
    });
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message:
        "Invalid service domain format. Expected lowercase letters, numbers, hyphens, max 63 chars, no leading/trailing hyphen.",
      exitCode: EXIT_CODE.INVALID_INPUT
    });
  }

  return normalized;
}
