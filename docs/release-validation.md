# Release validation (live E2E)

The release validation workflow is a manually dispatched, **validation-only**
gate. It builds and packs `owlie` once, verifies the exact artifact, and runs
the complete live end-to-end suite against real input and real services. It
never tags, publishes, or creates a GitHub Release.

## What it validates

The workflow proves the published artifact can:

- install and run on the supported Node runtimes;
- list a real RSS/Atom feed and extract its linked article;
- extract a real static article and a known-caption YouTube video;
- process text with DeepSeek, including the `extract → process` pipeline and
  bounded `process --each`;
- keep the stdout/stderr and exit-code contracts intact at the installed
  executable boundary.

The scenario inventory lives in `scripts/release-e2e/scenarios.mjs`:

| Scenario                   | Command(s)                                                                | External dependency             |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| help                       | `owlie --help`                                                            | none                            |
| version                    | `owlie --version`                                                         | none                            |
| doctor                     | `owlie doctor --json`                                                     | none                            |
| setup (proxy none)         | `owlie setup` via a pseudo-terminal                                       | none                            |
| list                       | `owlie list <feed> --limit 2 --json`                                      | Pages feed                      |
| extract article            | `owlie extract <article> --json`                                          | Pages article                   |
| extract youtube            | `owlie extract <youtube> --json`                                          | YouTube                         |
| extract feed               | `owlie extract <feed> --limit 2 --json`                                   | Pages feed + article            |
| process file               | `owlie process <file> --prompt "Reply with exactly: OK" --json`           | DeepSeek                        |
| extract → process pipeline | `extract <article>` piped into `process --json`                           | Pages article + DeepSeek        |
| process feed --each        | `owlie process <feed> --each --limit 2 --prompt "Reply with exactly: OK"` | Pages feed + article + DeepSeek |

## Controlled corpus

The article and feed live in `e2e/corpus/` and are published to GitHub Pages by
`.github/workflows/pages.yml`. They are project-controlled so the suite
depends on stable, reproducible content rather than mutable third-party
editorial pages. The runner validates the expected markers, entry count, and
linked-article relationship before running, so stale or unexpected corpus
content fails clearly.

Changing the corpus (or its markers) requires updating `e2e/corpus/manifest.json`
in the same change. Any URL replacement must be reviewed and documented.

## One-time setup

1. **GitHub Pages** — enable Pages with **GitHub Actions** as the source
   (Settings → Pages). The first `Deploy release corpus` run publishes the
   corpus to `https://mihaiiova.github.io/owlie-cli/`.
2. **Protected environment** — create a GitHub Environment named `release`,
   restrict it to `main`, and require reviewer approval.
3. **Secrets/variables** — add to the `release` environment:
   - `DEEPSEEK_API_KEY` (required);
   - `OWLIE_E2E_PROXY_URL` (optional generic proxy URL used only when YouTube
     blocks the GitHub-hosted runner IP);
   - optionally the `OWLIE_E2E_YOUTUBE_URL` variable to pin a different
     known-caption video.

## Running validation

1. On `main`, run **Actions → Release validation → Run workflow**, entering the
   exact semantic version from `apps/cli/package.json`.
2. Approve the protected `live` job when GitHub prompts.
3. After completion, download the artifacts:
   - `owlie-candidate` — the exact tarball to publish;
   - `release-e2e-report` — the sanitized `release-e2e-report.json` and
     `candidate-manifest.json` (which includes the SHA-256 checksum).

Artifacts are retained for 14 days (`retention-days` on each upload), so
download them before publishing.

The first run after setting everything up is the **activation proof** that the
gate is operational before it is used for a real release.

## Publishing the tested artifact

Do not re-run `pnpm publish` locally. Publish the exact tarball that passed
validation:

```bash
# Download and verify the uploaded tarball against the manifest checksum.
sha256sum owlie-<version>.tgz   # compare to candidate-manifest.json sha256
npm publish owlie-<version>.tgz
```

Publishing remains manual and requires explicit repository-owner approval.

## Retry and failure semantics

- Each failed scenario is retried **at most once**, and only for classified
  transient conditions (timeouts, connection resets, rate limits, upstream
  5xx). Usage errors, auth failures, assertion failures, and other
  deterministic failures are not retried.
- A classified YouTube runner-access block is retried once through the
  optional proxy. Direct access is always attempted first. If no proxy is
  configured (or the proxy also fails), validation fails.
- The PTY-driven scenarios (`setup`, `process file`, `process feed --each`)
  run with `--quiet` so terminal framing cannot corrupt their stdout
  contract; because stderr is suppressed, a transient DeepSeek failure in
  those scenarios fails deterministically instead of retrying. The YouTube
  and `extract → process pipeline` scenarios retain full retry/classification
  behavior.
- Every report is redacted: the DeepSeek key, the proxy URL, authorization
  headers, and `sk-` tokens never appear in uploaded artifacts.
- A failed validation does not authorize bypassing the gate. Use the sanitized
  diagnostics to distinguish an Owlie regression from an external-service
  outage, then fix, update a deliberately changed corpus, or rerun after a
  confirmed transient failure.

## Local opt-in usage

The runner can be run locally against the built CLI, with live credentials:

```bash
pnpm build
OWLIE_E2E_EXPECTED_VERSION=$(node -p "require('./apps/cli/package.json').version") \
OWLIE_E2E_ARTICLE_URL=https://mihaiiova.github.io/owlie-cli/article.html \
OWLIE_E2E_RSS_URL=https://mihaiiova.github.io/owlie-cli/feed.xml \
OWLIE_E2E_YOUTUBE_URL=https://www.youtube.com/watch?v=jNQXAC9IVRw \
DEEPSEEK_API_KEY=... \
node scripts/release-e2e.mjs --bin apps/cli/dist/bin.js --out /tmp/report.json
```

The default test suite (`pnpm test`) never runs live scenarios; it only
exercises the deterministic seams (`scripts/release-e2e/*.test.ts`).

## Extension checklist

Every newly functional command or distinct mode must add a release scenario to
`scripts/release-e2e/scenarios.mjs` and this document's table, or record an
explicit justified exception here. Add a default-suite test for any new pure
classification, assertion, or redaction behavior the scenario introduces.
