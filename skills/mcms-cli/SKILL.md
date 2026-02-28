---
name: mcms-cli
description: Safely automate microCMS (Japanese headless CMS) operations in AI/CI workflows. Use when you need schema-first content CRUD, bulk/import with dry-run validation, status/created-by changes, and machine-readable branching via `microcms ... --json`.
---

# mcms-cli Skill

`mcms-cli` を使って microCMS を安全に自動操作するときは、必ず `--json` と `--dry-run` を前提に進める。

## Environment setup

```bash
# Method 1: env vars (recommended for CI/agents)
export MICROCMS_SERVICE_DOMAIN=<service-domain>
export MICROCMS_API_KEY=<api-key>

# Method 2: profile-based auth (multi-service usage)
microcms auth profile add prod --service-domain <service-domain> --set-default
printf '%s' '<api-key>' | microcms auth login --profile prod --api-key-stdin

# Verify resolution
microcms auth status --json
microcms config doctor --json
```

## Quick start

```bash
microcms auth status --json
microcms config doctor --json
microcms schema pull --out microcms-schema.json --json
microcms validate blogs --file payload.json --json
microcms content create blogs --file payload.json --dry-run --json
microcms content create blogs --file payload.json --json
```

## Non-negotiable rules

1. 機械判定に使うコマンドは常に `--json` を付ける。
2. 書き込み系操作は常に `--dry-run` を先に実行する。
3. `create` / `update` / `import` / `bulk` の前に `validate` か `--validate-payload` を実行する。
4. `bulk` / `import` では `--strict-warnings` を優先し、曖昧な payload を通さない。
5. `--json` の結果は `.ok` と終了コードの両方で判定する。

## Exit codes

| Code | Meaning | Agent action |
|------|---------|--------------|
| `0` | Success | 次のステップへ進む |
| `2` | Invalid input | payload / 引数を修正して再実行する |
| `3` | Auth error | 認証情報 (`auth status`, `config doctor`) を確認する |
| `4` | Permission error | API キー権限と対象 API の権限を確認する |
| `5` | Network/timeout | `--retry` を増やして再実行する |
| `6` | Conflict | 対象コンテンツ状態を `content get` で確認する |
| `1` | Unknown error | `--verbose` で詳細を取得して切り分ける |

## JSON branching template (`.ok` gate)

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

# example
run_mcms schema pull --out microcms-schema.json
run_mcms validate blogs --file payload.json
run_mcms content create blogs --file payload.json --dry-run
run_mcms content create blogs --file payload.json
```

## Standard workflow: schema pull -> validate -> create/bulk

1. 認証状態確認: `auth status`, `config doctor`
2. スキーマ取得: `schema pull`
3. 単体 payload 検証: `validate <endpoint> --file <payload>`
4. 書き込み dry-run
5. 本実行
6. 検証 (`content get`, `content list`, 必要なら `content meta get`)

### Single create/update/delete

```bash
microcms validate blogs --file payload.json --json
microcms content create blogs --file payload.json --dry-run --json
microcms content create blogs --file payload.json --json
microcms content get blogs <contentId> --json
```

```bash
microcms validate blogs --file payload.json --json
microcms content update blogs <contentId> --file payload.json --dry-run --json
microcms content update blogs <contentId> --file payload.json --json
```

```bash
microcms content delete blogs <contentId> --dry-run --json
microcms content delete blogs <contentId> --json
```

### Bulk operations

`content bulk` の入力は次の形だけを使う。

```json
{
  "operations": [
    { "action": "create", "endpoint": "blogs", "payload": { "title": "A" } },
    { "action": "update", "endpoint": "blogs", "id": "post-1", "payload": { "title": "B" } },
    { "action": "delete", "endpoint": "blogs", "id": "post-2" },
    { "action": "status", "endpoint": "blogs", "id": "post-3", "status": "PUBLISH" }
  ]
}
```

実行順序:

```bash
microcms content bulk \
  --file bulk.json \
  --validate-payload \
  --strict-warnings \
  --dry-run \
  --json

microcms content bulk \
  --file bulk.json \
  --validate-payload \
  --strict-warnings \
  --json
```

`data.failed > 0` なら失敗扱いにして後続処理を止める。部分成功を許すときだけ `--continue-on-error` を使う。

### Import workflow

```bash
microcms content import blogs \
  --file import.json \
  --dry-run \
  --strict-warnings \
  --json

microcms content import blogs \
  --file import.json \
  --upsert \
  --strict-warnings \
  --json
```

## Anti-patterns

- `--dry-run` なしで `content delete` / `content bulk` を実行しない。
- `--json` なしの出力を正規表現でパースしない。
- API キーを `--api-key` フラグで直接渡さない。
- `content import` で `--strict-warnings` なしに本番投入しない。
- `content export` のバックアップなしで破壊的操作をしない。

## Agent-browser integration pattern

UI と API を往復して確実に反映確認する。

1. `agent-browser` で管理画面を開き、対象 endpoint / contentId / status を確認する。
2. `mcms-cli` で `validate -> dry-run -> execute` を実行する。
3. `agent-browser` で管理画面を再読込し、反映結果を確認する。

```bash
# browser side (example)
agent-browser open https://<service>.microcms.io
agent-browser snapshot -i

# cli side
microcms content status set blogs <contentId> --status PUBLISH --dry-run --json
microcms content status set blogs <contentId> --status PUBLISH --json
```

## Useful command set

- Schema/type management:
  - `microcms schema pull --out microcms-schema.json --json`
  - `microcms schema diff --baseline microcms-schema.json --json`
  - `microcms types sync --out microcms-types.d.ts --json`
- Preflight checks:
  - `microcms auth status --json`
  - `microcms config doctor --json`
  - `microcms validate <endpoint> --file <payload.json> --json`
- Content operations:
  - `microcms content list <endpoint> --all --json`
  - `microcms content get <endpoint> <id> --json`
  - `microcms content create <endpoint> --file <payload> --dry-run --json`
  - `microcms content update <endpoint> <id> --file <payload> --dry-run --json`
  - `microcms content bulk --file <bulk.json> --dry-run --json`
- Backup/review operations:
  - `microcms content export <endpoint> --out backup/<endpoint>.json --json`
  - `microcms content export --all --out backup/ --json`
  - `microcms content diff <endpoint> <id> --draft-key <draftKey> --json`
- Documentation operations (no API key required):
  - `microcms docs list --source auto --json`
  - `microcms docs get --category content-api --file "コンテンツ一覧取得API.md" --json`
  - `microcms search "content list" --scope all --json`
  - `microcms spec --json`

## Scenario: create 10 blog entries in bulk

```bash
# 1) Pull schema and generate bulk payload based on constraints
microcms schema pull --out schema.json --json

# 2) Validate structure and payloads
microcms content bulk \
  --file bulk.json \
  --validate-payload \
  --strict-warnings \
  --dry-run \
  --json

# 3) Execute bulk write
microcms content bulk \
  --file bulk.json \
  --validate-payload \
  --strict-warnings \
  --json

# 4) Verify result count
microcms content list blogs --all --json
```

## Notes for this repository

- 詳細仕様は `docs/CLI_SPECIFICATION.md` を参照する。
- JSON 契約は `ok/data/meta`（成功）と `ok/error/meta`（失敗）を前提に扱う。
- `meta.requestId` は障害解析時の相関 ID として保持する。
