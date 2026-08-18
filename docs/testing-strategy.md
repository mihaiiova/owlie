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
