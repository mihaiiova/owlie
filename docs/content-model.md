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

Extraction produces a `NormalizedDocument` with `schemaVersion: 1`, a stable
`id`, `sourceType`, `canonicalUrl`, a `mediaType` (`text` | `transcript` |
`mixed`), the normalized `text`, and optional title/publishedAt/author and
metadata.

Not every document is a transcript:

- YouTube and podcast documents may contain transcripts.
- Reddit and RSS documents contain normalized written text.

## Stable identities

Identities must be stable across runs so callers can correlate items and
deduplicate results. Adapters derive them from canonical URLs and provider
identifiers — never from volatile page structure.

## Discriminated unions

`ProgressEvent` is a discriminated union on `type` (`started`, `progress`,
`item`, `completed`, `failed`, `cancelled`). `SourceType` and `MediaType` are
string-literal unions. Use unions where they improve safety.
