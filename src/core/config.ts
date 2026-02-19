import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError } from "./errors.js";
import { EXIT_CODE } from "./exit-codes.js";

export type ProfileConfig = {
  serviceDomain: string;
};

export type CliConfig = {
  serviceDomain?: string;
  defaultProfile?: string;
  profiles?: Record<string, ProfileConfig>;
};

export function getConfigPath(): string {
  const injectedRoot = process.env.MICROCMS_CLI_CONFIG_HOME;
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const configHome = injectedRoot ?? xdgConfigHome ?? join(homedir(), ".config");
  return join(configHome, "mcms-cli", "config.json");
}

export async function readConfig(): Promise<CliConfig> {
  const path = getConfigPath();
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNoEntryError(error)) {
      return {};
    }

    throw new CliError({
      code: "INVALID_INPUT",
      message: `Could not read config file: ${path}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: { path }
    });
  }

  let parsed: Partial<CliConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<CliConfig>;
  } catch {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Config file is invalid JSON: ${path}`,
      exitCode: EXIT_CODE.INVALID_INPUT,
      details: { path }
    });
  }

  const profiles =
    parsed.profiles && typeof parsed.profiles === "object"
      ? Object.fromEntries(
          Object.entries(parsed.profiles)
            .map(([name, value]) => {
              if (typeof value !== "object" || value === null) {
                return null;
              }

              const entry = value as { serviceDomain?: unknown };
              if (typeof entry.serviceDomain !== "string" || entry.serviceDomain.length === 0) {
                return null;
              }

              return [name, { serviceDomain: entry.serviceDomain }] as const;
            })
            .filter((entry): entry is readonly [string, ProfileConfig] => entry !== null)
        )
      : undefined;

  return {
    serviceDomain: typeof parsed.serviceDomain === "string" ? parsed.serviceDomain : undefined,
    defaultProfile: typeof parsed.defaultProfile === "string" ? parsed.defaultProfile : undefined,
    profiles: profiles && Object.keys(profiles).length > 0 ? profiles : undefined
  };
}

export async function writeConfig(config: CliConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });

  // Keep config as user-readable only on POSIX systems.
  if (process.platform !== "win32") {
    await chmod(path, 0o600);
  }
}

function isNoEntryError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}
