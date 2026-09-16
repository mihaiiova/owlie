# Testing strategy

## Principles

The default test suite must:

- require no credentials;
- make no paid API calls;
- make no real external network calls;
- avoid machine-specific snapshots;
- run on macOS and Linux CI environments.

## Layers

- **Unit tests** — pure logic: core types and orchestration, limits, output
  formats, errors, URL recognition/normalization/derivation.
- **Contract tests** — `@owlieio/testing/contract-tests` helpers verify that an
  implementation satisfies `CollectionAdapter`, `ItemAdapter`,
  `ContentProcessor`, and `Transcriber`.
- **Fakes** — `@owlieio/testing` provides `FakeCollectionAdapter`,
  `FakeItemAdapter`, `FakeContentProcessor`, `FakeTranscriber`, and
  `FakeProgressSink`, plus `makeCollection`/`makeItem`/`makeDocument` fixtures.
- **CLI tests** — `apps/cli/test` asserts stdout, stderr, and exit status
  separately using injected I/O buffers and injected `DoctorDeps`.
- **Smoke tests** — `scripts/cli-smoke.mjs` runs the built binary for
  `--help`, `--version`, and `doctor`.

## Specific required tests

- Pure Reddit URL-normalization tests.
- Pure Reddit feed-derivation tests.
- Tests proving collection limits reject invalid or unbounded values.

## Network isolation

Adapters and providers keep their network paths injectable, and the default
test suite never performs real fetches or spawns real subprocesses
(whisper/ffmpeg/python).

## Live tests (opt-in)

Live integration tests (`*.live.test.ts`) make real network calls to YouTube
and DeepSeek. They are excluded from the default suite (`vitest.config.ts`) and
from CI, and are gated behind `OWLIE_LIVE_TESTS=1` (plus `DEEPSEEK_API_KEY` for
DeepSeek). Run them
explicitly:

```bash
OWLIE_LIVE_TESTS=1 pnpm test:live
```

Live tests skip (never fail) when the gate, credentials, or required
dependencies are absent. Never run them in CI, and never commit credentials.

## Release E2E (manual, protected)

The release validation workflow (see
[`docs/release-validation.md`](release-validation.md)) runs the full live
scenario suite at the installed executable boundary against the controlled
GitHub Pages corpus, a known-caption YouTube video, and DeepSeek. It is
manually dispatched on `main`, guarded by a protected `release` environment,
and does not tag or publish.

Its deterministic seams — candidate/version validation, failure
classification, retry policy, secret redaction, report generation, scenario
assertions, and corpus validation — are covered by the offline default suite in
`scripts/release-e2e/*.test.ts`. The live runner itself never runs in the
default suite or ordinary CI.

## Packaged extractor runtime verification (opt-in)

The packed `owlie` executable's direct-media extractor contract is verified at
the installed-executable boundary by `pnpm verify:extractor-runtime`
(`scripts/verify-extractor-runtime.mjs`). It packs and installs `owlie`, then
runs the installed binary against the controlled audio fixture in
`e2e/corpus/`, asserting:

- `doctor --json` readiness;
- the direct-media `extract --json` transcript document, its stdout/stderr
  separation, and exit code;
- prerequisite failure guidance (missing prerequisite → installation guidance on
  stderr, exit 1);
- the never-downloads-model-weights guarantee (missing pre-provisioned model →
  guidance, not a download).

Its default mode replaces `ffprobe`/`ffmpeg`/`python3` with generated command
shims backed by a pure, unit-tested behavior module, so it requires no local
runtime and no model download (see [ADR 0025](decisions/0025-packaged-extractor-runtime-verification.md)).
The default suite covers the pure seams (`scripts/extractor-runtime/*.test.ts`);
the live runner is opt-in and not part of `pnpm check`.

A gated `--real` mode (and a Dockerfile plus a manual `workflow_dispatch`)
runs the same scenarios against the real Python + faster-whisper + ffmpeg +
ffprobe runtime with a pre-provisioned model and `HF_HUB_OFFLINE=1`, proving
prerequisite discovery and local-only model loading. It never runs in the
default suite or ordinary CI.
