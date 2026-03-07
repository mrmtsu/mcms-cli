---
name: mcms-cli
description: Safely automate microCMS (Japanese headless CMS) operations in AI/CI workflows. Use when you need schema-first content CRUD, bulk/import with dry-run validation, status/created-by changes, and machine-readable branching via `microcms ... --json`.
metadata:
  generatedBy: scripts/generate-skill.ts
  sources:
    - README.md
    - docs/CLI_SPECIFICATION.md
    - src/core/task-workflow.ts
    - skills/mcms-cli/references/setup-and-auth.md
    - skills/mcms-cli/references/safe-workflows.md
    - skills/mcms-cli/references/bulk-and-import.md
    - skills/mcms-cli/references/docs-and-search.md
---

<!-- Generated file. Edit the referenced sources and re-run `npm run skill:generate`. -->

# mcms-cli Skill

Always run microCMS write operations with `--json` and `--dry-run` first.

## Quick start

```bash
microcms auth status --json
microcms config doctor --json
microcms schema pull --out microcms-schema.json --json                    # microCMS proprietary format
microcms schema pull --format json-schema --out schema.json --json        # JSON Schema (draft-07)
microcms schema pull --format json-schema --include-extensions --out schema.json --json
microcms validate blogs --file payload.json --json
microcms content create blogs --file payload.json --dry-run --json
microcms content create blogs --file payload.json --json
```

## Non-negotiable rules

1. Always add `--json` for machine decisions.
2. Always run write commands with `--dry-run` before real execution.
3. Always run `validate` or `--validate-payload` before create/update/import/bulk.
4. Prefer `--strict-warnings` for `content import` and `content bulk`.
5. Decide success by both `.ok` and process exit code.
6. Keep `meta.requestId` in logs for incident analysis.

## Exit code policy

| Code | Meaning | Agent action |
|------|---------|--------------|
| `0` | Success | Proceed to the next step |
| `2` | Invalid input | Fix payload/options and retry |
| `3` | Auth error | Re-check auth resolution |
| `4` | Permission error | Verify API key scope and endpoint permissions |
| `5` | Network/timeout | Retry with adjusted timeout/retry options |
| `6` | Conflict | Re-read content state, then retry |
| `1` | Unknown error | Re-run with --verbose and inspect details |

## JSON gate template

```bash
run_mcms() {
  local out
  out=$(microcms "$@" --json 2>&1) || {
    printf '%s\n' "$out" >&2
    return 1
  }
  printf '%s\n' "$out" | jq -e '.ok == true' >/dev/null || {
    printf '%s\n' "$out" | jq .
    return 1
  }
  printf '%s\n' "$out"
}
```

## Read references on demand

- Setup and auth: [references/setup-and-auth.md](references/setup-and-auth.md)
- Safe CRUD workflow and anti-patterns: [references/safe-workflows.md](references/safe-workflows.md)
- Bulk/import contracts and recovery: [references/bulk-and-import.md](references/bulk-and-import.md)
- Docs/search/spec and agent-browser loop: [references/docs-and-search.md](references/docs-and-search.md)

## Built-in safe task workflows

These sections are derived from the built-in `microcms task guide` data.

### `content-create` - Create Content Safely

Validate payload and create a new content item with dry-run first.

Risk: `low`
Requires confirmation: `no`

1. `microcms validate <endpoint> --file <payload.json> --json`
   Risk: `low`, confirmation: `no`
2. `microcms content create <endpoint> --file <payload.json> --dry-run --json`
   Risk: `low`, confirmation: `no`
3. `microcms content create <endpoint> --file <payload.json> --json`
   Risk: `low`, confirmation: `no`

### `content-update` - Update Content Safely

Validate and update an existing item while preserving dry-run safety checks.

Risk: `medium`
Requires confirmation: `no`

1. `microcms validate <endpoint> --file <payload.json> --json`
   Risk: `low`, confirmation: `no`
2. `microcms content update <endpoint> <id> --file <payload.json> --dry-run --json`
   Risk: `medium`, confirmation: `no`
3. `microcms content update <endpoint> <id> --file <payload.json> --json`
   Risk: `medium`, confirmation: `no`

### `content-delete` - Delete Content with Guardrails

Precheck target content, then dry-run and confirm before delete.

Risk: `high`
Requires confirmation: `yes`

1. `microcms content get <endpoint> <id> --json`
   Risk: `low`, confirmation: `no`
2. `microcms content delete <endpoint> <id> --dry-run --json`
   Risk: `high`, confirmation: `yes`
   Reason: Deletes content and recovery depends on backups or export data.
3. `microcms content delete <endpoint> <id> --json`
   Risk: `high`, confirmation: `yes`
   Reason: Deletes content and recovery depends on backups or export data.

### `content-import` - Bulk Import Content

Run strict dry-run validation before importing multiple records.

Risk: `high`
Requires confirmation: `yes`

1. `microcms content export <endpoint> --out backup/<endpoint>.json --json`
   Risk: `low`, confirmation: `no`
2. `microcms content import <endpoint> --file <contents.json> --dry-run --strict-warnings --json`
   Risk: `high`, confirmation: `yes`
   Reason: Writes many records and may overwrite existing content when --upsert is used.
3. `microcms content import <endpoint> --file <contents.json> --json`
   Risk: `high`, confirmation: `yes`
   Reason: Writes many records and may overwrite existing content when --upsert is used.
   Note: Add --upsert only when update-by-id behavior is required.

### `content-bulk` - Execute Bulk Operations

Validate operation file and execute create/update/delete/status actions safely.

Risk: `high`
Requires confirmation: `yes`

1. `microcms content bulk --file <operations.json> --dry-run --validate-payload --strict-warnings --json`
   Risk: `high`, confirmation: `yes`
   Reason: Runs multiple write operations and may leave partial state when failures occur.
2. `microcms content bulk --file <operations.json> --stop-on-error --json`
   Risk: `high`, confirmation: `yes`
   Reason: Runs multiple write operations and may leave partial state when failures occur.

### `content-status-set` - Change Content Status

Review metadata and change published/draft status with confirmation.

Risk: `medium`
Requires confirmation: `yes`

1. `microcms content meta get <endpoint> <id> --json`
   Risk: `low`, confirmation: `no`
2. `microcms content status set <endpoint> <id> --status <PUBLISH|DRAFT> --dry-run --json`
   Risk: `medium`, confirmation: `yes`
   Reason: Changes published/draft state and can affect public visibility immediately.
3. `microcms content status set <endpoint> <id> --status <PUBLISH|DRAFT> --json`
   Risk: `medium`, confirmation: `yes`
   Reason: Changes published/draft state and can affect public visibility immediately.

## Notes for this repository

- Use `docs/CLI_SPECIFICATION.md` as the primary source of truth for command behavior.
- Assume the JSON envelope contract: `ok/data/meta` for success, `ok/error/meta` for failure.
- The packaged skill is derived from repository sources and should be regenerated, not hand-edited.

