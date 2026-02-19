# Security Policy

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately with:
- affected version/commit
- reproduction steps
- impact assessment
- suggested mitigation (if any)

Preferred channel:
- GitHub Security Advisories in this repository:
  - Open repository `Security` tab
  - Click `Report a vulnerability`

Fallback channel (if advisories are unavailable):
- Contact the maintainer through the email/contact method listed on the maintainer's GitHub profile.
- Do not include secrets in the initial report.

## Scope

Security-relevant areas include:
- API key handling (`--api-key`, `--api-key-stdin`, keychain integration)
- credential storage and config files
- request signing/auth headers
- shell completion install paths and file writes

## Best Practices for Users

- Prefer `--api-key-stdin` or `auth login --prompt` over plain `--api-key`.
- Avoid committing config files containing sensitive data.
- Rotate API keys if exposure is suspected.
