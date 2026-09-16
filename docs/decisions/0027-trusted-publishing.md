# ADR 0027 — Automated publishing via npm Trusted Publishers

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

Publishing was previously manual: a maintainer downloaded the release-validation
candidate tarball and ran `npm publish` locally, which required interactive
two-factor authentication (a WebAuthn passkey) on every release. That cannot run
unattended and blocks automation.

npm's **Trusted Publishers** feature lets a GitHub Actions workflow publish
without any long-lived token or 2FA prompt. GitHub proves the workflow's
identity with a short-lived OIDC token (`id-token: write`), and npm exchanges it
for a publish credential scoped to the configured repository + workflow. The
`@owlieio/owlie` package is public and the repository is public, so provenance
attestations are generated automatically.

## Decision

- Publish `@owlieio/owlie` through a dedicated `publish.yml` GitHub Actions
  workflow using npm Trusted Publishers (OIDC).
- Configure the trusted publisher on npm for `mihaiiova/owlie` + `publish.yml`.
- The workflow gates on `main` and an `expected_version` input that must match
  `apps/cli/package.json`, rebuilds from source, runs the offline artifact smoke
  test, then runs `npm publish --access public`.
- Release validation (`release-validate.yml`) remains a separate gate: it must
  pass for the version before the publish workflow is dispatched.
- No npm token or secret is stored; authentication is per-run OIDC.

## Consequences

- Releases no longer require a maintainer's interactive passkey per publish;
  the one-time setup is the trusted-publisher configuration on npmjs.com.
- The `--access public` flag (and `publishConfig.access`) remains required
  because the package is scoped.
- The published `package.json` must declare a `repository` field matching
  `https://github.com/mihaiiova/owlie.git` for trusted publishing to succeed.
