import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CLI_ENTRY = resolve(process.cwd(), "src/cli.ts");

export type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type RunCliOptions = {
  stdin?: string;
  configRoot?: string;
};

export function runCli(args: string[], env: NodeJS.ProcessEnv = {}, options: RunCliOptions = {}): CliResult {
  const configRoot = options.configRoot ?? mkdtempSync(join(tmpdir(), "microcms-cli-test-"));

  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MICROCMS_CLI_CONFIG_HOME: configRoot,
      ...env
    },
    input: options.stdin,
    encoding: "utf8"
  });

  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
