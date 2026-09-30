# Output formats

Output formats:

```text
text
markdown
json
jsonl
```

`OutputSerializer` (see [core contracts](core-contracts.md)) remains a reserved
provider-neutral interface with no v0.1 implementation; the CLI writes these
formats directly.

## Conventions

- `text` and `markdown` are human-oriented.
- `json` is a single structured document. In `--json` mode the CLI writes a
  versioned protocol envelope `{ schemaVersion, command, result }` (ADR 0030).
- `jsonl` is one JSON object per line. In v0.1 it is used by
  `owlie process FEED_URL --each` to stream one record per attempted feed
  item (each record carries `schemaVersion` and `command`); other commands do
  not emit JSONL on stdout. In `--json` mode stderr is also versioned JSONL
  (progress, error, and cancellation records).

## v0.1

- `extract` writes raw transcript text by default, or a JSON
  `NormalizedDocument` under a versioned protocol envelope with `--json`.
  Every v2 document carries a first-class `provenance` field (source identity,
  canonical URL, adapter/resolver ids, `fetchedAt`, optional language,
  SHA-256 content fingerprint, and structured warnings).
- `process` writes `text`/`markdown` by default, or JSON under a versioned
  protocol envelope with `--json`; it accepts a JSON `NormalizedDocument` on
  stdin via `--input-format json` (or a protocol envelope whose `result` is a
  document), preserving v2 provenance through the round trip.
- `process FEED_URL --each` streams JSONL to stdout, one versioned record per
  attempted item.
- `capabilities` writes a versioned envelope (with `--json`) reporting the
  artifact/schema versions and the command, adapter, provider, and resolver
  catalogs. `owlie --version --json` writes a versioned scalar version
  response.
- Results go to stdout; diagnostics and progress go to stderr.

## Feed listings

`owlie list --json` writes `{ collection, items, truncated }` under the
versioned envelope. Entries stay in feed document order; consumers sort.

- `collection.title` and `collection.metadata`: `format` (`"rss"` or
  `"atom"`), and when the feed declares them `description`, `siteUrl` (the
  channel or feed `link`), and `imageUrl`. Atom feeds also keep `subtitle`.
- Each item has `id` (`rss:entry:<entryId>`), `canonicalUrl` (the entry link
  exactly as the feed gives it, with no tracking-parameter removal; consumers
  apply their own canonical form), and when present `title`, `description`
  (HTML-stripped), `publishedAt`, and `author`.
- `item.metadata` carries only identity and media facts, never feed HTML:
  - `entryId` and `entryIdSource`: `"guid"` (RSS 2.0), `"atom-id"`,
    `"rdf-about"` (RSS 1.0), `"link"`, or `"fallback"` (a stable hash when the
    entry has none of those). Entry ids are unchanged by this field.
  - `enclosures`: `[{ url, type?, length? }]` from RSS `<enclosure>` and Atom
    `link rel="enclosure"`; `type` is lowercased and `length` is a
    non-negative integer or omitted.
  - `media`: `[{ url, type?, medium? }]` from `media:content`, kept separate
    because it often holds images or thumbnails.
  - `enclosureUrl` (**deprecated**): the first enclosure URL, else the first
    `media:content` URL. Use `enclosures` instead.
  - `duration` and `categories` when the feed declares them.

The feed batch of `owlie extract` and the records of `process --each` carry the
same allowlisted entry metadata, plus `publishedAt`, on each document as
`metadata.feedEntry`.

## Files and cache

Temporary downloads and intermediate artifacts will eventually use
platform-appropriate cache directories. v0.1 writes no state into the
repository or current working directory unless explicitly requested, and
implements no persistent history or job records.
