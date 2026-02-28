# Setup and Auth

Use one of the following auth setups before content operations.

## Method 1: environment variables (recommended for CI/agents)

```bash
export MICROCMS_SERVICE_DOMAIN=<service-domain>
export MICROCMS_API_KEY=<api-key>
microcms auth status --json
microcms config doctor --json
```

## Method 2: profile-based auth (multiple services)

```bash
microcms auth profile add prod --service-domain <service-domain> --set-default
printf '%s' '<api-key>' | microcms auth login --profile prod --api-key-stdin
microcms auth status --json
microcms config doctor --json
```

## Auth resolution checks

1. Run `microcms auth status --json`.
2. Confirm `data.apiKeyAvailable` is `true`.
3. Confirm `data.serviceDomain` is the expected target.
4. If auth fails, run `microcms config doctor --json` and inspect `resolved` and `warnings`.

## Auth-related recovery

- Exit code `3`: fix credentials/profile/domain resolution first.
- Exit code `4`: API key exists but lacks endpoint permission.
- Never pass secrets with `--api-key` unless unavoidable. Prefer env vars or keychain/profile flow.
