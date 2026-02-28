# Docs, Search, and UI Verification

Use docs/search/spec commands to inspect capability before executing risky writes.

## Documentation and command discovery (no API key required)

```bash
microcms docs list --source auto --json
microcms docs get --category content-api --file "コンテンツ一覧取得API.md" --json
microcms search "content list" --scope all --json
microcms spec --json
```

## Recommended preflight command set

```bash
microcms auth status --json
microcms config doctor --json
microcms schema pull --out microcms-schema.json --json
microcms validate <endpoint> --file payload.json --json
```

## Agent-browser integration loop

1. Open admin UI and confirm target endpoint/content/status.
2. Execute CLI flow: validate -> dry-run -> execute.
3. Reload UI and confirm visible state changed as expected.

```bash
agent-browser open https://<service>.microcms.io
agent-browser snapshot -i

microcms content status set blogs <contentId> --status PUBLISH --dry-run --json
microcms content status set blogs <contentId> --status PUBLISH --json
```
