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
- list the Hacker News front page and extract a fixed old HN discussion;
- read every supported source type on real URLs from the
  [real-world catalog](#real-world-url-catalog): podcast feeds, Apple Podcasts
  shows and episodes, episode pages, PDFs, arXiv papers and listings,
  articles, homepages and feeds, called the way the app calls them;
- keep exact outcomes on the controlled corpus: custom-element and recovered
  articles, the specific empty-article error code with its `details`, a PDF
  from a link and from a local file, and direct media;
- process text with DeepSeek, including the `extract → process` pipeline and
  bounded `process --each`;
- keep the stdout/stderr and exit-code contracts intact at the installed
  executable boundary.

The scenario inventory lives in `scripts/release-e2e/scenarios.mjs`:

| Scenario                       | Command(s)                                                                   | External dependency                       |
| ------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------- |
| help                           | `owlie --help`                                                               | none                                      |
| version                        | `owlie --version`                                                            | none                                      |
| version --json                 | `owlie --version --json`                                                     | none                                      |
| capabilities                   | `owlie capabilities --json`                                                  | none                                      |
| doctor                         | `owlie doctor --json`                                                        | none                                      |
| setup (proxy none)             | `owlie setup` via a pseudo-terminal                                          | none                                      |
| list                           | `owlie list <feed> --limit 2 --json`                                         | Pages feed                                |
| list discovered feed           | `owlie list <article> --limit 2 --json`                                      | Pages article → feed                      |
| extract article                | `owlie extract <article> --article --json`                                   | Pages article                             |
| extract discovered feed        | `owlie extract <article> --feed --limit 2 --json`                            | Pages article → feed + article            |
| extract youtube                | `owlie extract <youtube> --json`                                             | YouTube                                   |
| extract feed                   | `owlie extract <feed> --limit 2 --json`                                      | Pages feed + article                      |
| list hacker news               | `owlie list https://news.ycombinator.com/ --limit 2 --json`                  | Hacker News API                           |
| extract hacker news item       | `owlie extract <HN item 8863> --hn-content both --json`                      | Hacker News API (+ its linked page)       |
| extract custom-element article | `owlie --hosted extract <custom-elements> --article --json`                  | Pages article                             |
| classify declared article      | `owlie --hosted extract <custom-elements> --limit 1 --json`                  | Pages article                             |
| extract recovered article      | `owlie --hosted extract <recovered> --article --json`                        | Pages article                             |
| empty article error            | `owlie --hosted extract <short-article> --article --json` (expects exit 1)   | Pages article                             |
| extract corpus pdf link        | `owlie --hosted extract <sample.pdf URL> --json`                             | Pages PDF                                 |
| extract local pdf              | `owlie extract e2e/corpus/sample.pdf --json`                                 | none                                      |
| resolve direct media           | `owlie --hosted resolve <audio.wav> --json`                                  | Pages audio                               |
| process pdf link               | `owlie process <sample.pdf URL> --prompt "Reply with exactly: OK" --json`    | Pages PDF + DeepSeek                      |
| real-world `<id>`              | per catalog entry kind (below)                                               | the entry's site                          |
| real-world `<id>` identity     | feed + Apple show `list`, Apple lookup, `resolve` of the episode             | the show's feed, Apple                    |
| process file                   | `owlie process <file> --prompt "Reply with exactly: OK" --json`              | DeepSeek                                  |
| extract → process pipeline     | `extract <youtube>` piped into `process --json`                              | YouTube + DeepSeek                        |
| process feed --each            | `owlie process <feed> --each --limit 2 --prompt "Reply with exactly: OK"`    | Pages feed + article + DeepSeek           |
| process --each discovered feed | `owlie process <article> --each --limit 2 --prompt "Reply with exactly: OK"` | Pages article → feed + article + DeepSeek |

## Controlled corpus

The article and feed live in `e2e/corpus/` and are published to GitHub Pages by
`.github/workflows/pages.yml`. They are project-controlled so the suite
depends on stable, reproducible content rather than mutable third-party
editorial pages. The article page declares a `<link rel="alternate"
 type="application/rss+xml" href="feed.xml">` element so the discovery
scenarios exercise bounded one-hop feed discovery from a supplied page. The
runner validates the expected markers, entry count, and linked-article
relationship before running, so stale or unexpected corpus content fails
clearly.

A small generated WAV (`e2e/corpus/audio.wav`) lives in the same corpus and is
the controlled direct-media fixture for the packaged extractor runtime
verification (`pnpm verify:extractor-runtime`, see
[`docs/testing-strategy.md`](testing-strategy.md) and ADR 0025). It is not used
by the release E2E scenarios.

The corpus also holds the pages whose exact outcome a real site cannot be
relied on to keep: `custom-elements.html` (body text inside custom elements,
declared `og:type` article with a feed link), `recovered.html` (a body inside
`<dialog>` that only the fallback reader recovers, with an
`article_text_recovered` warning), `short-article.html` (fails with
`ARTICLE_TOO_SHORT` and its `details`), and `sample.pdf` (two pages with a
text layer, generated with `buildPdf` from `@owlieio/testing`). The default
suite reads each of these through the real adapters offline
(`scripts/release-e2e/corpus.test.ts`), so a corpus change that would fail
the live run fails `pnpm test` first.

Changing the corpus (or its markers) requires updating `e2e/corpus/manifest.json`
in the same change. Any URL replacement must be reviewed and documented. New
corpus files reach Pages only when `main` is pushed, so the first validation
run after a corpus change is the one that proves them live.

## Real-world URL catalog

`e2e/real-world/catalog.json` lists real URLs from around the web, collected
over time. Each entry runs one command, the way the app runs it (`owlie
--hosted … --json --timeout-ms … --max-stdout-bytes …`), and must meet its
kind's contract (`scripts/release-e2e/real-world.mjs`). Real content
changes, so the contracts are structural; `contains` adds text that must
appear only when it never changes (an RFC title).

| Kind              | Command                                  | Contract                                                                                                                                        |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `article`         | `extract URL --article`                  | an `article` document with at least `minTextChars` (500) characters                                                                             |
| `page`            | `extract URL --limit 1`                  | classified as `classifiesAs`: `article` (a document) or `feed` (a feed batch)                                                                   |
| `feed`            | `list URL --limit 3`                     | an `rss` collection with at least `minItems` (1) linked entries                                                                                 |
| `podcast-feed`    | `list URL --limit 3 --order newest`      | every episode has an audio enclosure, an `enclosureUrl` and an `entryIdSource`; well-formed `transcripts`; with `transcripts: true`, some exist |
| `apple-show`      | `list URL --limit 3 --order newest`      | `collection.metadata.apple.podcastId` is the URL's id; the collection is `feedUrl` when given; episodes as for `podcast-feed`                   |
| `podcast-episode` | `resolve URL`                            | the expected `resolver` and a media URL                                                                                                         |
| `pdf`             | `extract URL`                            | an `article` document with `metadata.format: "pdf"`, pages read, at least `minTextChars` (200) characters                                       |
| `arxiv-paper`     | `extract URL` (`--abstract-only` if set) | `id` is the version-less `arxiv:<id>`, `textSource` html or pdf (abstract when abstract-only), the text includes the abstract                   |
| `arxiv-listing`   | `list URL --limit 2`                     | an `arxiv` collection with at least `minItems` (1) papers whose ids match their `arxivId` (`0` for a category feed)                             |
| `biorxiv-paper`   | `extract URL` (`--abstract-only` if set) | `id` is the version-less `biorxiv:<doi>`, `textSource` html or pdf (abstract when abstract-only), the text includes the abstract                |
| `biorxiv-listing` | `list URL --limit 2`                     | a `biorxiv` collection with at least `minItems` (1) preprints whose ids match their `doi`                                                       |

An `apple-show` entry with `identity: true` and a `feedUrl` adds the podcast
identity check, the CLI side of the app's identity gate: the feed and the
Apple show list the same entry ids, and one of the newest episodes (found in
Apple's public lookup by its GUID) resolves through `podcast-apple` to the
enclosure of that same feed entry. arXiv entries wait 3 s before running, as
arXiv asks; bioRxiv/medRxiv entries wait 2 s.

### Adding an entry

Every entry records `id` (a slug), `kind`, `url`, `status`, `origin` and
`added` (a date), plus `notes` and its kind's options. Add an entry whenever
a real URL breaks or surprises someone: a user's report, a production alert,
a new site the app should support. `origin` says where it came from
(`owlie#172: production 'no readable content' alerts`), so a failure points
straight back to the case it protects.

- A new entry starts as `"status": "watch"`: it runs and is reported (`WATCH`
  lines and the `watchFailed` count) but never fails the release. An entry
  that shows behaviour still to fix stays on watch with `notes` saying what
  is expected.
- Promote it to `"gate"` once it has passed reliably, usually after a couple
  of validation runs. A gate entry that fails blocks the release like any
  other scenario.
- When a site goes away or changes for good, replace or remove its entry in
  the same change that explains why; never weaken a contract to make a dead
  URL pass.

`pnpm test` validates the catalog (fields, kinds, options, unique ids) and
requires at least one entry of every kind.

## One-time setup

1. **GitHub Pages** — enable Pages with **GitHub Actions** as the source
   (Settings → Pages). The first `Deploy release corpus` run publishes the
   corpus to `https://mihaiiova.github.io/owlie/`.
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

Publishing is automated via npm Trusted Publishers (OIDC); see
[ADR 0027](decisions/0027-trusted-publishing.md). After the validation run
passes, dispatch the publish workflow on `main`:

1. Run **Actions → Publish to npm → Run workflow**, entering the same
   `expected_version`.
2. The workflow rebuilds from source, runs the offline artifact smoke test,
   and publishes with `npm publish --access public` using a short-lived OIDC
   credential — no npm token or 2FA is involved.

Fallback (manual, only when trusted publishing is unavailable): publish the
exact tarball that passed validation:

```bash
# Download and verify the uploaded tarball against the manifest checksum.
sha256sum owlieio-owlie-<version>.tgz   # compare to candidate-manifest.json sha256
npm publish owlieio-owlie-<version>.tgz --access public
```

## Retry and failure semantics

- Each failed scenario is retried **at most once**, and only for classified
  transient conditions (timeouts, connection resets, rate limits, upstream
  5xx). Usage errors, auth failures, assertion failures, and other
  deterministic failures are not retried.
- A classified YouTube runner-access block is retried once through the
  optional proxy, in both scenarios that fetch a transcript (`extract youtube`
  and `extract → process pipeline`). Direct access is always attempted first.
  If no proxy is configured (or the proxy also fails), validation fails.
- A scenario passes when its exit code matches the expected one (0 unless the
  scenario sets `expectedExitCode`; `deadline cancellation` expects 130) and
  its assertions hold.
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
OWLIE_E2E_ARTICLE_URL=https://mihaiiova.github.io/owlie/article.html \
OWLIE_E2E_RSS_URL=https://mihaiiova.github.io/owlie/feed.xml \
OWLIE_E2E_YOUTUBE_URL=https://www.youtube.com/watch?v=jNQXAC9IVRw \
DEEPSEEK_API_KEY=... \
node scripts/release-e2e.mjs --bin apps/cli/dist/bin.js --out /tmp/report.json
```

`--only TEXT` runs just the scenarios whose name contains `TEXT`; for
example `--only real-world` checks the whole catalog, and `--only real-world
the-daily` one show. DeepSeek is only called by the `process` scenarios.

The default test suite (`pnpm test`) never runs live scenarios; it only
exercises the deterministic seams (`scripts/release-e2e/*.test.ts`).

## Extension checklist

Every newly functional command or distinct mode must add a release scenario to
`scripts/release-e2e/scenarios.mjs` and this document's table, or record an
explicit justified exception here. A new source type also adds a catalog kind
with real entries, and a new corpus page when its exact outcome matters.

Exceptions: podcast transcription with Whisper stays in
`verify-extractor-runtime` (it needs Python and models), and Reddit stays out
while its adapter is a deferred scaffold. Add a default-suite test for any new pure
classification, assertion, or redaction behavior the scenario introduces.
