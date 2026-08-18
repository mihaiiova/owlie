# Changesets

Owlie CLI uses [Changesets](https://github.com/changesets/changesets) for
versioning and changelogs.

- Run `pnpm changeset` to record a change for one or more packages.
- Run `pnpm version` to consume changesets and bump versions (semver).
- Packages are below `1.0` and marked `private` until the `@owlieio` npm scope
  is owned. Consumers should pin exact versions until then.

Publishing is **not** automated. npm versions are immutable and must never be
overwritten. A release requires explicit repository-owner approval.
