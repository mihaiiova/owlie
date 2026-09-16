# ADR 0026 — Scoped published package name: `@owlieio/owlie`

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

[ADR 0004](0004-single-published-package.md) decided to publish the single CLI
package under the unscoped name `owlie`, on the assumption that the name was
available and that no npm scope needed to be claimed. On the first publish, npm
rejected the unscoped name with `E403` ("Package name too similar to existing
packages rylie,oclif"). npm's name-similarity policy blocks unscoped names that
could be confused with existing packages, and the rejection cannot be appealed
quickly or with certainty.

The `@owlieio` npm organization scope is already owned by the maintainer
(`mihaiiova`), matching the internal `@owlieio/*` package naming already used
across the monorepo.

## Decision

- Publish the CLI under the scoped name `@owlieio/owlie`. The CLI command and
  its `bin` entry remain `owlie`, so `npm install -g @owlieio/owlie` installs
  the `owlie` command.
- Claim the `@owlieio` npm scope for the published CLI only; the other
  `@owlieio/*` packages remain private and unpublished.
- Publish as public: set `publishConfig.access: "public"` in the package
  manifest and pass `--access public` on the initial scoped publish (scoped
  packages are private by default).
- Derive the packed tarball filename from npm's scoped convention
  (`owlieio-owlie-<version>.tgz`) in release tooling, rather than assuming the
  unscoped name.

## Consequences

- The install command changes from `npm install -g owlie` to
  `npm install -g @owlieio/owlie`; the command name (`owlie`) is unchanged.
- The published package lives under the `@owlieio` scope, consistent with the
  internal package naming.
- Release tooling (pack verification and the release-validation workflow) must
  use the scoped tarball filename.
