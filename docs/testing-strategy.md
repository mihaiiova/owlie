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

Adapters and providers are scaffolded so their network paths throw
`NotImplementedError`; nothing performs real fetches in tests.

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
