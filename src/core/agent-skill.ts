import { buildTaskGuide } from "./task-workflow.js";

const SKILL_DESCRIPTION =
  "Safely automate microCMS (Japanese headless CMS) operations in AI/CI workflows. Use when you need schema-first content CRUD, bulk/import with dry-run validation, status/created-by changes, and machine-readable branching via `microcms ... --json`.";

export const MCMS_CLI_SKILL_SOURCES = [
  "README.md",
  "docs/CLI_SPECIFICATION.md",
  "src/core/task-workflow.ts",
  "skills/mcms-cli/references/setup-and-auth.md",
  "skills/mcms-cli/references/safe-workflows.md",
  "skills/mcms-cli/references/bulk-and-import.md",
  "skills/mcms-cli/references/docs-and-search.md",
] as const;

const QUICK_START_COMMANDS = [
  "microcms auth status --json",
  "microcms config doctor --json",
  "microcms schema pull --out microcms-schema.json --json                    # microCMS proprietary format",
  "microcms schema pull --format json-schema --out schema.json --json        # JSON Schema (draft-07)",
  "microcms schema pull --format json-schema --include-extensions --out schema.json --json",
  "microcms validate blogs --file payload.json --json",
  "microcms content create blogs --file payload.json --dry-run --json",
  "microcms content create blogs --file payload.json --json",
] as const;

const EXIT_CODES = [
  { code: "0", meaning: "Success", action: "Proceed to the next step" },
  { code: "2", meaning: "Invalid input", action: "Fix payload/options and retry" },
  { code: "3", meaning: "Auth error", action: "Re-check auth resolution" },
  {
    code: "4",
    meaning: "Permission error",
    action: "Verify API key scope and endpoint permissions",
  },
  {
    code: "5",
    meaning: "Network/timeout",
    action: "Retry with adjusted timeout/retry options",
  },
  { code: "6", meaning: "Conflict", action: "Re-read content state, then retry" },
  { code: "1", meaning: "Unknown error", action: "Re-run with --verbose and inspect details" },
] as const;

const WORKFLOW_TASK_IDS = [
  "content-create",
  "content-update",
  "content-delete",
  "content-import",
  "content-bulk",
  "content-status-set",
] as const;

export function renderMcmsCliSkill(): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push("name: mcms-cli");
  lines.push(`description: ${SKILL_DESCRIPTION}`);
  lines.push("metadata:");
  lines.push("  generatedBy: scripts/generate-skill.ts");
  lines.push("  sources:");
  for (const source of MCMS_CLI_SKILL_SOURCES) {
    lines.push(`    - ${source}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(
    "<!-- Generated file. Edit the referenced sources and re-run `npm run skill:generate`. -->",
  );
  lines.push("");
  lines.push("# mcms-cli Skill");
  lines.push("");
  lines.push("Always run microCMS write operations with `--json` and `--dry-run` first.");
  lines.push("");
  lines.push("## Quick start");
  lines.push("");
  lines.push("```bash");
  lines.push(...QUICK_START_COMMANDS);
  lines.push("```");
  lines.push("");
  lines.push("## Non-negotiable rules");
  lines.push("");
  lines.push("1. Always add `--json` for machine decisions.");
  lines.push("2. Always run write commands with `--dry-run` before real execution.");
  lines.push("3. Always run `validate` or `--validate-payload` before create/update/import/bulk.");
  lines.push("4. Prefer `--strict-warnings` for `content import` and `content bulk`.");
  lines.push("5. Decide success by both `.ok` and process exit code.");
  lines.push("6. Keep `meta.requestId` in logs for incident analysis.");
  lines.push("");
  lines.push("## Exit code policy");
  lines.push("");
  lines.push("| Code | Meaning | Agent action |");
  lines.push("|------|---------|--------------|");
  for (const row of EXIT_CODES) {
    lines.push(`| \`${row.code}\` | ${row.meaning} | ${row.action} |`);
  }
  lines.push("");
  lines.push("## JSON gate template");
  lines.push("");
  lines.push("```bash");
  lines.push("run_mcms() {");
  lines.push("  local out");
  lines.push('  out=$(microcms "$@" --json 2>&1) || {');
  lines.push("    printf '%s\\n' \"$out\" >&2");
  lines.push("    return 1");
  lines.push("  }");
  lines.push("  printf '%s\\n' \"$out\" | jq -e '.ok == true' >/dev/null || {");
  lines.push("    printf '%s\\n' \"$out\" | jq .");
  lines.push("    return 1");
  lines.push("  }");
  lines.push("  printf '%s\\n' \"$out\"");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("## Read references on demand");
  lines.push("");
  lines.push("- Setup and auth: [references/setup-and-auth.md](references/setup-and-auth.md)");
  lines.push(
    "- Safe CRUD workflow and anti-patterns: [references/safe-workflows.md](references/safe-workflows.md)",
  );
  lines.push(
    "- Bulk/import contracts and recovery: [references/bulk-and-import.md](references/bulk-and-import.md)",
  );
  lines.push(
    "- Docs/search/spec and agent-browser loop: [references/docs-and-search.md](references/docs-and-search.md)",
  );
  lines.push("");
  lines.push("## Built-in safe task workflows");
  lines.push("");
  lines.push("These sections are derived from the built-in `microcms task guide` data.");
  lines.push("");

  for (const taskId of WORKFLOW_TASK_IDS) {
    const guide = buildTaskGuide(taskId);
    if (!guide) {
      throw new Error(`Unknown task guide: ${taskId}`);
    }

    lines.push(`### \`${guide.id}\` - ${guide.title}`);
    lines.push("");
    lines.push(guide.summary);
    lines.push("");
    lines.push(`Risk: \`${guide.riskLevel}\``);
    lines.push(`Requires confirmation: \`${guide.requiresConfirmation ? "yes" : "no"}\``);
    lines.push("");

    for (const step of guide.steps) {
      lines.push(`${step.index}. \`${step.command}\``);
      lines.push(
        `   Risk: \`${step.riskLevel}\`, confirmation: \`${step.requiresConfirmation ? "yes" : "no"}\``,
      );
      if (step.confirmationReason) {
        lines.push(`   Reason: ${step.confirmationReason}`);
      }
      if (step.note) {
        lines.push(`   Note: ${step.note}`);
      }
    }

    lines.push("");
  }

  lines.push("## Notes for this repository");
  lines.push("");
  lines.push(
    "- Use `docs/CLI_SPECIFICATION.md` as the primary source of truth for command behavior.",
  );
  lines.push(
    "- Assume the JSON envelope contract: `ok/data/meta` for success, `ok/error/meta` for failure.",
  );
  lines.push(
    "- The packaged skill is derived from repository sources and should be regenerated, not hand-edited.",
  );
  lines.push("");

  return lines.join("\n");
}
