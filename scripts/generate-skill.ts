import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderMcmsCliSkill } from "../src/core/agent-skill.js";

const OUTPUT_PATH = resolve(process.cwd(), "skills/mcms-cli/SKILL.md");
const CHECK_MODE = process.argv.includes("--check");

function readExistingFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const next = `${renderMcmsCliSkill()}\n`;
const current = readExistingFile(OUTPUT_PATH);

if (CHECK_MODE) {
  if (current !== next) {
    process.stderr.write(
      "skills/mcms-cli/SKILL.md is out of date. Run `npm run skill:generate`.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("skills/mcms-cli/SKILL.md is up to date.\n");
  }
} else {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, next, "utf8");
  process.stdout.write("Generated skills/mcms-cli/SKILL.md.\n");
}
