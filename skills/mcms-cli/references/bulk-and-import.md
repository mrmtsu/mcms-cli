# Bulk and Import

## Bulk file contract

`content bulk` accepts this shape only:

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

## Bulk execution pattern

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

Treat `data.failed > 0` as failure and stop subsequent automation unless partial success is intentional.

Use `--continue-on-error` only for explicitly tolerant workflows.

## Import execution pattern

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

## Scenario: create 10 blog entries in bulk

```bash
microcms schema pull --out schema.json --json

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

microcms content list blogs --all --json
```
