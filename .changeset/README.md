# Changesets

Owlie CLI uses [Changesets](https://github.com/changesets/changesets) to version
and changelog the single published `owlie` package.

- Run `pnpm changeset` to record a change. Only `owlie` is tracked; the internal
  `@owlieio/*` packages are ignored.
- Run `pnpm version` to consume changesets and bump the version (semver).
- `owlie` is below `1.0`; consumers should pin exact versions until `1.0`.

Publishing is **not** automated. npm versions are immutable and must never be
overwritten. A release requires explicit repository-owner approval.
