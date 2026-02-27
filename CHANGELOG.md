# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-02-27

### Added
- `src/core/api-field-utils.ts` to centralize API field extraction, kind normalization, and allowed-value parsing shared by schema/type generation and payload validation.
- New safety checks for `content list --all`: inconsistent `totalCount` detection, merged item safety limit (default `100000`, configurable via `MICROCMS_CONTENT_ALL_MAX_ITEMS`), and max page cap errors.
- New tests for Content API HTTP path unification, `--all` safety behavior, runtime env switching for mock file resolution, and verbose/non-verbose retry logging behavior.

### Changed
- Unified Content API operations (`list/get/create/update/delete`) onto the internal HTTP layer (`requestJson`) and removed the `microcms-js-sdk` runtime path.
- Refactored command action handlers to typed signatures using shared command-context wiring, removing `actionArgs[...] as ...` patterns across command modules.
- Moved environment override values (`MICROCMS_*_BASE_URL`, `MICROCMS_CONTENT_MOCK_FILE`) into `RuntimeContext`-backed runtime resolution to improve testability and consistency.
- Simplified prompt API key input by using keypress event handling from Node's readline support while preserving no-echo TTY behavior.
- Added README guidance recommending `wato787/microcms-cli` when type generation is the primary goal.

### Fixed
- Standardized delete response shaping for content operations so JSON envelope compatibility is preserved while request-id propagation remains available.
- Improved verbose diagnostics for intentionally swallowed errors (version resolution fallback, keychain access failures, mock store read fallback).

## [0.3.0] - 2026-02-23

### Added
- `content meta list` / `content meta get` commands for management metadata retrieval.
- `content status set` command for management status transitions (`PUBLISH` / `DRAFT`).
- `media delete` command for deleting media assets by URL via Management API v2.
- `member get` command for retrieving member details via Management API.
- `content created-by set` command for changing content creator via Management API.

### Changed
- Updated shell completion scripts to include new `content`, `media`, and `member` subcommands.
- Expanded command specs and README command examples (English/Japanese) for the new management operations.

### Tests
- Added new unit tests for `content meta`, `content status`, `content created-by`, `media delete`, and `member get` client calls.
- Expanded e2e/contract/spec tests to cover new command exposure, dry-run behavior, and input validation.

## [0.2.3] - 2026-02-23

### Changed
- Improved package discoverability metadata in `package.json` (description, keywords, homepage/repository/bugs).
- Refined README/README.ja headings and intro blocks for clearer project naming and onboarding.
- Added FAQ sections in both READMEs with direct answers for official/unofficial status, install path, and naming differences.

## [0.2.2] - 2026-02-21

### Added
- `media list` command for listing media assets via the Management API.

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
