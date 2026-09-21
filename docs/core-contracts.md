# Core contracts

`@owlieio/core` defines the provider-neutral contracts every adapter, provider,
and the CLI build on. See `packages/core/src/` for the canonical definitions.

## Data types

- `SourceType` — `youtube`, `podcast`, `reddit`, `rss`, the narrow static `article` source, or `local` for user-supplied local content (text files and stdin).
- `ContentLocator` — `{ url, hint? }`
- `ContentCollection` — `{ id, sourceType, canonicalUrl, title?, metadata }`
- `ContentItem` — `{ id, sourceType, canonicalUrl, title?, description?,
publishedAt?, author?, metadata }`
- `NormalizedDocument` — `{ schemaVersion: 2, id, sourceType, canonicalUrl,
mediaType, title?, text, publishedAt?, author?, metadata, provenance }`,
  where `provenance` is a required `DocumentProvenance`
  (`{ sourceId, canonicalUrl, adapterId, resolverId?, fetchedAt, language?,
contentFingerprint, warnings }`). `contentFingerprint` is
  `{ algorithm: "sha256", digest }`; `warnings` is `Array<{ code, message }>`.
  `fetchedAt` is ISO-8601 UTC; provenance values must not expose credentials,
  URL userinfo, query strings, or fragments.
- `ContentFingerprint` — `{ algorithm: "sha256", digest }`.
- `ExtractionWarning` — `{ code, message }`.
- `DocumentProvenance` — see above; `sourceId` is the stable idempotency
  identity and is distinct from the SHA-256 normalized-text fingerprint.
- `ProcessRequest` — `{ document, instruction?, outputSchema? }`
- `ProcessResult` — `{ output, format: ProcessResultFormat, metadata }`, where
  `ProcessResultFormat` is `'text' | 'markdown' | 'json'` (a single-result
  format; the reserved serializer's `OutputFormat` also carries the streaming
  `jsonl` form, which is never a single-result format)

`publishedAt` (and other timestamps) are canonicalized to a stable ISO 8601
UTC string in `toISOString()` form, e.g. `2025-08-19T10:00:00.000Z`. Adapters
normalize publisher timestamps instead of passing raw formats through, so the
value stays consistent across sources and library versions.

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
  `extract(item, options)` → `NormalizedDocument`. `ArticleAdapter` uses the
  safe `HttpFetcher` response (`text`, final validated `url`, and declared
  `contentType`) before passing bounded HTML to its extractor.
- `ContentExtractor` — reusable `extract` strategy (Reddit reuses RSS parsing
  via this seam).
- `CollectionDiscovery` — reserved for future discovery of collections.

## Safe HTTP contracts

- `HttpFetcher` / `DefaultHttpFetcher` — bounded text fetching with canonical
  IP classification, per-hop DNS and redirect validation, unconditional URL
  userinfo rejection, and origin-plus-path diagnostics. `assertNoUrlCredentials`
  applies the same userinfo rule to URLs rendered before a fetch. Destinations must be
  globally routable unicast by default; `allowPrivateHosts` permits only the
  documented private/local categories. `fetchToFile` reuses the same safe-fetch
  policy to stream bounded raw bytes (no text decode) into a caller-owned file
  for binary downloads such as podcast media.
- `HttpFetchPolicy` — timeout, redirect, response-size, private/local opt-in,
  and user-agent policy shared by HTTP-backed adapters.

## Processing contracts

- `Transcriber` — `id`, `transcribe(input, options?)` → `TranscriptionResult`.
- `ContentProcessor` — `id`, `process(request, options?)` → `ProcessResult`.
- `ProviderCatalog` — `providerId`, `listModels(credentials)` → `ModelInfo[]`
  (dynamic, SDK-free live model discovery implemented by each LLM provider).
- `ProgressSink` — `emit(event)`.
- `OutputSerializer` — `id`, `format: OutputFormat`, `serialize(value, options?)`
  (reserved; not implemented in v0.1).

### `ProcessResult.metadata` convention (v0.1)

Functional LLM processors return the same provider-owned metadata convention:

- `metadata.provider` — the provider id (`deepseek` or `openai`);
- `metadata.model` — the model id that actually processed the request;
- `metadata.usage` — normalized API-reported token usage when supplied, as
  `{ inputTokens?, outputTokens?, totalTokens? }`.

These keys are a documented convention, not a closed set; providers must never
place API keys, pricing, credits, or hosted-account data in `metadata`.

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

## JSON subprocess protocol

`packages/core/src/protocol.ts` defines the provider-neutral types for the
versioned JSON subprocess protocol (ADR 0030):

- `JSON_PROTOCOL_SCHEMA_VERSION` — the protocol schema version (currently `1`).
- `ProtocolRecord` — `{ schemaVersion, command }`, the base identity of every record.
- `ProtocolResultEnvelope` — `{ schemaVersion, command, result }`, the single-result stdout envelope.
- `ProtocolProgressRecord` — `{ schemaVersion, command, kind: "progress", event }`.
- `ProtocolErrorRecord` — `{ schemaVersion, command, kind: "error", code, message }`.
- `ProtocolCancelledRecord` — `{ schemaVersion, command, kind: "cancelled", message }`.

`packages/core/src/provenance.ts` defines the pure fingerprinting helpers used
by provenance (ADR 0032): `fingerprintText(text)` returns the SHA-256 hex
over the exact `text` UTF-8 bytes, `contentFingerprint(text)` returns the
labeled `{ algorithm: "sha256", digest }`, and `buildProvenance(input)`
assembles a `DocumentProvenance` from document facts plus the caller-owned
`fetchedAt`/`warnings`. `NORMALIZED_DOCUMENT_SCHEMA_VERSION` is the document
schema constant (currently `2`).

The CLI owns serialization, redaction, transport, and exit-code translation;
core owns the neutral vocabulary only.

## Orchestration

`listCollection`, `resolveItem`, and `extractItem` compose adapters with
cancellation and keep callers free of plumbing.
