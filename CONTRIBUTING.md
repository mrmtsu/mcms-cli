# Contributing

Thanks for contributing to `mcms-cli`.

## Development Setup

1. Install Node.js 20+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests and type checks:
   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   npm run build
   ```

## Branch / PR Flow

1. Create a branch from `main`.
2. Keep commits focused (one feature/fix per PR when possible).
3. Include tests for behavior changes.
4. Open a PR with:
   - motivation
   - behavior before/after
   - command examples (`--json` output if relevant)

## CLI Design Rules

- Keep `--json` output contract stable.
- Maintain deterministic exit codes.
- Prefer non-interactive workflows (`--api-key-stdin`, env vars, files).
- Do not log secrets (API key, token-like values).

## Testing Guidance

- Add/extend contract tests for envelope stability.
- Add e2e tests for command UX and option handling.
- Add unit tests for pure logic (validation, retry, parsing).

## Release Notes

Update `CHANGELOG.md` under `Unreleased` for user-facing changes.
