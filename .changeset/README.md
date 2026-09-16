# Changesets

Owlie CLI uses [Changesets](https://github.com/changesets/changesets) to version
and changelog the single published `@owlieio/owlie` package.

- Run `pnpm changeset` to record a change. Only `@owlieio/owlie` is tracked; the
  other internal `@owlieio/*` packages are ignored.
- Run `pnpm version` to consume changesets and bump the version (semver).
- `@owlieio/owlie` is below `1.0`; consumers should pin exact versions until `1.0`.

Publishing is automated via npm Trusted Publishers (OIDC) — see
[ADR 0027](docs/decisions/0027-trusted-publishing.md). The `publish.yml`
workflow publishes `@owlieio/owlie` with a short-lived OIDC credential; no npm
token or 2FA is involved. npm versions are immutable and must never be
overwritten, so a release still requires dispatching the publish workflow after
release validation passes.
