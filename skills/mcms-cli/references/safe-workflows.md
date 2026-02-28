# Safe Workflows

## Standard flow

1. Verify auth: `auth status`, `config doctor`
2. Pull schema: `schema pull`
3. Validate payload: `validate <endpoint> --file <payload>`
4. Execute dry-run for write commands
5. Execute real command
6. Verify state with `content get/list` (and `content meta get` if needed)

## Create/update/delete examples

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

## Backup and diff operations

```bash
microcms content export <endpoint> --out backup/<endpoint>.json --json
microcms content export --all --out backup/ --json
microcms content diff <endpoint> <id> --draft-key <draftKey> --json
```

## Anti-patterns

- Do not run `content delete` or `content bulk` without `--dry-run`.
- Do not parse non-JSON output with regex.
- Do not ship production writes without a backup from `content export`.
- Do not ignore exit code and rely only on `.ok`.
