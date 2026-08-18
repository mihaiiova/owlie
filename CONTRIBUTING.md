# Contributing to Owlie CLI

Thanks for your interest. Owlie CLI is the open-source, local-first core. Before
contributing, read the [root `AGENTS.md`](AGENTS.md) and the
[security model](docs/security-model.md).

## Prerequisites

- Node.js 20+ (pinned in `.nvmrc`)
- pnpm (pinned in `package.json` via `packageManager`)

```bash
corepack enable   # optional: ensures the pinned pnpm is used
pnpm install
```

## Commands

Run from the repository root:

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `pnpm install`      | Install dependencies (frozen lockfile in CI) |
| `pnpm build`        | Build all packages to `dist/`                |
| `pnpm typecheck`    | Typecheck every package                      |
| `pnpm lint`         | ESLint over the repository                   |
| `pnpm test`         | Run the full Vitest suite                    |
| `pnpm format`       | Format with Prettier                         |
| `pnpm format:check` | Verify formatting                            |
| `pnpm check`        | Run every check required before merge        |
| `pnpm cli --help`   | Run the built CLI                            |

`pnpm check` runs: format check, lint, typecheck, tests, dependency-boundary
check, build, package export validation, and CLI smoke tests.

## Development workflow

1. Pick a narrow, well-scoped change within the documented
   [v1 boundaries](docs/product-scope.md).
2. Write or update tests first where practical.
3. Implement in the correct package (see the dependency rules in `AGENTS.md`).
4. Update documentation and ADRs if behavior or architecture changes.
5. Run `pnpm check` and fix everything before opening a PR.
6. Record user-facing changes with `pnpm changeset`.

## Dependency rules

- `@owlieio/core` depends on nothing Owlie-specific and no providers/adapters.
- Adapters and providers depend only on `@owlieio/core` (Reddit may also reuse
  `@owlieio/adapter-rss`).
- `@owlieio/cli` composes core, adapters, and providers.
- No undeclared cross-package imports. `pnpm check:deps` enforces this.

## Testing expectations

- The default test suite makes no network calls and requires no credentials.
- Add unit tests for pure logic and contract tests for new adapters/providers.
- Keep fixtures sanitized; never commit credentials, tokens, or user data.

## Security

- Never print secrets.
- Never add credentials to source, fixtures, logs, or snapshots.
- Follow [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Releasing

Publishing is not automated. Packages are private until the `@owlieio` npm
scope is owned. A release requires explicit repository-owner approval; npm
versions are immutable and must never be overwritten.
