# ADR 0009 — Safe RSS/Atom parsing with entity-expansion protection

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

`@owlieio/adapter-rss` scaffolded feed recognition (`detectFeedFormat`,
`isFeedUrl`, `normalizeFeedUrl`) but left `parseFeed` throwing
`NotImplementedError`. RSS/Atom parsing is the shared foundation for three
deferred adapters: `adapter-rss` itself, `adapter-reddit` (documented reuse
exception), and `adapter-podcast` (feed resolution). The
[security model](../security-model.md) requires XML entity-expansion protection
(no billion-laughs/XXE).

`owlie-app/ingestion_service` used `rss-parser` (which wraps `xml2js`) — a
third-party parser that does not, on its own, provide entity-expansion
protection. Its behavior (format detection, GUID/link fallback, `content:encoded`,
`itunes:*`/`enclosure`, Reddit `content:encoded`) served as the characterization
spec for this port.

## Decision

- Parse with [`fast-xml-parser`](https://www.npmjs.com/package/fast-xml-parser)
  configured with `processEntities: false` — all entity expansion disabled, so
  document-defined entities are left as literal text.
- Reject any document carrying a DTD or entity declaration (`<!DOCTYPE` /
  `<!ENTITY`) outright with an `ExtractionError` — a deterministic, testable
  XXE guard independent of the parser's own behavior.
- Decode character references ourselves with the
  [`entities`](https://www.npmjs.com/package/entities) library (pure string
  substitution against the standard HTML entity table — named and numeric,
  never DTD-defined). This preserves common HTML entities (`&nbsp;`, `&mdash;`)
  while leaving unknown/Dtd-defined references (`&lol2;`) untouched.
- Normalize into the existing provider-neutral `ParsedFeed`/`ParsedEntry`
  shapes, handling RSS 2.0, Atom, Reddit's Atom-in-`.rss`, and RSS 1.0 (RDF).
- Entry identity follows `guid` (RSS) / `id` (Atom) → `link` → a stable hash of
  `title`/`publishedAt`/`description`, matching the RSS/Atom uniqueness-by-spec
  convention and `owlie-app`'s `guid || link`.

## Consequences

- `parseFeed` is now a pure, offline, security-hardened capability; `list` and
  `extract` remain deferred (they require a fetch seam, the next slice).
- `adapter-rss` gains two runtime dependencies: `fast-xml-parser` and
  `entities` (externalized like `@hallelx/youtube-transcript` and the AI SDK).
- `adapter-reddit`'s `parseSubredditFeed` (which delegates to `parseFeed`)
  becomes functional without changes.
- The billion-laughs/XXE requirement in the security model is implemented and
  covered by a rejection test.
