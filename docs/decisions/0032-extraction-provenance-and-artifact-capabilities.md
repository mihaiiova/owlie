# ADR 0032 — Extraction provenance and artifact capabilities

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

`owlie-app` must persist, deduplicate, and safely diagnose CLI extraction
results. Before this change a `NormalizedDocument` carried no producer
identity, extraction timestamp, machine-readable warnings, or content
fingerprint, so a subprocess host could not reliably correlate or deduplicate
results. The CLI also lacked a credential-free startup manifest that would let
a hosted subprocess verify the installed artifact and its schema compatibility,
and `--version --json` bypassed the versioned JSON protocol.

## Decision

- `NormalizedDocument.schemaVersion` becomes literal `2` and every document
  gains a required, first-class `provenance` field. This is an intentional
  breaking document-model change with no external consumers; document v1 input
  is not required to remain accepted.
- `DocumentProvenance` is provider-neutral and explicit: `sourceId` (the stable
  idempotency identity, distinct from the text fingerprint), `canonicalUrl`,
  `adapterId`, optional `resolverId`, `fetchedAt` (ISO-8601 UTC), optional
  `language`, `contentFingerprint` (`algorithm: "sha256"`, digest), and
  `warnings: Array<{ code, message }>`. Values must not expose credentials, URL
  userinfo, query strings, or fragments.
- The fingerprint is the SHA-256 digest of the exact normalized document `text`
  UTF-8 bytes, computed with Node crypto. Source identity and mutable metadata
  are excluded, so identical text always deduplicates regardless of origin.
- `@owlieio/core` owns the neutral provenance/document vocabulary and the pure
  fingerprinting helper; adapters populate document facts (stable identity,
  canonical URL, language); the CLI owns the boundary clock, `adapterId`/
  `resolverId`/`warnings` stamping, redaction, transport, and exit behavior.
- `fetchedAt` is stamped once at the CLI extraction boundary with an injected
  clock (`ExtractDeps.clock` / `ProcessDeps.clock`), including local/no-network
  documents, rather than per HTTP fetch hop. Podcast resolver extraction
  derives its `sourceId` from the canonical supplied locator, never the
  resolved/signed media URL; local files use a normalized absolute-path
  identity rather than a basename.
- Universal dispatch records the winning adapter id and emits a structured
  `ARTICLE_FALLBACK` warning for the existing article-fallback deferral.
- `process --input-format json` and feed/each records preserve v2 provenance
  through every round trip.
- The JSON subprocess protocol keeps `JSON_PROTOCOL_SCHEMA_VERSION` at `1`
  (its envelope shape is unchanged). A new credential-free
  `owlie capabilities [--json]` command reports the artifact/package version,
  protocol schema version, document schema version, and the supported command,
  adapter, provider, and resolver ids — derived from the published version,
  the schema constants, and the registration catalogs, never a duplicated
  hard-coded list. `owlie --version --json` now emits the standard versioned
  result envelope as a scalar version response; plain `owlie --version` output
  is unchanged.

## Consequences

- `owlie-app` can persist, deduplicate, and diagnose extraction results from
  stable identities and a deterministic content fingerprint, and can reject an
  incompatible artifact before accepting work without reading local
  configuration or secrets.
- This is a breaking change to the document model and is released accordingly;
  the JSON subprocess protocol version is unaffected.
- No hosted state, queues, persistence, credentials, or `owlie-app` imports are
  introduced; `owlie-app` remains a subprocess consumer.
