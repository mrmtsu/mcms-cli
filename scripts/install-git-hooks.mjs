import { chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const hooksPath = resolve(repoRoot, ".githooks");
const prePushHook = resolve(hooksPath, "pre-push");

if (!existsSync(prePushHook)) {
  process.stderr.write(`pre-push hook was not found: ${prePushHook}\n`);
  process.exit(1);
}

chmodSync(prePushHook, 0o755);

execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: repoRoot,
  stdio: "inherit",
});

process.stdout.write("Installed local git hooks via core.hooksPath=.githooks\n");
