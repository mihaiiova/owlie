# Security Policy

## Supported versions

Owlie CLI is pre-1.0 and under active scaffolding. Only the latest `main`
branch receives security fixes. Consumers should pin exact versions until a
stable release.

## Reporting a vulnerability

Do **not** open a public issue for a security vulnerability. Report it
privately to the repository maintainers. Include:

- a description of the vulnerability and its impact;
- steps to reproduce, with any secrets or personal data redacted;
- the affected version or commit.

Please allow a reasonable window for a fix and coordinated disclosure before
publishing details.

## Security model

Owlie CLI handles untrusted remote content (feeds, media, transcripts). See
[docs/security-model.md](docs/security-model.md) for the full set of
protections the product will enforce, including SSRF protection, request and
download limits, safe XML parsing, subprocess invocation without shell
interpolation, secret redaction, and more.

## What not to report

- Missing features (use the issue tracker instead).
- Issues in dependencies that are not reachable from Owlie CLI.
- Vulnerabilities in the private `owlie-app`.
