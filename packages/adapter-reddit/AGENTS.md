# AGENTS — @owlieio/adapter-reddit

Local rules for coding agents working in this package. The root `AGENTS.md`
applies first; this file adds Reddit-specific guidance.

## Hard boundaries

1. **Atom transport only.** Convert subreddit URLs to public Reddit Atom feeds.
   Never add Reddit OAuth, API credentials, comment-tree extraction, or HTML
   scraping.
2. **No silent transport fallbacks.** If a feed request fails, surface the
   error; never fall back to scraping Reddit HTML.
3. **Content-aware parsing.** Reddit's `.rss` endpoints return Atom XML. Parser
   selection must inspect the document body, not the file extension.

## Where logic lives

- **URL recognition, normalization, identity, and feed derivation** belong in
  this package (`src/reddit.ts`).
- **XML → parsed-feed parsing** is reused from `@owlieio/adapter-rss`
  (`parseFeed`). Keep Reddit metadata interpretation (turning Atom entries into
  Reddit post metadata) in this package.

## Identities

- Collection identity: `reddit:subreddit:<lowercased-name>`.
- Canonical URL: `https://www.reddit.com/r/<lowercased-name>/`.
- Default sort: `new`.

## Tests

Pure URL and feed-derivation logic must be tested without network access. See
`test/`.
