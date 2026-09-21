# Content model

Owlie models **collections** and **items** separately, with a provider-neutral
`NormalizedDocument` as the extraction output.

## Collections

| Source           | Identity example                |
| ---------------- | ------------------------------- |
| YouTube playlist | `youtube:playlist:<id>`         |
| Subreddit        | `reddit:subreddit:<lowercased>` |
| RSS/Atom feed    | `rss:feed:<canonical-url>`      |

A collection has a stable `id`, a `sourceType`, a `canonicalUrl`, an optional
title, and `metadata`.

## Items

| Source          | Identity example        |
| --------------- | ----------------------- |
| YouTube video   | `youtube:video:<id>`    |
| Podcast episode | `podcast:episode:<url>` |
| Reddit post     | derived from feed entry |
| RSS/Atom entry  | derived from feed entry |

An item has a stable `id`, a `sourceType`, a `canonicalUrl`, optional
title/description/publishedAt/author, and `metadata`.

## Normalized documents

Extraction produces a `NormalizedDocument` with `schemaVersion: 2`, a stable
`id`, `sourceType`, `canonicalUrl`, a `mediaType` (`text` | `transcript` |
`mixed`), the normalized `text`, optional title/publishedAt/author and
metadata, and a required first-class `provenance` field.

Not every document is a transcript:

- YouTube and podcast documents may contain transcripts.
- Reddit and RSS documents contain normalized written text.
- Local documents (`sourceType: 'local'`) contain user-supplied text with no
  remote canonical URL (represented as an empty string). Their identity is
  `local:stdin` for piped stdin or `local:file:<normalized-absolute-path>` for
  a text file.

### Provenance

Every v2 document carries `provenance` with:

- `sourceId` — the stable idempotency identity, distinct from the content
  fingerprint. Adapter item identities remain authoritative; podcast resolver
  extraction derives it from the canonical supplied locator (never the
  resolved/signed media URL).
- `canonicalUrl` — the redacted canonical source URL (no userinfo, query, or
  fragment).
- `adapterId` — the adapter that produced the document.
- `resolverId` — the selected podcast resolver, when resolver extraction
  produced it.
- `fetchedAt` — the ISO-8601 UTC timestamp stamped once at the CLI boundary.
- `language` — the normalized transcript language when available.
- `contentFingerprint` — `{ algorithm: "sha256", digest }` over the exact
  normalized document `text` UTF-8 bytes (source identity and mutable metadata
  are excluded).
- `warnings` — structured `{ code, message }` entries (for example
  `ARTICLE_FALLBACK`).

## Stable identities

Identities must be stable across runs so callers can correlate items and
deduplicate results. Adapters derive them from canonical URLs and provider
identifiers — never from volatile page structure. Local documents derive their
identity from the resolved input (stdin or the normalized absolute file path),
which stays stable for the same input.

## Discriminated unions

`ProgressEvent` is a discriminated union on `type` (`started`, `progress`,
`item`, `completed`, `failed`, `cancelled`). `SourceType` and `MediaType` are
string-literal unions. Use unions where they improve safety.
