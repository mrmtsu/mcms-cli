---
name: mcms-cli
description: Safely automate microCMS (Japanese headless CMS) operations in AI/CI workflows. Use when you need schema-first content CRUD, bulk/import with dry-run validation, status/created-by changes, and machine-readable branching via `microcms ... --json`.
---

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
| `1` | Unknown error | Re-run with `--verbose` and inspect details |

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

## Notes for this repository

- Use `docs/CLI_SPECIFICATION.md` as the primary source of truth for command behavior.
- Assume the JSON envelope contract: `ok/data/meta` for success, `ok/error/meta` for failure.
