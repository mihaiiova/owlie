# ADR 0011 — Narrow static `article` source

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

RSS/Atom entries commonly link to editorial pages, but Owlie previously had no
provider-neutral item adapter for those URLs. Treating them as generic webpages
would invite crawling, browser automation, and an unsafe second HTTP client.

## Decision

- Add `article` to core's `SourceType` and implement
  `@owlieio/adapter-article` as an `ItemAdapter`.
- An article is a directly supplied safe HTTP(S), server-rendered editorial
  page. The adapter's item identity is derived from the canonical URL; the
  extracted document identity uses the final validated post-redirect URL.
- The adapter obtains bounded text exclusively through core's `HttpFetcher`.
  The enriched response supplies text, final URL, and declared content type.
  Core validates every redirect and enforces SSRF, timeout, byte-limit, and
  cancellation policy before parsing.
- The adapter accepts only `text/html` and `application/xhtml+xml`, then calls
  `@extractus/article-extractor`'s `extractFromHtml(html, finalUrl)`. It never
  calls that library's URL-fetching helper.
- The extractor is invoked with an explicit `allowedTags` allowlist that
  extends the library default with standard semantic elements (`main`, `time`,
  and friends). The library's sanitizer removes a disallowed element together
  with its subtree, so omitting `main` silently discards articles whose body
  Readability keeps inside a `<main>` wrapper.
- Empty readable output is an `ExtractionError`; cancellation remains a
  `CancelledError`.

## Consequences

This supersedes the earlier generic-webpage non-goal only for this constrained
static item source. It does not add browser rendering, authentication, paywall
bypass, arbitrary crawling, recursive link traversal, or CLI registration.
Those capabilities require separate decisions and specs.
