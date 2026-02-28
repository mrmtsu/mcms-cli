---
name: mcms-cli
description: Safely automate microCMS operations with mcms-cli in AI/CI workflows. Use when you need schema-first content operations, payload validation, create/update/delete, bulk/import execution, status/created-by changes, or machine-readable branching via `microcms ... --json`.
---

# mcms-cli Skill

`mcms-cli` を使って microCMS を安全に自動操作するときは、必ず `--json` と `--dry-run` を前提に進める。

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

## Notes for this repository

- 詳細仕様は `docs/CLI_SPECIFICATION.md` を参照する。
- JSON 契約は `ok/data/meta`（成功）と `ok/error/meta`（失敗）を前提に扱う。
- `meta.requestId` は障害解析時の相関 ID として保持する。
