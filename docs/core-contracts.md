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
`TranscriptionError`, `ProcessingError`, `CancelledError`,
`NotImplementedError`). Library packages never call `process.exit`.

## Orchestration

`listCollection`, `resolveItem`, and `extractItem` compose adapters with
cancellation and keep callers free of plumbing.
