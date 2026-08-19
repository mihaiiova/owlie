# Core contracts

`@owlieio/core` defines the provider-neutral contracts every adapter, provider,
and the CLI build on. See `packages/core/src/` for the canonical definitions.

## Data types

- `ContentLocator` — `{ url, hint? }`
- `ContentCollection` — `{ id, sourceType, canonicalUrl, title?, metadata }`
- `ContentItem` — `{ id, sourceType, canonicalUrl, title?, description?,
publishedAt?, author?, metadata }`
- `NormalizedDocument` — `{ schemaVersion: 1, id, sourceType, canonicalUrl,
mediaType, title?, text, publishedAt?, author?, metadata }`
- `ProcessRequest` — `{ document, instruction?, outputSchema? }`
- `ProcessResult` — `{ output, format: 'text'|'markdown'|'json', metadata }`

### Transcript metadata (v0.1 convention)

When a `NormalizedDocument` is a transcript (`mediaType: 'transcript'`), its
`metadata` object carries, when available:

- `videoId` — the source video ID (YouTube)
- `language` — human-readable transcript language name
- `languageCode` — language code (e.g. `en`, `en-US`)
- `isGenerated` — `true` when captions were auto-generated

These keys are a documented convention, not a closed set; adapters may add
source-specific fields.

## Adapter contracts

- `SourceAdapter` — `id`, `sourceType`, `recognize(locator)`.
- `CollectionAdapter` — `resolve(locator)` → `ContentCollection`, and
  `list(collection, options)` → `{ collection, items, truncated }`.
- `ItemAdapter` — `resolveItem?(locator)` → `ContentItem`, and
  `extract(item, options)` → `NormalizedDocument`.
- `ContentExtractor` — reusable `extract` strategy (Reddit reuses RSS parsing
  via this seam).
- `CollectionDiscovery` — reserved for future discovery of collections.

## Processing contracts

- `Transcriber` — `id`, `transcribe(input, options?)` → `TranscriptionResult`.
- `ContentProcessor` — `id`, `process(request, options?)` → `ProcessResult`.
- `ProgressSink` — `emit(event)`.
- `OutputSerializer` — `id`, `format`, `serialize(value, options?)`.

## Options

- `ExtractionOptions` / `ProcessorOptions` / `TranscriptionOptions` carry an
  optional `AbortSignal` and `ProgressSink`.
- `CollectionListOptions` carries `limit`, `sort?`, `period?`, `signal?`.

## Errors

Throw typed errors (`ConfigurationError`, `ExtractionError`,
`CaptionsUnavailableError`, `TranscriptionError`, `ProcessingError`,
`CancelledError`, `NotImplementedError`). Library packages never call
`process.exit`. `CaptionsUnavailableError` extends `ExtractionError` and
carries the code `CAPTIONS_UNAVAILABLE` for cases where extraction succeeds
but the requested captions/transcript are not available.

## Orchestration

`listCollection`, `resolveItem`, and `extractItem` compose adapters with
cancellation and keep callers free of plumbing.
