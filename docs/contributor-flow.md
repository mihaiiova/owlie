# Contributor flow

**Status:** Implemented. This document describes the end-to-end process for
contributors and maintainers, from finding an issue to shipping a release. The
automations it references (secret scanning, Dependabot, coverage, stale, PR
title lint, and the changeset check) are live in CI.

## Purpose

This document defines the end-to-end path for external contributors and
maintainers of Owlie CLI: from finding an issue to shipping a release. It is the
human-facing counterpart to [`CONTRIBUTING.md`](../CONTRIBUTING.md) (practical
setup) and the root [`AGENTS.md`](../AGENTS.md) (which is written for coding
agents, not people).

## The golden path

```text
issue ──► branch ──► implement (test-first) ──► pnpm check ──► pnpm changeset
                                                   │
                                                   ▼
   release ◄── version bump ◄── merge ◄── review ◄── pull request
```

1. Find or file an issue.
2. Branch from `main` with a conventional name.
3. Implement test-first in the correct package.
4. Run `pnpm check` locally until green.
5. Record user-facing changes with `pnpm changeset`.
6. Open a pull request (template + CI).
7. Get review, then merge to `main`.
8. Maintainers bump the version and publish (`owlie` only).

---

## 1. Find or file an issue

- Bug reports use `.github/ISSUE_TEMPLATE/bug-report.yml` (title prefix `bug:`,
  label `bug`).
- Feature requests use `.github/ISSUE_TEMPLATE/feature-request.yml` (title
  prefix `feat:`, label `enhancement`).
- Both templates steer contributors away from hosted `owlie-app` concepts
  (auth, billing, scheduling, databases, cloud).
- The `good first issue` and `help wanted` labels mark small, well-scoped tasks
  so new contributors have a clear on-ramp.

---

## 2. Branch and implement

### Branch naming

```text
<type>/<short-slug>
```

Examples: `feat/rss-listing`, `fix/article-main-wrapper`,
`docs/contributor-flow`.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/). The history
already follows this informally; this document makes it the rule.

```text
<type>[optional-scope]: <summary>

[optional body]
```

Types used in this repository: `feat`, `fix`, `docs`, `test`, `chore`,
`refactor`, `perf`, `ci`, `build`, `revert`. Scope is optional and usually names
the affected package (e.g. `fix(adapter-article): ...`).

Pull request titles should match the same convention; the PR title becomes the
merge/squash commit subject.

### Placement and rules

- Put logic in the correct package (see the dependency rules in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md)); adapters and providers depend only
  on `@owlieio/core`.
- Prefer existing contracts (`CollectionAdapter`, `ItemAdapter`,
  `ContentProcessor`, `Transcriber`, orchestration helpers) over new parallel
  pipelines.
- Extension points are documented in
  [`docs/adding-an-adapter.md`](adding-an-adapter.md) and
  [`docs/adding-a-provider.md`](adding-a-provider.md).

---

## 3. Local checks

Run from the repository root (Node 20+, pnpm pinned via `packageManager`):

| Command                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `pnpm install`         | Install dependencies (frozen lockfile in CI)       |
| `pnpm check`           | Every gate required before merge                   |
| `pnpm build`           | Build all packages to `dist/`                      |
| `pnpm typecheck`       | Typecheck every package                            |
| `pnpm lint`            | ESLint over the repository                         |
| `pnpm test`            | Full Vitest suite                                  |
| `pnpm test:coverage`   | Test suite with coverage report                    |
| `pnpm format`          | Format with Prettier                               |
| `pnpm verify:artifact` | Pack, install, and smoke-run the published tarball |
| `pnpm test:live`       | Opt-in live tests (`OWLIE_LIVE_TESTS=1`)           |
| `pnpm cli --help`      | Run the built CLI                                  |

`pnpm check` runs: format check, lint, typecheck, tests, dependency-boundary
check, build, package export validation, and CLI smoke tests.

Testing expectations (enforced by review and CI):

- The default suite makes **no network calls** and requires **no credentials**.
- Add unit tests for pure logic and contract tests for adapters/providers.
- Fixtures must be sanitized; never commit credentials, tokens, or user data.
- Live tests are opt-in and excluded from CI.

---

## 4. Record the change (changesets)

Owlie CLI uses [Changesets](https://github.com/changesets/changesets) to version
the single published `owlie` package. The internal `@owlieio/*` packages are
ignored and never published.

```bash
pnpm changeset
```

- Choose the semver bump that matches the change: `patch` for fixes, `minor`
  for features. `owlie` is below `1.0`, so consumers pin exact versions.
- Every user-facing change must have a changeset; the PR checklist reminds
  authors.
- CI enforces changeset presence: a PR that touches `apps/cli/**` or
  `packages/**/src/**` must add a `.changeset/*.md` file, unless it carries the
  `no-changeset` label (for docs-only, config-only, or test-only changes).

---

## 5. Open a pull request

- Use `.github/pull_request_template.md` — it includes the checklist, scope
  confirmation, and a "how to verify" section.
- On every push to the PR, `.github/workflows/ci.yml` runs on `ubuntu-latest`
  and `macos-latest`:

  format check → lint → typecheck → test → dependency boundary check → build →
  export validation → CLI smoke → packaged-artifact install test.

- Additional CI checks run on every pull request:

  - Secret scanning (gitleaks) — fails on leaked credentials in the diff or
    history.
  - Coverage (Vitest + Codecov) — fails only when coverage drops below the
    recorded baseline.
  - PR title lint — enforces the conventional-commit title format.
  - Changeset presence — fails user-facing PRs without a changeset (see §4).

- Windows is intentionally not in the matrix; v1 has no Windows support
  guarantees.
- The PR is mergeable only when CI is green and a maintainer has reviewed it.

---

## 6. Review and merge

- Reviewers check: correctness, tests, documentation/ADR consistency,
  dependency-direction rules, no credentials, no hosted `owlie-app` concepts,
  no unrelated changes bundled in the branch.
- Recommended branch protection (GitHub settings, not in-repo — see
  [Maintainer responsibilities](#maintainer-responsibilities-out-of-band)):
  - Require a pull request before merging; disallow direct pushes to `main`.
  - Require status checks to pass (the CI jobs above).
  - Require at least one approving review from a maintainer.
  - Require linear history (squash or rebase merges).
  - Require conversation resolution.

---

## 7. Release (manual + changesets)

Publishing is **not automated** and requires explicit repository-owner
approval. npm versions are immutable and must never be overwritten.

Runbook (maintainers only):

```bash
# 1. Consume pending changesets and bump the version.
pnpm version

# 2. Confirm the result and full gate.
pnpm check
pnpm verify:artifact

# 3. Review the generated changelog, then commit the version bump and tag.
git add -A
git commit -m "chore: release owlie vX.Y.Z"
git tag "vX.Y.Z"
git push origin main --tags

# 4. Publish (one-time npm login as the 'owlie' owner).
npm login
pnpm publish   # = pnpm build && pnpm --filter owlie publish
```

Optional: create a GitHub Release for the tag with the changelog section as the
release notes.

---

## Automation (implemented)

1. **Secret scanning** — [`gitleaks`](https://github.com/gitleaks/gitleaks-action)
   fails CI on leaked credentials in the diff and full history. No secrets
   required; output is redacted.
2. **Dependency updates** — Dependabot for the `npm`/pnpm ecosystem, weekly
   cadence, grouped PRs, and a small open-PR limit to keep noise low.
3. **Coverage reporting** — `@vitest/coverage-v8` uploads to Codecov; the README
   shows a badge. The gate fails only when coverage drops (no absolute floor).
4. **Stale automation** — [`actions/stale`](https://github.com/actions/stale)
   labels items stale after 60 days and closes them 14 days later, exempting
   `good first issue`, `help wanted`, `security`, `pinned`, `epic`, `idea`,
   `v0.1`, and the `spec:*` labels.
5. **PR title lint** — [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request)
   enforces the conventional-commit title format.
6. **Changeset presence check** — fails PRs that touch user-facing code without
   a changeset; the `no-changeset` label opts out for deliberate exceptions.

---

## Maintainer responsibilities (out-of-band)

These live in GitHub settings or secrets, not in the repository:

- The repository is **public** (done).
- Branch protection on `main` is configured (done).
- `CODECOV_TOKEN` is configured (done); Dependabot and gitleaks need no secrets.
- Keep the npm owner list small; publishing stays human-gated.

## Open questions

- Public repo name/description and topics (for discoverability).
- Whether the `.changeset/README.md` "pin exact versions until 1.0" guidance
  should also appear in `CONTRIBUTING.md`.
