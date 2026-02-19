# mcms-cli

English | [日本語](./README.ja.md)

> Unofficial project. This CLI is not affiliated with, endorsed by, or maintained by microCMS.

AI/CI friendly CLI for microCMS with stable `--json` output and deterministic exit codes.

## Naming

- GitHub repository name: `mcms-cli`
- npm package name: `@yusuke/mcms-cli`
- command you run: `microcms`
- local storage identifier (config dir / keychain service): `mcms-cli`

`microcms` as the command name is intentional for readability.  
This project is unofficial, and that is explicitly stated in this README.

## Install

```bash
npm i -g @yusuke/mcms-cli
# or
npx @yusuke/mcms-cli --help
```

## Auth

This MVP uses API keys (not OAuth).

```bash
# Recommended for CI/non-interactive:
export MICROCMS_SERVICE_DOMAIN=<service>
export MICROCMS_API_KEY=<key>

# Optional: use a named profile
microcms auth profile add work --service-domain <service> --set-default
microcms auth profile list --json

# Or store key in keychain:
printf '%s' '<key>' | microcms auth login --service-domain <service> --api-key-stdin
# Interactive TTY prompt (hidden input):
microcms auth login --service-domain <service> --prompt
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

```bash
microcms api list --json
microcms api info <endpoint> --json

microcms content list <endpoint> --json
microcms content list <endpoint> --all --json
microcms content get <endpoint> <id> --json
microcms content create <endpoint> --file payload.json --json
microcms content create <endpoint> --file payload.json --dry-run --json
microcms content update <endpoint> <id> --file payload.json --json
microcms content delete <endpoint> <id> --json

microcms media upload <path> --json
microcms media upload <path> --dry-run --json
microcms validate <endpoint> --file payload.json --json

microcms schema pull --out microcms-schema.json --json
microcms types generate --schema microcms-schema.json --out microcms-types.d.ts --json

microcms config doctor --json
microcms completion install zsh --json
microcms completion uninstall --json

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

`error.details` is included only when `--verbose` is enabled.

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
npm run test
npm run build
```

## Notes

- `api list/info` and `media upload` use microCMS Management API.
- Default management API base URL is `https://<serviceDomain>.microcms-management.io`.
- You can override with `MICROCMS_MANAGEMENT_API_BASE_URL`.
- Content API base URL is `https://<serviceDomain>.microcms.io`.
- You can override content API base URL with `MICROCMS_CONTENT_API_BASE_URL` (primarily for tests).
- For contract tests without network, use `MICROCMS_CONTENT_MOCK_FILE` to run content CRUD against a local JSON fixture store.
- `MICROCMS_*_BASE_URL` overrides only allow localhost or microcms domains.

## Disclaimer

- This is an unofficial community project and is not affiliated with microCMS.
- The software is provided "as is" under the MIT License, without warranty.
- Validate behavior in your environment and take backups before production use.
- You are responsible for API key management and all operations executed with this CLI.

## OSS Docs

- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
# mcms-cli
