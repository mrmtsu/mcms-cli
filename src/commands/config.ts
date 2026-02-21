import { Command } from "commander";
import { canUseKeychain } from "../core/auth-store.js";
import { getConfigPath, readConfig } from "../core/config.js";
import { printSuccess } from "../core/output.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Inspect local CLI config");

  config
    .command("doctor")
    .description("Show resolved auth/config sources and common risks")
    .action(async (...actionArgs: unknown[]) => {
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const keychainAvailable = await canUseKeychain();
      const savedConfig = await readConfig();

      const warnings: string[] = [];
      const recommendations: string[] = [];

      if (!ctx.serviceDomain) {
        warnings.push("Service domain is not resolved.");
        recommendations.push(
          "Set --service-domain, MICROCMS_SERVICE_DOMAIN, or configure a profile.",
        );
      }

      if (!ctx.apiKey) {
        warnings.push("API key is not resolved.");
        recommendations.push("Use auth login, MICROCMS_API_KEY, --api-key-stdin, or --prompt.");
      }

      if (ctx.apiKeySourceDetail === "option") {
        warnings.push(
          "API key was passed via --api-key and may leak via shell history/process list.",
        );
        recommendations.push("Prefer --api-key-stdin or auth login --prompt.");
      }

      if (!keychainAvailable) {
        warnings.push(
          "OS keychain is unavailable (keytar optional dependency). Stored keys fallback may not work.",
        );
        recommendations.push("Install optional keytar dependency for secure local key storage.");
      }

      printSuccess(ctx, {
        resolved: {
          profile: {
            value: ctx.profile ?? null,
            source: ctx.profileSource,
          },
          serviceDomain: {
            value: ctx.serviceDomain ?? null,
            source: ctx.serviceDomainSource,
          },
          apiKey: {
            available: Boolean(ctx.apiKey),
            source: ctx.apiKeySource,
            sourceDetail: ctx.apiKeySourceDetail,
          },
        },
        keychain: {
          available: keychainAvailable,
        },
        config: {
          path: getConfigPath(),
          defaultProfile: savedConfig.defaultProfile ?? null,
          profileCount: Object.keys(savedConfig.profiles ?? {}).length,
          hasLegacyServiceDomain: Boolean(savedConfig.serviceDomain),
        },
        warnings,
        recommendations,
      });
    });
}
