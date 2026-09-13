# ADR 0020 — Apple Podcasts episode audio resolution

- **Status:** Accepted
- **Date:** 2026-09-12

## Context

Apple Podcasts episode pages do not reliably expose an audio enclosure in their
HTML. Apple episode URLs contain stable podcast and episode identifiers, while
the public iTunes lookup endpoint exposes structured episode and feed metadata.

## Decision

- Add `ApplePodcastsResolver` behind `PodcastAudioResolver` in
  `adapter-podcast`.
- Recognize only HTTPS `podcasts.apple.com` episode URLs with a podcast `id…`
  path segment and numeric `i` episode parameter. Preserve the URL's country
  code for the lookup request.
- Query `https://itunes.apple.com/lookup` with the podcast id,
  `entity=podcastEpisode`, and country. Match the requested episode id and use
  its `episodeUrl`.
- If lookup does not provide that URL, fetch the lookup-provided RSS feed through
  the same injected safe `HttpFetcher` and select the matching item's enclosure.
- Return `{ mediaUrl, metadata: { title?, resolvedFrom: 'apple' } }`; retain
  the existing bounded download and local transcription pipeline unchanged.

## Consequences

Apple Podcasts episode URLs are a supported `owlie extract` input without
credentials or page scraping. Apple listing, podcast-level URLs without an
episode id, authenticated endpoints, and other provider-specific resolvers
remain out of scope.
