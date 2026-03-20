# mcms-cli

English | [日本語](./README.ja.md)

> Unofficial project. This CLI is not affiliated with, endorsed by, or maintained by microCMS.

AI/CI friendly CLI for microCMS with stable `--json` output and deterministic exit codes.

## Naming

- GitHub repository name: `mcms-cli`
- npm package name: `@mrmtsu/mcms-cli`
- command you run: `microcms`
- local storage identifier (config dir / keychain service): `mcms-cli`

`microcms` as the command name is intentional for readability.  
This project is unofficial, and that is explicitly stated in this README.

## Install

```bash
npm i -g @mrmtsu/mcms-cli
# or
npx @mrmtsu/mcms-cli --help
```

## Agent Skill

This repository includes a generated Agent Skill at `skills/mcms-cli/SKILL.md`.
The packaged skill follows the open Agent Skills format, is derived from repository sources, and is shipped with the npm package.

```bash
npx skills add mrmtsu/mcms-cli --skill mcms-cli
```

For contributors:

```bash
npm run skill:generate
npm run skill:check
```

## FAQ

### Is this the official microCMS CLI?

No. This is an unofficial community project and is not affiliated with microCMS.

### How do I install it quickly?

Use `npm i -g @mrmtsu/mcms-cli` and run `microcms --help`.

### Why are there different names (`mcms-cli`, `@mrmtsu/mcms-cli`, `microcms`)?

`mcms-cli` is the repository/storage identifier, `@mrmtsu/mcms-cli` is the npm package, and `microcms` is the command for readability.

## Auth

This MVP uses API keys (not OAuth).

```bash
# Recommended for CI/non-interactive:
export MICROCMS_SERVICE_DOMAIN=<service-domain>
export MICROCMS_API_KEY=<api-key>

# Optional: use a named profile
microcms auth profile add <profile-name> --service-domain <service-domain> --set-default
microcms auth profile list --json
# Note: profile add only saves the service domain. Save API key separately via login.
printf '%s' '<api-key>' | microcms auth login --profile <profile-name> --api-key-stdin

# Or store key in keychain:
printf '%s' '<api-key>' | microcms auth login --service-domain <service-domain> --api-key-stdin
# Interactive TTY prompt (hidden input):
microcms auth login --service-domain <service-domain> --prompt
microcms auth status --json
```

Resolution order for API key:
1. `--api-key` / `--api-key-stdin`
2. `MICROCMS_API_KEY`
3. OS keychain for selected profile (if available)
4. OS keychain entry for resolved service domain

Resolution order for service domain:
1. `--service-domain`
2. `MICROCMS_SERVICE_DOMAIN`
3. selected profile in config (`--profile`, `MICROCMS_PROFILE`, default profile)
4. config file value (`$XDG_CONFIG_HOME/mcms-cli/config.json`)

## Commands

### Core API operations

```bash
microcms api list --json
microcms api info <endpoint> --json
microcms api schema inspect <endpoint> --json
microcms api schema export <endpoint> --out <endpoint>-api-schema.json --json
microcms member get <memberId> --json

microcms content list <endpoint> --json
microcms content list <endpoint> --all --json
microcms content get <endpoint> <id> --json
microcms content pull <endpoint> --all --out managed-content --format managed-json --json
microcms content verify <endpoint> --dir managed-content --only-changed --json
microcms content push <endpoint> --dir managed-content --json
microcms content push <endpoint> --dir managed-content --execute --json
microcms content sync-status <endpoint> --dir managed-content --json
microcms content meta list <endpoint> --json
microcms content meta get <endpoint> <id> --json
microcms content status set <endpoint> <id> --status PUBLISH --json
microcms content created-by set <endpoint> <id> --member <memberId> --json
microcms content create <endpoint> --file payload.json --json
microcms content create <endpoint> --file payload.json --dry-run --json
microcms content update <endpoint> <id> --file payload.json --json
microcms content delete <endpoint> <id> --json
microcms content diff <endpoint> <id> --draft-key <draftKey> --json
microcms content export <endpoint> --out backup/notes.json --json
microcms content export <endpoint> --out backup/notes.csv --format csv --json
microcms content export --all --out backup/ --json
microcms content import <endpoint> --file backup/notes.json --json
microcms content import <endpoint> --file backup/notes.json --dry-run --json
microcms content import <endpoint> --file backup/notes.json --dry-run --strict-warnings --json
microcms content import <endpoint> --file backup/notes.json --upsert --interval 200 --json
microcms content bulk --file operations.json --json
microcms content bulk --file operations.json --dry-run --json
microcms content bulk --file operations.json --dry-run --validate-payload --json
microcms content bulk --file operations.json --dry-run --strict-warnings --json
microcms content bulk --file operations.json --stop-on-error --json
microcms content bulk --file operations.json --continue-on-error --json

microcms media list --json
microcms media list --limit 20 --image-only --file-name logo --json
microcms media list --token <token> --json
microcms media upload <path> --json
microcms media upload <path> --dry-run --json
microcms media delete --url <media-url> --json
microcms validate <endpoint> --file payload.json --json
```

- `content export --all` exports list APIs. Object APIs are skipped.
- `content pull` / `content verify` / `content push` / `content sync-status` are the managed-json first cut for file-based content workflows.
- managed-json v1 supports list APIs only. Object APIs, media sync, hooks/revalidate, and auto-merge are out of scope.
- `content push` is verify-first by default and only performs remote writes when `--execute` is set.
- delete is explicit-only in managed-json workflows. Removing a record file does not delete remote content; use `deletions/<id>.json` tombstones.
- `content bulk --dry-run` checks operation-file structure without API calls.
- Add `--validate-payload` (or `--strict-warnings`) when you want schema-based payload checks.
- Single select fields are accepted as either `"value"` or `["value"]` in CLI payloads. `managed-json` stores single select as a string, and write execution normalizes it to the array shape expected by the API.

### Docs and Agent references (no API key / service domain required)

```bash
microcms search "api schema" --scope all --json
microcms docs get --category management-api --file "APIスキーマ取得API（フィールド定義やカスタムフィールド）.md" --json
microcms docs list --source auto --json
microcms docs get --category content-api --file "コンテンツ一覧取得API.md" --json
microcms search "content list" --scope all --json
microcms spec --json
microcms task list --json
microcms task suggest "schema export" --json
microcms task guide api-schema-export --json
microcms task suggest "delete content" --json
microcms task guide content-delete --json
```

- Use `docs`, `search`, `task`, and `spec` as the official CLI surface for agent guidance. External MCP usage should not be necessary for normal discovery.
- `docs get`: fetch official microCMS documentation markdown content through the CLI surface.
- `search`: search command/spec references and docs metadata (titles/filenames), and return recommended follow-up commands.
- `task suggest` / `task guide`: task-oriented runbook helpers for agent/CI workflows.

### Schema / Type helpers

```bash
microcms schema pull --out microcms-schema.json --json
microcms schema pull --format api-export --endpoints blogs --out blogs-api-schema.json --json
microcms schema pull --format json-schema --out schema.json --json
microcms schema pull --format json-schema --include-extensions --out schema.json --json
microcms schema pull --format json-schema --endpoints blogs --out blogs-schema.json --json
microcms schema diff --baseline microcms-schema.json --json
microcms schema diff --baseline microcms-schema.json --exit-code --json
microcms types generate --schema microcms-schema.json --out microcms-types.d.ts --json
microcms types sync --out microcms-types.d.ts --json
microcms types sync --out microcms-types.d.ts --schema-out microcms-schema.json --json
```

`schema pull` is the canonical schema export entrypoint. Use `api schema export` as the discoverability alias when you want a single endpoint in API import-compatible shape.

`--format json-schema` uses [`@mrmtsu/microcms-schema-adapter`](https://github.com/mrmtsu/microcms-schema-adapter) to convert microCMS schemas to JSON Schema (draft-07).

If type generation is your primary goal, we recommend using [wato787/microcms-cli](https://github.com/wato787/microcms-cli).
It provides strong coverage for complex schemas, including relation resolution, discriminated unions for repeaters, and recursive custom field typing.

### Config and completion

```bash
microcms config doctor --json
microcms completion install zsh --json
microcms completion uninstall --json
npm run hooks:install
npm run preflight:pr
```

### Auth profile management

```bash
microcms auth profile list --json
microcms auth profile add <name> --service-domain <service> [--set-default] --json
microcms auth profile use <name> --json
microcms auth profile remove <name> --json
```

`validate` is schema-aware when API metadata is available (required/unknown/type/enum-like checks).

Global options:

- `--json`
- `--plain`
- `--table`
- `--select <fields>`
- `--profile <name>`
- `--service-domain <serviceDomain>`
- `--api-key <apiKey>` (less secure)
- `--api-key-stdin`
- `--timeout <ms>`
- `--retry <count>`
- `--retry-max-delay <ms>`
- `--verbose`
- `--no-color`

Completion scripts use dynamic endpoint suggestions via `microcms completion endpoints` (internal helper).
`--retry` is applied to retry-safe requests (GET) by default.

## JSON contract (v0)

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": null,
    "version": "0.x"
  }
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "...",
    "retryable": false
  },
  "meta": {
    "requestId": null,
    "version": "0.x"
  }
}
```

`error.details` is included when `--verbose` is enabled.
For payload validation failures (`validate`, `content import`/`content bulk` with payload checks),
`error.details` is always included to make CI diagnostics easier.

## Exit codes

- `0`: success
- `2`: invalid input
- `3`: auth error
- `4`: permission error
- `5`: network/timeout
- `6`: conflict
- `1`: unknown error

## Development

```bash
npm install
npm run skill:check
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

## Notes

- `api list/info` and `media list/upload` use microCMS Management API.
- Default management API base URL is `https://<serviceDomain>.microcms-management.io`.
- You can override with `MICROCMS_MANAGEMENT_API_BASE_URL`.
- Content API base URL is `https://<serviceDomain>.microcms.io`.
- You can override content API base URL with `MICROCMS_CONTENT_API_BASE_URL` (primarily for tests).
- For contract tests without network, use `MICROCMS_CONTENT_MOCK_FILE` to run content CRUD against a local JSON fixture store.
- `MICROCMS_*_BASE_URL` overrides only allow localhost or microcms domains.
- Documentation commands use bundled `microcms-document-mcp-server` by default (no extra user setup required).
- `docs`, `search`, and `spec` do not require `MICROCMS_API_KEY` / `MICROCMS_SERVICE_DOMAIN`.
- Treat `docs`, `search`, `task`, and `spec` as the only discovery surface you need from the CLI. They intentionally hide the underlying bundled docs runtime.
- `search` is for command/spec references and docs metadata (titles/filenames). Use `docs get` to read official documentation markdown content.
- You can override the MCP executable path with `MICROCMS_DOC_MCP_COMMAND` when needed.

## Disclaimer

- This is an unofficial community project and is not affiliated with microCMS.
- The software is provided "as is" under the MIT License, without warranty.
- Validate behavior in your environment and take backups before production use.
- You are responsible for API key management and all operations executed with this CLI.

## OSS Docs

- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
