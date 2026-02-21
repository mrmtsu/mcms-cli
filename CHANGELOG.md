# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-02-21

### Changed
- Added `oxlint` / `oxfmt` based `lint` and `format:check` workflows for development and CI.
- CI now runs `lint` and `format:check` before `typecheck`, `test`, and `build`.

### Fixed
- Enforced LF normalization via `.gitattributes` to avoid cross-platform formatting check failures.

## [0.2.1] - 2026-02-20

### Fixed
- Fixed docs MCP command override on Windows by running JavaScript MCP commands via `node`.

## [0.2.0] - 2026-02-20

### Added
- `docs list` command for official documentation metadata lookup.
- `docs get` command for official documentation markdown retrieval (MCP source).
- `search` command to query CLI spec/docs references in one place.
- `spec` command for machine-readable CLI capability output.
- Documentation commands now support source selection via `--source auto|mcp|local` with automatic fallback warnings.
- Bundled `microcms-document-mcp-server` so docs/search work without separate setup.
- `docs` / `search` / `spec` can run without API key/service domain configuration.

### Fixed
- Improved MCP transport compatibility for docs/search/spec on servers using newline-delimited JSON messages.

## [0.1.0] - 2026-02-19

### Added
- Initial release of unofficial `mcms-cli` for microCMS.
- Stable `--json` output contract and deterministic exit codes.
- Profile-based auth resolution (`auth profile list|add|use|remove`, global `--profile`).
- Secure auth input options (`--api-key-stdin`, `auth login --prompt`) and keychain storage support.
- `content list --all` pagination merge mode.
- `--dry-run` for write operations.
- Retry/backoff controls (`--retry`, `--retry-max-delay`) with `Retry-After` support.
- Human output modes (`--plain`, `--table`, `--select`).
- Shell completion installer/uninstaller (`completion install|uninstall`) with dynamic endpoint candidates.
- `config doctor` troubleshooting command.
- Schema pull and type generation commands (`schema pull`, `types generate`).
- Stronger schema-aware payload validation.
- OSS community and security docs (`CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates).

### Fixed
- Ensured `--json` error envelopes and exit codes stay stable on invalid env/config input paths.
- `auth login --profile` no longer changes `defaultProfile` implicitly.
- Invalid local config JSON now fails fast instead of being overwritten silently.
- Documentation/install examples aligned with package name (`@mrmtsu/mcms-cli`) and command naming.
