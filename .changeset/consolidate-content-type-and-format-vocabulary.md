---
'owlie': patch
---

Consolidate media-type classification and output-format vocabulary into
`@owlieio/core`. A single shared `mediaTypeOf`/`isHtmlContentType`/
`isJsonContentType`/`isFeedContentType` module replaces the five package-local
classifiers across adapters and `owlie setup`; `HttpFetcher` no longer exposes
the content-type-dropping `fetchText` method; and `ProcessResult.format` gains
a dedicated `ProcessResultFormat` type distinct from the reserved serializer's
`OutputFormat`. RSS keeps its documented accept-missing feed content type
compatibility. No observable CLI behavior changes.
