# Product scope

Owlie CLI is an open-source, general-purpose web content extractor: given a
URL (an article, a PDF, an arXiv or bioRxiv/medRxiv paper, a video, a podcast episode, a feed, or a discussion), it
returns normalized, provenance-stamped content for people and programs, and can
process it with an LLM. This document separates what exists now, what the v0.1
milestone delivers, what is deferred, and what belongs to consuming products.

## Scaffold scope (current)

- Monorepo tooling: pnpm workspaces, TypeScript, Vitest, ESLint, Prettier,
  Changesets, GitHub Actions CI.
- `@owlieio/core` provider-neutral contracts and types.
- Adapter URL recognition/normalization (YouTube, podcast media, Apple Podcasts
  episodes, and declarative episode pages, RSS/Atom, Hacker News, Reddit).
- Local faster-whisper provider with explicit configuration and no network
  calls. (OpenAI is functional in v0.1; see below.)
- `@owlieio/testing` fakes, fixtures, and contract-test helpers.
- `owlie` CLI with functional `--help`, `--version`, and `doctor`.
- Full documentation and ADRs.

## v0.1 scope (the first functional milestone)

v0.1 is a deliberately small, pipe-first slice. The functional commands are:

- `owlie extract URL` — extract an article page (declared by `og:type` or
  JSON-LD, or with a long readable body), a PDF (a link or a local file;
  ADR 0039), an available transcript from an
  individual YouTube video, a direct podcast media URL, Apple Podcasts episode
  URL, or declarative server-rendered episode page (local faster-whisper,
  chunked), or the bounded linked items of an RSS/Atom feed — supplied as a
  feed URL or a non-article HTML page URL that exposes one — as normalized
  documents. A Hacker News item URL yields its discussion (the post and a
  bounded comment tree), its linked article, or both, chosen with
  `--hn-content` (ADR 0038). `--article` and `--feed` force either page path (ADR 0035). Optional
  `--podcast-media`/`--podcast-page`/`--podcast-apple` flags select the audio
  resolver explicitly (authoritative, no fallback). Direct podcast-media
  extraction accepts positive-integer `--timeout-ms` (one deadline shared by
  resolution, download, probing, transcoding, and transcription) and
  `--max-media-bytes` (a bounded media download, preserving the safe default
  when omitted); cancellation terminates active local commands and cleans their
  temporary artifacts.
- `owlie resolve URL [--podcast-media | --podcast-page | --podcast-apple] [--json]` —
  resolve a URL to its validated audio media URL without downloading or
  transcribing, for consumers that run their own transcription.
- `owlie list URL [--limit N] [--json]` — list bounded entries of an
  RSS/Atom feed, supplied as a feed URL or an HTML page URL that exposes one,
  or the stories of a Hacker News list (front page, newest, best, Ask HN,
  Show HN, or a user's submissions) through the official HN API.
- `owlie process [FILE] --prompt "..."` — process plain text, a local PDF, or a
  normalized document with DeepSeek or OpenAI, reading from a positional file,
  `--input FILE`, or stdin. Model selection is `--model provider/model-id` (self-contained),
  or a plain `--model id` with the deprecated `--provider` alias,
  `OWLIE_PROVIDER`, or the saved active provider.
- `owlie models [--provider <provider>] [--refresh] [--json]` — list a
  provider's (or all configured providers') current models from its live
  listing, cached for one hour with a forced-refresh flag and cache-on-failure
  fallback.
- `owlie auth add|list|remove <provider>` — manage API keys in the user-level
  credential store without revealing secrets.
- `owlie process FEED_URL --each [--limit N] --prompt "..."` — process the
  bounded linked items of an RSS/Atom feed (direct URL or discovered page)
  sequentially, streaming one JSONL record per attempted item.
- `owlie doctor` — report whether required dependencies and variables are
  present.
- `owlie --help` / `owlie --version`.

These compose over Unix pipes:

```bash
owlie extract URL | owlie process --prompt "Summarize this"
owlie extract URL --json | owlie process --input-format json --prompt "..." --json
```

Output serialization in v0.1: `text` (raw), `markdown`, and `json`. `jsonl`
is used by `process --each` to stream one record per attempted feed item;
other commands do not use `jsonl`.

## Planned sources

Individual items:

- YouTube video (v0.1)
- Article page (`owlie extract URL`, `process URL`, and linked-item feed
  extraction)
- PDF document, from a URL or a local file (read as an article; scanned PDFs
  without a text layer are not supported)
- arXiv paper: metadata, abstract, and the paper from its HTML render or PDF
  (`owlie extract`)
- bioRxiv or medRxiv preprint: metadata, abstract, and the preprint from its
  full-text page or PDF (`owlie extract`)
- Podcast direct-media URL, Apple Podcasts episode URL, or declarative server-rendered episode page (v0.1)
- Reddit post, discovered through a subreddit feed (deferred)
- RSS/Atom entry (bounded feed extraction via `owlie extract`)
- Hacker News item: discussion, linked article, or both (`owlie extract`)

Collections (deferred — not implemented in v0.1):

- YouTube playlist
- Subreddit (via Reddit's public Atom feeds)
- RSS/Atom feed (bounded `owlie list` and `owlie extract`, plus one-hop
  discovery from an HTML page URL, are functional)
- Hacker News front page, newest, best, Ask HN, Show HN, and a user's
  submissions (bounded `owlie list` is functional)
- arXiv category announcements and API search queries (bounded `owlie list`
  and `owlie extract` are functional)
- bioRxiv and medRxiv subjects and whole servers, last 14 days (bounded
  `owlie list` and `owlie extract` are functional)

## Planned operations

- `extract` normalized text from an individual item (article page, YouTube
  video, or podcast) or the bounded linked items of an RSS/Atom feed (direct URL or discovered
  page)
- `process` a document with an LLM (v0.1: DeepSeek or OpenAI)
- `process` each item in a bounded RSS/Atom feed with an LLM, streaming one
  JSONL record per item
- `list` items in a collection (RSS/Atom feeds, direct or discovered, and
  Hacker News lists)
- `search` collection item titles, descriptions, and feed-provided content
  (deferred)
- `extract` a transcript from podcast media, an Apple Podcasts episode, or a
  declarative episode page via local Whisper (v0.1)
- `process` each item in other (non-feed) collections with an LLM (deferred)

Owlie CLI does **not** monitor sources or schedule recurring work.

## Non-goals

Owlie CLI does not provide:

- a web UI, authentication, billing, or credits
- source monitoring, schedules, or cron
- a local database or persistent job records
- Reddit OAuth, comment-tree extraction, or HTML scraping
- generic webpage crawling or browser-rendered extraction (the reusable
  `article` adapter is limited to directly supplied, server-rendered editorial
  HTML or PDFs obtained through Owlie's safe HTTP fetcher; feed discovery from a
  supplied page is bounded and one-hop, not a crawl)
- OCR for scanned PDFs, or other binary document formats (DOCX, EPUB)
- telemetry

Those responsibilities, where they exist at all, belong to the products that
use Owlie (see [Consumer responsibilities](#consumer-responsibilities)).

## Deferred capabilities

- Collection search (`search`) and `owlie run`. Bounded RSS/Atom `list` and
  `process --each` are functional; collection search remains deferred.
- Source monitoring and scheduled/recurring execution.
- Podcast provider-specific resolution other than Apple Podcasts, podcast feeds,
  Reddit, diarization, streaming transcription, and managed Whisper APIs. Direct
  podcast media URLs, Apple Podcasts episode URLs, and declarative server-rendered
  episode pages are functional. RSS/Atom entry
  extraction (the adapter's `extract`) remains deferred; its bounded `list` is
  functional.
- A local database or persistent job records.
- Reddit OAuth, credentials, comment-tree extraction, and HTML scraping.
- Hacker News keyword search (Algolia), points thresholds, and re-reading a
  story later for new comments.
- Following external links from RSS entries, generic crawling, and browser-rendered
  webpage extraction. A Hacker News item's own linked article, read with
  `--hn-content article|both`, is the one followed link. The reusable static `article` adapter is the narrow
  exception: it extracts a directly supplied safe HTTP(S) editorial page from
  server-rendered HTML only, through `extract URL`, `process URL`, and
  linked-item feed extraction. Universal `extract` dispatch (article page,
  YouTube video, podcast media, Apple Podcasts episode, or declarative episode
  page, or bounded feed) is functional in v0.1, and a supplied non-article
  HTML page URL is discovered for its feed in bounded one hop.
- Automatic package publishing and Windows support guarantees.

## Consumer responsibilities

Products that run Owlie (the private `owlie-app` is the first) own the web UI,
authentication and users, billing and credits, persistence, job queues and
workers, source monitoring and schedules, notifications, media storage and
delivery, analytics, administrative functionality, and cloud deployment. None
of these appear in `owlie-cli`.
