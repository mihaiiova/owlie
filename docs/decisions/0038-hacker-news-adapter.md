# ADR 0038 — Hacker News adapter over the official API

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Hacker News was only reachable by accident. `owlie list
https://news.ycombinator.com/rss` went through the generic RSS path, which
keys entries by their external link and carries no HN id, score, author or
comment count. `owlie extract` on an item page went through the article
adapter and returned the whole comment thread as one flattened block. The HN
list pages themselves (front page, newest, best, Ask HN, Show HN) had no
listing. A general-purpose extractor (ADR 0034) should read a discussion URL as
a discussion.

## Decision

- **New adapter `@owlieio/adapter-hackernews`, new source type `hackernews`.**
  It implements both `CollectionAdapter` and `ItemAdapter`. Recognition is pure
  and claims `news.ycombinator.com` `/`, `/news`, `/newest`, `/best`, `/ask`,
  `/show`, `/submitted?id=USER` and `/item?id=N`. `/rss` is not claimed and
  stays on the RSS path. Page parameters (`?p=2`) are ignored.
- **Transport is the official API** (`https://hacker-news.firebaseio.com/v0`),
  which needs no key. Every request goes through the injected `HttpFetcher`,
  so the extraction proxy (ADR 0036), SSRF rules, deadlines and byte budgets
  apply. Responses must declare JSON. Item fetches run five at a time. Algolia's
  HN search API is not used.
- **Identities:** lists `hackernews:list:<top|new|best|ask|show>`, users
  `hackernews:user:<name>`, items `hackernews:item:<id>`, with the HN item page
  as canonical URL.
- **Listing** fetches the id list once, then items in list order until `limit`
  stories are found. Deleted, dead and comment items are skipped. Item fetches
  are capped at `limit × 3`, so a submissions list made mostly of comments
  cannot cause unbounded requests; when the cap stops the listing, the
  collection metadata carries `fetchCapReached: true`. Listed items carry
  `hnId`, `kind` (`story | ask | show | job | poll`), `score` and
  `commentCount` (point-in-time snapshots), and `linkUrl` after safe-URL
  validation.
- **Item extraction** produces a discussion document: a header, the post's own
  text, and the comment tree in HN's ranked order. The tree is read level by
  level within three bounds: top-level comments (default 30, max 100), reply
  levels (default 2, max 3), and comments in total (default 100, max 300).
  Deleted and dead comments are skipped and still use their slot, which keeps
  the number of requests bounded. When comments are left out, the document
  carries an `HN_COMMENTS_TRUNCATED` warning. HN's limited HTML is converted to
  plain text with links kept as URLs and code blocks preserved.
- **`--hn-content discussion|article|both`** (default `discussion`) chooses what
  `extract` reads. `article` reads the linked article through the article
  adapter with the `--article` rules (a text post returns its own text with an
  `HN_NO_LINKED_ARTICLE` warning). `both` writes the article, then the
  discussion, in one document; if the article cannot be read, the discussion
  is kept with an `HN_ARTICLE_UNAVAILABLE` warning instead of failing.
- **Composition happens in `apps/cli`**, not in the adapter: adapters depend
  only on `@owlieio/core` (AGENTS §6). The adapter exposes `fetchStory` (the
  post without comments) and `extract` (the discussion), and the CLI combines
  them with the article adapter.
- `--hn-content` and the comment-bound flags are usage errors on a non-HN URL;
  `--article` and `--feed` are usage errors on an HN URL.

## Consequences

- Adding `hackernews` to `SOURCE_TYPES` is additive and the JSON protocol stays
  at `schemaVersion: 1`, but consumers that check the source-type enum must
  accept the new value.
- HN item pages no longer reach the article adapter, including through
  `owlie process URL` and linked-item feed batches whose entries point at HN
  items: those now yield discussion documents.
- The provenance canonical URL of an HN item loses its `?id=` query to the
  existing redaction rule (as YouTube watch URLs do). The document's own
  `canonicalUrl` and the provenance `sourceId` keep the id.
- Re-reading a story later to pick up new comments, points thresholds and
  keyword search are left to consumers or later work.
