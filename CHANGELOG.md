# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No user-facing changes yet.

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
